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
const html = () => read("index.html");
const head = () => html().split("</head>")[0];

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

  const urls = [...html().matchAll(/https?:\/\/[^"'\s<>\\)]+/g)].map((m) => m[0]);
  const foreign = urls.filter((url) => !allowed.some((ok) => url.startsWith(ok)));

  assert.deepEqual(
    [...new Set(foreign)],
    [],
    "these are served by someone else and would leak visitors to them",
  );
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
