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
  { route: "/about/", file: "about/index.html" },
];

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

test("the structured data parses and claims nothing untrue", { skip }, () => {
  const raw = head().match(
    /<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/s,
  )?.[1];
  assert.ok(raw, "no JSON-LD on the page");

  const data = JSON.parse(raw.replaceAll("&quot;", '"'));
  assert.equal(data["@type"], "WebApplication");
  assert.ok(data.url?.startsWith("https://"));
  assert.ok(data.image?.startsWith("https://"));

  // The interface is English. Advertising Sinhala and Tamil versions that do
  // not exist misleads crawlers and the people they send here.
  const languages = [data.inLanguage].flat();
  assert.deepEqual(languages, ["en"], "only claim languages the page is actually in");
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

test("the written pages are readable without JavaScript", { skip }, () => {
  // The app itself cannot be — it needs WebCrypto and a camera — but a page
  // explaining how it works should reach a crawler as prose, not a spinner.
  for (const file of ["how-it-works/index.html", "about/index.html"]) {
    const body = html(file).split("<body")[1] ?? "";
    const text = body.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
    assert.ok(
      text.replace(/\s+/g, " ").trim().length > 1500,
      `${file} renders almost no text without scripts`,
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
