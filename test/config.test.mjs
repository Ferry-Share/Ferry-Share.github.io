/**
 * How Ferry decides which relay to talk to.
 *
 * This is load-bearing: get it wrong and either the app greets people with an
 * empty Settings field, or `npm run lan` quietly sends LAN traffic out to the
 * internet instead of the relay running on the same machine.
 */

import test from "node:test";
import assert from "node:assert/strict";

const SHIPPED = "wss://ferry-relay.inbox-ashen.workers.dev/ws";

/**
 * Loads config.ts against a stubbed browser. The build-time value is read
 * once when the module first runs, so each case needs its own instance — the
 * query string is what gets past the module cache.
 */
let instance = 0;
async function load({ href, envRelay, stored } = {}) {
  const url = new URL(href ?? "https://ferry-share.github.io/");
  const store = new Map();
  if (stored !== undefined) store.set("ferry.relay-url", stored);

  globalThis.window = {
    location: { protocol: url.protocol, host: url.host, hostname: url.hostname },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    },
  };

  if (envRelay === undefined) delete process.env.NEXT_PUBLIC_RELAY_URL;
  else process.env.NEXT_PUBLIC_RELAY_URL = envRelay;

  instance += 1;
  const mod = await import(`../src/lib/config.ts?case=${instance}`);
  return { ...mod, store };
}

test.afterEach(() => {
  delete globalThis.window;
  delete process.env.NEXT_PUBLIC_RELAY_URL;
});

test("with nothing configured, the shipped relay is used", async () => {
  const { getRelayUrl, defaultRelayUrl } = await load();
  assert.equal(defaultRelayUrl(), SHIPPED);
  assert.equal(getRelayUrl(), SHIPPED, "the app must pair without any setup");
});

test("NEXT_PUBLIC_RELAY_URL overrides the shipped relay", async () => {
  const mine = "wss://my-own-relay.example.com/ws";
  const { getRelayUrl } = await load({ envRelay: mine });
  assert.equal(getRelayUrl(), mine, "a fork can bake in its own without editing code");
});

test("an empty or blank build-time value falls back rather than blanking out", async () => {
  for (const envRelay of ["", "   "]) {
    const { getRelayUrl } = await load({ envRelay });
    assert.equal(getRelayUrl(), SHIPPED, `${JSON.stringify(envRelay)} should not win`);
  }
});

test("a relay saved in Settings beats everything else", async () => {
  const theirs = "wss://chosen-by-hand.example.com/ws";
  const { getRelayUrl } = await load({
    envRelay: "wss://baked-in.example.com/ws",
    stored: theirs,
  });
  assert.equal(getRelayUrl(), theirs);
});

test("on a LAN host the relay on the same origin still wins", async () => {
  // `npm run lan` serves the front end and the relay together. Reaching past
  // it to the internet would defeat the point of running it.
  const { getRelayUrl } = await load({ href: "http://192.168.1.42:8080/" });
  assert.equal(getRelayUrl(), "ws://192.168.1.42:8080/ws");

  const secure = await load({ href: "https://ferry.internal.example/" });
  assert.equal(secure.getRelayUrl(), "wss://ferry.internal.example/ws");
});

test("static hosts that cannot run a relay fall through to the shipped one", async () => {
  for (const host of [
    "https://ferry-share.github.io/",
    "https://ferry.pages.dev/",
    "https://ferry.netlify.app/",
    "https://ferry.vercel.app/",
  ]) {
    const { getRelayUrl } = await load({ href: host });
    assert.equal(getRelayUrl(), SHIPPED, `${host} cannot hold a WebSocket open`);
  }
});

test("saving the default clears the override instead of pinning it", async () => {
  const { setRelayUrl, getRelayUrl, store } = await load();
  setRelayUrl("wss://elsewhere.example.com/ws");
  assert.equal(getRelayUrl(), "wss://elsewhere.example.com/ws");

  // Typing the default back in, or clearing the field, should return the
  // browser to following whatever the app ships rather than freezing today's
  // address in local storage.
  setRelayUrl(SHIPPED);
  assert.equal(store.has("ferry.relay-url"), false);
  assert.equal(getRelayUrl(), SHIPPED);

  setRelayUrl("wss://elsewhere.example.com/ws");
  setRelayUrl("   ");
  assert.equal(store.has("ferry.relay-url"), false);
});

test("the shipped relay is a well-formed WebSocket address", async () => {
  const { isValidRelayUrl } = await load();
  assert.ok(isValidRelayUrl(SHIPPED));
  assert.ok(SHIPPED.endsWith("/ws"), "the Worker only answers on /ws");
  assert.ok(SHIPPED.startsWith("wss://"), "must be encrypted from a https page");
});
