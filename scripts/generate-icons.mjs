/**
 * Builds every raster the site needs from one source image.
 *
 *   npm run icons
 *
 * Source of truth is assets/logo.png. Replace that file and re-run this to
 * change the favicon, the installed-app icons and the social card together —
 * nothing else has to be edited, and nothing is fetched from a third party at
 * page load, which matters for an app whose whole claim is that it keeps no
 * record of you.
 *
 * The artwork is a square containing a ship above a "ferry" wordmark. At
 * favicon sizes that wordmark turns to mush, so the small icons are cut from
 * the ship alone while the social card, which is read at size, uses the whole
 * thing. GRAPHIC below is where the ship sits in the source.
 */

import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(root, "assets", "logo.png");
const OUT = path.join(root, "public");

/** Where the ship sits in the 672px source, measured from its ink profile. */
const GRAPHIC = { left: 74, top: 76, width: 524, height: 372 };

/**
 * Breathing room around the ship, as a fraction of its longest side. The
 * artwork runs edge to edge — the phone on one side, the laptop on the other —
 * and without this they collide with the icon's border once it is rounded off.
 */
const MARGIN = 0.07;

/** Brand colours, matching tailwind.config.ts. */
const HULL_950 = "#061217";
const HULL_300 = "#8FAEB2";
const SEA_500 = "#17A292";
const SEA_300 = "#6FD5C6";
const SIGNAL_400 = "#F7C445";
const PAPER = "#FFFFFF";

/** The ship on its own, padded back out to a square. */
async function shipMark() {
  const margin = Math.round(Math.max(GRAPHIC.width, GRAPHIC.height) * MARGIN);
  const side = Math.max(GRAPHIC.width, GRAPHIC.height) + margin * 2;
  const padX = Math.round((side - GRAPHIC.width) / 2);
  const padY = Math.round((side - GRAPHIC.height) / 2);

  return sharp(SOURCE)
    .extract(GRAPHIC)
    .extend({
      top: padY,
      bottom: side - GRAPHIC.height - padY,
      left: padX,
      right: side - GRAPHIC.width - padX,
      background: PAPER,
    })
    .png()
    .toBuffer();
}

const roundedMask = (size, radius) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`,
  );

/** A square PNG of the given size, flattened onto white. */
async function square(source, size) {
  return sharp(source)
    .resize(size, size, { fit: "contain", background: PAPER })
    .flatten({ background: PAPER })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * ICO, one 32px PNG inside it. Modern browsers take the PNGs declared in the
 * markup; this is for the ones that still guess at /favicon.ico.
 */
function ico(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0); // width, 0 meaning 256
  entry.writeUInt8(size === 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // palette size
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  return Buffer.concat([header, entry, png]);
}

/**
 * A maskable icon is cropped to a circle by the launcher, so the artwork has
 * to sit inside the middle 80% or the ship loses its bow.
 */
async function maskable(mark, size) {
  const inner = Math.round(size * 0.72);
  const inset = Math.round((size - inner) / 2);
  return sharp({
    create: { width: size, height: size, channels: 4, background: PAPER },
  })
    .composite([{ input: await square(mark, inner), top: inset, left: inset }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * The share banner: 1200x630, which is the shape WhatsApp, Slack, X and the
 * rest crop to.
 *
 * Written as a palette PNG. WhatsApp quietly drops the preview image when it
 * is much over 300 KB, and the full-colour version of this card lands close
 * enough to that to be worth not risking; the palette version is a quarter of
 * the size with no visible banding, and unlike JPEG it leaves the text crisp.
 */
async function socialCard() {
  const W = 1200;
  const H = 630;
  const TILE = 372;

  const tile = await sharp(await square(SOURCE, TILE))
    .composite([{ input: roundedMask(TILE, 52), blend: "dest-in" }])
    .png()
    .toBuffer();

  const backdrop = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
      <rect width="${W}" height="${H}" fill="${HULL_950}"/>
      <rect x="0" y="0" width="${W}" height="8" fill="${SIGNAL_400}"/>
      <g font-family="DejaVu Sans, Verdana, sans-serif">
        <text x="536" y="232" font-size="60" font-weight="bold" fill="${PAPER}">Hand it to your</text>
        <text x="536" y="304" font-size="60" font-weight="bold" fill="${PAPER}">other device.</text>
        <text x="536" y="372" font-size="29" fill="${HULL_300}">A password, a paragraph, a file —</text>
        <text x="536" y="412" font-size="29" fill="${HULL_300}">straight across, in seconds.</text>

        <!-- Pill width measured against the rendered text: at 22px this line
             is 519px wide, so 557 leaves an even 24px inset either side. -->
        <g transform="translate(536,452)">
          <rect x="0" y="0" width="557" height="46" rx="23" fill="${SEA_500}" fill-opacity="0.16"/>
          <text x="24" y="31" font-size="22" font-weight="bold" fill="${SEA_300}">End-to-end encrypted · No account · Free</text>
        </g>

        <text x="536" y="556" font-size="25" font-weight="bold" fill="${SIGNAL_400}">ferry-share.github.io</text>
      </g>
    </svg>`);

  return sharp(backdrop)
    .composite([{ input: tile, top: Math.round((H - TILE) / 2), left: 92 }])
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
}

async function main() {
  await fs.access(SOURCE).catch(() => {
    throw new Error(`No source artwork at ${path.relative(root, SOURCE)}`);
  });

  const mark = await shipMark();
  const written = [];

  const write = async (name, buffer) => {
    await fs.writeFile(path.join(OUT, name), buffer);
    const { width, height } = await sharp(buffer).metadata().catch(() => ({}));
    written.push(
      `  ${name.padEnd(24)} ${width ? `${width}x${height}`.padEnd(10) : "".padEnd(10)} ${
        (buffer.length / 1024).toFixed(1)
      } KB`,
    );
  };

  const favicon = await square(mark, 32);
  await write("favicon.ico", ico(favicon, 32));
  await write("icon-32.png", favicon);
  await write("icon-192.png", await square(mark, 192));
  await write("icon-512.png", await square(mark, 512));
  await write("icon-maskable.png", await maskable(mark, 512));
  await write("apple-touch-icon.png", await square(mark, 180));
  await write("logo.png", await square(mark, 256));
  await write("opengraph-image.png", await socialCard());

  console.log(`Generated from ${path.relative(root, SOURCE)}:`);
  console.log(written.join("\n"));
}

await main();
