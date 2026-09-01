"use strict";

/**
 * Ferry LAN host.
 *
 * Serves the exported front end and the relay from a single Node process, so
 * two devices on the same Wi-Fi can pair without anything leaving the network.
 *
 *   npm run lan
 *
 * Then open the printed http://192.168.x.x:8080 address on both devices.
 *
 * Note on cameras: browsers only expose getUserMedia on secure origins, so QR
 * scanning is unavailable over plain http on a LAN address. Type the ten
 * character code instead, or put the app behind HTTPS.
 */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { attachRelay, stats } = require("./relay");

const PORT = Number(process.env.PORT || 8080);
const ROOT = path.resolve(__dirname, "..", "out");
// Compared against with the separator attached: a bare prefix test would also
// accept a sibling directory whose name merely starts with "out".
const ROOT_PREFIX = ROOT + path.sep;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

if (!fs.existsSync(ROOT)) {
  console.error("No build found at ./out — run `npm run build` first.");
  process.exit(1);
}

function resolve(urlPath) {
  let clean;
  try {
    clean = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  } catch {
    // A malformed percent-escape is a bad request, not a reason to fall over.
    return null;
  }

  const target = path.resolve(ROOT, "." + path.posix.resolve("/", clean));
  // Refuse anything that tries to climb out of the build directory. ROOT
  // itself is allowed; everything else must sit strictly beneath it.
  if (target !== ROOT && !target.startsWith(ROOT_PREFIX)) return null;

  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    const index = path.join(target, "index.html");
    return fs.existsSync(index) ? index : null;
  }
  if (fs.existsSync(target)) return target;

  const withHtml = `${target}.html`;
  if (fs.existsSync(withHtml)) return withHtml;

  return path.join(ROOT, "index.html");
}

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, ...stats() }));
    return;
  }

  const file = resolve(request.url || "/");
  if (!file || !fs.existsSync(file)) {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("Not found");
    return;
  }

  const ext = path.extname(file);
  const immutable = file.includes(`${path.sep}_next${path.sep}static${path.sep}`);

  response.writeHead(200, {
    "content-type": MIME[ext] || "application/octet-stream",
    "cache-control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });
  fs.createReadStream(file).pipe(response);
});

attachRelay(server);

server.listen(PORT, "0.0.0.0", () => {
  // Report the port actually bound, which differs from PORT whenever the
  // caller asked for an ephemeral one.
  const port = server.address().port;
  const addresses = [];
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const details of interfaces || []) {
      if (details.family === "IPv4" && !details.internal) addresses.push(details.address);
    }
  }

  console.log("\n  Ferry is running on this network\n");
  console.log(`    On this machine   http://localhost:${port}`);
  for (const address of addresses) {
    console.log(`    On other devices  http://${address}:${port}`);
  }
  console.log("\n  Relay and front end are served together. Press Ctrl+C to stop.\n");
});
