"use strict";

/**
 * The LAN host serves the build directory to every device on the network, so
 * it must serve that directory and nothing else. These are regression tests
 * for a prefix comparison that used to let `/../outsider/secret.txt` escape
 * into a sibling directory, and for a malformed percent-escape that used to
 * take the whole process down.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { execFile } = require("node:child_process");

const REPO = path.join(__dirname, "..");
const OUT = path.join(REPO, "out");
const SIBLING = path.join(REPO, "outsider");
const SECRET = "TOP-SECRET-NOT-FOR-THE-NETWORK";

/** Sends a raw request line so nothing normalises the path on the way in. */
function rawGet(port, requestPath) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1", () => {
      socket.write(`GET ${requestPath} HTTP/1.1\r\nHost: t\r\nConnection: close\r\n\r\n`);
    });
    let buffer = "";
    socket.setTimeout(5_000, () => socket.destroy(new Error("timed out")));
    socket.on("data", (chunk) => (buffer += chunk));
    socket.on("error", reject);
    socket.on("end", () => {
      const [head, ...rest] = buffer.split("\r\n\r\n");
      resolve({ status: Number(head.split(" ")[1]), body: rest.join("\r\n\r\n") });
    });
  });
}

function startHost() {
  return new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [path.join(REPO, "server", "lan.js")], {
      env: { ...process.env, PORT: "0" },
    });
    let log = "";
    const onData = (chunk) => {
      log += chunk;
      const match = /http:\/\/localhost:(\d+)/.exec(log);
      if (match) resolve({ child, port: Number(match[1]) });
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => reject(new Error(`host exited early (${code}): ${log}`)));
  });
}

const built = fs.existsSync(path.join(OUT, "index.html"));

test(
  "the LAN host serves the build directory and nothing outside it",
  { skip: built ? false : "run `npm run build` first" },
  async (t) => {
    fs.mkdirSync(SIBLING, { recursive: true });
    fs.writeFileSync(path.join(SIBLING, "secret.txt"), SECRET);
    t.after(() => fs.rmSync(SIBLING, { recursive: true, force: true }));

    const { child, port } = await startHost();
    t.after(() => child.kill());

    await t.test("a real asset is served", async () => {
      const response = await rawGet(port, "/robots.txt");
      assert.equal(response.status, 200);
      assert.match(response.body, /User-agent/);
    });

    await t.test("climbing out of the build directory is refused", async () => {
      // `outsider` shares a prefix with `out`, which is what defeated the old
      // `startsWith(ROOT)` check.
      for (const attempt of [
        "/../outsider/secret.txt",
        "/./../outsider/secret.txt",
        "/_next/../../outsider/secret.txt",
        "/..%2Foutsider%2Fsecret.txt",
        "/%2e%2e/outsider/secret.txt",
      ]) {
        const response = await rawGet(port, attempt);
        assert.ok(
          !response.body.includes(SECRET),
          `${attempt} leaked a file from outside the build directory`,
        );
      }
    });

    await t.test("a malformed percent-escape does not take the host down", async () => {
      const response = await rawGet(port, "/%E0%A4%A");
      assert.equal(response.status, 404);

      // Still answering afterwards is the whole point.
      assert.equal((await rawGet(port, "/robots.txt")).status, 200);
    });

    await t.test("an unknown route falls back to the app", async () => {
      const response = await rawGet(port, "/some/deep/route");
      assert.equal(response.status, 200);
      assert.match(response.body, /<html/);
    });
  },
);
