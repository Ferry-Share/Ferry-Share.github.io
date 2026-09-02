/**
 * What the built page tells search engines and social platforms.
 *
 * These assert the *output*, not the source, because that is what crawlers
 * read — and because the tags that matter here fail silently. A wrong image
 * size or a stale canonical costs nothing at build time and everything in a
 * link preview.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "out");
const built = fs.existsSync(path.join(out, "index.html"));
const skip = built ? false : "run `npm run build` first";

const read = (file) => fs.readFileSync(path.join(out, file), "utf8");
const html = (page = "index.html") => read(page);
const head = (page) => html(page).split("</head>")[0];

/** Every page the site publishes, and where its HTML lands in the export. */
const PAGES = [
  { route: "/", file: "index.html" },
  { route: "/how-it-works/", file: "how-it-works/index.html" },
  { route: "/faq/", file: "faq/index.html" },
  { route: "/compare/", file: "compare/index.html" },
  { route: "/about/", file: "about/index.html" },
];

/** Every JSON-LD block on a page, parsed. */
function structuredData(file) {
  return [
    ...html(file).matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs),
  ].map(([, raw]) => JSON.parse(raw.replaceAll("&quot;", '"')));
}

/** Everything a reader would see with scripts switched off. */
function textWithoutScripts(file) {
  const body = html(file).split("<body")[1] ?? "";
  return body
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Width and height straight out of a PNG's IHDR chunk. */
function pngSize(file) {
  const buf = fs.readFileSync(path.join(out, file));
  assert.equal(buf.subarray(1, 4).toString(), "PNG", `${file} is not a PNG`);
  assert.equal(buf.subarray(12, 16).toString(), "IHDR", `${file} has no IHDR`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const attr = (source, re) => (source.match(re) ?? [])[1];

test("nothing on the page is fetched from a third party", { skip }, () => {
  // The whole point of Ferry is that it keeps no record of anyone. A logo,
  // font or script pulled from someone else's host would hand that host the
  // address of every visitor, quietly, on every page load.
  const allowed = [
    "https://ferry-share.github.io", // our own absolute URLs
    "https://schema.org", // the JSON-LD vocabulary, never fetched
    "http://www.w3.org", // SVG namespaces
  ];

  const allowedLinks = ["https://github.com/"]; // credited, never fetched

  for (const { file } of PAGES) {
    const urls = [...html(file).matchAll(/https?:\/\/[^"'\s<>\\)]+/g)].map((m) => m[0]);
    const foreign = urls.filter(
      (url) => ![...allowed, ...allowedLinks].some((ok) => url.startsWith(ok)),
    );
    assert.deepEqual(
      [...new Set(foreign)],
      [],
      `${file} pulls from someone else, which would leak visitors to them`,
    );
  }
});

test("the page states which address is canonical", { skip }, () => {
  const canonical = attr(head(), /<link rel="canonical" href="([^"]+)"/);
  assert.equal(canonical, "https://ferry-share.github.io/");
});

test("the social card is declared at the size it actually is", { skip }, () => {
  const source = head();
  const image = attr(source, /<meta property="og:image" content="([^"]+)"/);
  assert.ok(image?.startsWith("https://"), "og:image must be an absolute URL");

  const declared = {
    width: Number(attr(source, /<meta property="og:image:width" content="([^"]+)"/)),
    height: Number(attr(source, /<meta property="og:image:height" content="([^"]+)"/)),
  };
  // Declaring 1200x630 for a square logo is what makes a preview crop the
  // artwork in half, and nothing warns you.
  assert.deepEqual(declared, { width: 1200, height: 630 });
  assert.deepEqual(pngSize("opengraph-image.png"), declared, "the file must match");

  assert.ok(attr(source, /<meta property="og:image:alt" content="([^"]+)"/), "needs alt text");
  assert.equal(
    attr(source, /<meta name="twitter:card" content="([^"]+)"/),
    "summary_large_image",
  );
});

test("every icon the markup promises exists at the size it claims", { skip }, () => {
  const source = head();

  for (const [, href, size] of source.matchAll(
    /<link rel="icon" href="([^"]+)" sizes="(\d+)x\d+"/g,
  )) {
    const file = href.replace(/^\//, "");
    assert.ok(fs.existsSync(path.join(out, file)), `${file} is referenced but missing`);
    assert.equal(pngSize(file).width, Number(size), `${file} is not ${size}px`);
  }

  // iOS reads neither WebP nor SVG for this one, so it has to be a PNG.
  const apple = attr(source, /<link rel="apple-touch-icon" href="([^"]+)"/);
  assert.ok(apple?.endsWith(".png"), "apple-touch-icon must be a PNG");
  assert.deepEqual(pngSize(apple.replace(/^\//, "")), { width: 180, height: 180 });

  const shortcut = attr(source, /<link rel="shortcut icon" href="([^"]+)"/);
  assert.ok(fs.existsSync(path.join(out, shortcut.replace(/^\//, ""))), "favicon.ico missing");
});

test("robots.txt points crawlers at the sitemap absolutely", { skip }, () => {
  const robots = read("robots.txt");
  const sitemap = robots.match(/^Sitemap:\s*(\S+)$/m)?.[1];
  // A relative Sitemap line parses fine and is then ignored by every crawler.
  assert.ok(sitemap?.startsWith("https://"), `Sitemap must be absolute, got ${sitemap}`);
  assert.match(robots, /^User-Agent:\s*\*/mi);
});

test("the sitemap lists the site's own address", { skip }, () => {
  const sitemap = read("sitemap.xml");
  assert.match(sitemap, /<loc>https:\/\/ferry-share\.github\.io\/?<\/loc>/);
  // A lastmod that moves with every build claims the content changed when
  // only the build did.
  assert.ok(!sitemap.includes("<lastmod>"), "no lastmod on a page that has not changed");
});

test("the structured data parses and describes one coherent thing", { skip }, () => {
  const blocks = structuredData("index.html");
  assert.ok(blocks.length, "no JSON-LD on the front page");

  // The site-wide description is a @graph: separate nodes that reference each
  // other by @id, which is what turns four claims into a description of one
  // thing rather than four unrelated ones.
  const graph = blocks.find((block) => Array.isArray(block["@graph"]))?.["@graph"];
  assert.ok(graph, "the front page carries no @graph");

  const typed = (type) =>
    graph.find((node) => [node["@type"]].flat().includes(type));

  const app = typed("WebApplication");
  assert.ok(app, "nothing on the page says this is an application");
  assert.ok(app.url?.startsWith("https://"));
  assert.ok(app.image?.startsWith("https://"));
  assert.ok(app.featureList?.length > 3, "an app with no listed features is a blank entry");
  assert.equal(app.offers.price, "0", "it is free; leaving the price unstated hides that");
  assert.equal(app.isAccessibleForFree, true);

  // The interface is English. Advertising translations that do not exist
  // misleads crawlers and the people they send here.
  assert.deepEqual(
    [app.inLanguage].flat(),
    ["en"],
    "only claim languages the page is actually in",
  );

  // Nobody has rated Ferry and nothing counts its downloads. A review count
  // invented to win a rich result is a lie told to every person who reads it.
  for (const node of graph) {
    assert.ok(!node.aggregateRating, "there is no rating to report");
    assert.ok(!node.review, "there are no reviews to report");
  }

  // Every cross-reference has to land on a node that exists, or the graph
  // describes things that are not there.
  const ids = new Set(graph.map((node) => node["@id"]).filter(Boolean));
  const refs = [...JSON.stringify(graph).matchAll(/\{"@id":"([^"]+)"\}/g)].map((m) => m[1]);
  for (const ref of refs) {
    assert.ok(ids.has(ref), `${ref} is referenced but defined nowhere`);
  }

  assert.ok(typed("WebSite"), "nothing identifies the site itself");
  assert.ok(typed("Person"), "nothing says who made it");
});

test("every page's structured data parses and knows its own address", { skip }, () => {
  for (const { route, file } of PAGES) {
    const blocks = structuredData(file);
    assert.ok(blocks.length, `${file} carries no structured data at all`);

    for (const block of blocks) {
      assert.ok(block["@context"], `a block on ${file} has no @context`);
    }

    // A breadcrumb trail on the front page would be a trail of one. Every
    // other page needs one, and its last step must be the page itself.
    if (route === "/") continue;

    const crumbs = blocks.find((block) => block["@type"] === "BreadcrumbList");
    assert.ok(crumbs, `${file} has no breadcrumb trail`);
    const last = crumbs.itemListElement.at(-1);
    assert.equal(
      last.item,
      `https://ferry-share.github.io${route}`,
      `${file} ends its breadcrumbs somewhere else`,
    );
  }
});

test("the marked-up answers are the answers on the page", { skip }, () => {
  // Marking up answers a visitor cannot see is both against the spec and
  // pointless: the whole value is that one set of words is quotable by a
  // search engine and readable by a person.
  const faq = structuredData("faq/index.html").find(
    (block) => block["@type"] === "FAQPage",
  );
  assert.ok(faq, "the FAQ page carries no FAQPage data");
  assert.ok(faq.mainEntity.length >= 10, "a handful of questions is not an FAQ");

  const visible = textWithoutScripts("faq/index.html");
  for (const { name, acceptedAnswer } of faq.mainEntity) {
    assert.ok(visible.includes(name), `"${name}" is marked up but not on the page`);
    assert.ok(
      visible.includes(acceptedAnswer.text),
      `the answer to "${name}" is marked up but not on the page`,
    );
  }
});

test("the manifest installs with self-hosted icons", { skip }, () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  assert.ok(manifest.icons?.length, "no icons in the manifest");

  for (const icon of manifest.icons) {
    assert.ok(!/^https?:/.test(icon.src), `${icon.src} is remote`);
    const [w, h] = icon.sizes.split("x").map(Number);
    assert.deepEqual(pngSize(icon.src), { width: w, height: h }, `${icon.src} size`);
  }

  // Android crops the icon to whatever shape the launcher uses; without a
  // maskable one it crops the artwork instead of padding around it.
  assert.ok(
    manifest.icons.some((i) => i.purpose === "maskable"),
    "needs a maskable icon or launchers will crop the ship",
  );
});

/* ---------------------------------------------------------------- */
/* Sharing, and the written pages                                    */
/* ---------------------------------------------------------------- */

test("the share banner is small enough for WhatsApp to fetch", { skip }, () => {
  const bytes = fs.statSync(path.join(out, "opengraph-image.png")).size;
  // WhatsApp quietly drops the preview image somewhere around 300 KB — the
  // link still previews, just with no picture, and nothing tells you why.
  assert.ok(
    bytes < 300 * 1024,
    `the banner is ${(bytes / 1024).toFixed(0)} KB; WhatsApp starts dropping it near 300 KB`,
  );
  assert.equal(
    attr(head("index.html"), /<meta property="og:image:type" content="([^"]+)"/),
    "image/png",
    "declare the type or some scrapers guess wrong",
  );
});

test("every page carries its own title, description and canonical", { skip }, () => {
  const seen = new Set();

  for (const { route, file } of PAGES) {
    const source = head(file);

    const title = source.match(/<title>([^<]+)<\/title>/)?.[1];
    assert.ok(title, `${file} has no title`);
    assert.ok(!seen.has(title), `${file} repeats the title "${title}"`);
    seen.add(title);

    assert.ok(
      attr(source, /<meta name="description" content="([^"]+)"/),
      `${file} has no description`,
    );

    const canonical = attr(source, /<link rel="canonical" href="([^"]+)"/);
    assert.equal(
      canonical,
      `https://ferry-share.github.io${route}`,
      `${file} points its canonical somewhere unexpected`,
    );
  }
});

test("every page is readable without JavaScript", { skip }, () => {
  // The app itself cannot be — it needs WebCrypto, WebRTC and a camera — but
  // the page around it is prose, and prose has no reason to wait for a
  // bundle. This once shipped 157 characters of nothing to anything that does
  // not run scripts, which is most of what reads a page on somebody's behalf.
  for (const { file } of PAGES) {
    assert.ok(
      textWithoutScripts(file).length > 1500,
      `${file} renders almost no text without scripts`,
    );
  }
});

test("the front page says what Ferry is before anything runs", { skip }, () => {
  const text = textWithoutScripts("index.html");

  const heading = html("index.html").match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1];
  assert.ok(heading, "the front page has no h1 until JavaScript runs");

  // The facts anyone deciding whether to use this needs, and anything
  // summarising it needs to get right.
  for (const claim of [
    "end-to-end encrypted",
    "open-source",
    "250 MB",
    "No account",
    "WebCrypto",
  ]) {
    assert.ok(
      text.toLowerCase().includes(claim.toLowerCase()),
      `the front page never mentions "${claim}" without scripts`,
    );
  }
});

test("the sitemap lists every page", { skip }, () => {
  const sitemap = read("sitemap.xml");
  for (const { route } of PAGES) {
    assert.ok(
      sitemap.includes(`<loc>https://ferry-share.github.io${route}</loc>`),
      `${route} is missing from the sitemap`,
    );
  }
});

test("the settings and theme controls are not the same drawing", { skip }, () => {
  // They were: a circle with eight spokes each, sitting next to each other in
  // the header, so the gear read as a second sun.
  const ui = fs.readFileSync(path.join(root, "src/components/ui.tsx"), "utf8");
  const gear = ui.match(/settings: \(([\s\S]*?)\),/)?.[1] ?? "";
  const ferry = fs.readFileSync(path.join(root, "src/components/Ferry.tsx"), "utf8");
  const sun = ferry.match(/function SunGlyph[\s\S]*?\n}/)?.[0] ?? "";

  const paths = (source) => (source.match(/d="([^"]+)"/g) ?? []).join(" ");
  assert.ok(gear && sun, "could not find both icons to compare");
  assert.notEqual(paths(gear), paths(sun), "the two icons share their geometry");

  // The sun is spokes: many short move-and-line pairs. The gear is one closed
  // outline. A closed path is the thing that makes it read as a cog.
  assert.ok(paths(gear).includes("Z"), "the gear should be a closed outline");
});

/* ---------------------------------------------------------------- */
/* What the page tells the crawlers behind AI assistants             */
/* ---------------------------------------------------------------- */

test("robots.txt names the AI crawlers rather than leaving them to a wildcard",
  { skip },
  () => {
    const robots = read("robots.txt");

    // `*` already allows all of these. Naming them is the only unambiguous
    // way a site says it wants to be read and quoted, and it survives being
    // deployed behind a CDN whose bot rules block them by default.
    for (const agent of ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "CCBot"]) {
      assert.match(robots, new RegExp(`^User-Agent:\\s*${agent}$`, "mi"), `${agent} is not named`);
    }

    // A Disallow that reaches everything would quietly undo all of it.
    assert.ok(
      !/^Disallow:\s*\/\s*$/m.test(robots),
      "something disallows the whole site",
    );
  });

test("llms.txt exists and stays in step with the site", { skip }, () => {
  const llms = read("llms.txt");
  assert.match(llms, /^# Ferry/m, "llms.txt should open with the site's name");

  // Every page in the sitemap has to be reachable from it, or an assistant
  // reading only this file misses part of the site.
  for (const { route } of PAGES) {
    assert.ok(
      llms.includes(`https://ferry-share.github.io${route}`),
      `llms.txt does not link ${route}`,
    );
  }

  // The numbers here are claims about the code. If one changes and this file
  // does not, the summary an assistant repeats becomes wrong.
  for (const fact of ["250 MB", "AES-256-GCM", "WebRTC", "MIT"]) {
    assert.ok(llms.includes(fact), `llms.txt does not mention ${fact}`);
  }

  // The limits matter as much as the features: a recommendation that omits
  // them sends people to a tool that cannot do what they asked.
  assert.match(llms, /## Limits/m, "llms.txt states no limits");
});

test("each page's title and description fit in a search result", { skip }, () => {
  for (const { file } of PAGES) {
    const source = head(file);
    const title = source.match(/<title>([^<]+)<\/title>/)[1];
    const description = attr(source, /<meta name="description" content="([^"]+)"/);

    assert.ok(title.length <= 65, `${file}: the title is ${title.length} characters and will be cut`);
    assert.ok(
      description.length >= 70 && description.length <= 170,
      `${file}: the description is ${description.length} characters`,
    );
  }
});

test("the pages link to each other", { skip }, () => {
  // An orphan page is one a crawler has to be told about rather than find,
  // and it carries none of the site's standing with it.
  for (const { route, file } of PAGES) {
    const links = new Set(
      [...html(file).matchAll(/href="(\/[^"]*)"/g)].map(([, href]) => href),
    );
    for (const other of PAGES) {
      if (other.route === route) continue;
      assert.ok(
        links.has(other.route),
        `${file} never links to ${other.route}`,
      );
    }
  }
});

test("the canonical page set is the same everywhere it is listed", { skip }, () => {
  // The sitemap, the navigation and llms.txt are three lists of the same
  // pages maintained in three places. They drift silently.
  const sitemap = read("sitemap.xml");
  const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => loc);
  assert.deepEqual(
    listed.sort(),
    PAGES.map(({ route }) => `https://ferry-share.github.io${route}`).sort(),
    "the sitemap and the built pages disagree about what this site is",
  );
});
