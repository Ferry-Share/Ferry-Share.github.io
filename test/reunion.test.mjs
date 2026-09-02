/**
 * Remembering a device is the one place Ferry writes a secret to disk, so the
 * rules around it are worth pinning down: off unless asked for, rotating
 * rather than storing the code the user saw, expiring on its own, and bounded.
 */

import test from "node:test";
import assert from "node:assert/strict";

/** A localStorage good enough for the store, and inspectable from a test. */
function stubStorage() {
  const map = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => (map.has(key) ? map.get(key) : null),
      setItem: (key, value) => map.set(key, String(value)),
      removeItem: (key) => map.delete(key),
    },
  };
  return map;
}

/** The module reads `window` on every call, so one import is enough. */
const store = await import("../src/lib/reunion.ts");

test.beforeEach(() => {
  stubStorage();
});

test("nothing is stored until the user turns remembering on", () => {
  const raw = stubStorage();
  store.remember("Mac · Chrome", "ABCDEFGHJK");

  assert.deepEqual(store.listRemembered(), []);
  assert.ok(
    ![...raw.values()].some((value) => value.includes("ABCDEFGHJK")),
    "a code reached storage while remembering was off",
  );
});

test("a remembered device comes back with its code", () => {
  store.setRemembering(true);
  store.remember("Mac · Chrome", "ABCDEFGHJK");

  const [device] = store.listRemembered();
  assert.equal(device.label, "Mac · Chrome");
  assert.equal(device.pin, "ABCDEFGHJK");
});

test("pairing again rotates the stored code rather than adding a row", () => {
  store.setRemembering(true);
  store.remember("Mac · Chrome", "AAAAAAAAAA");
  store.remember("Mac · Chrome", "BBBBBBBBBB");

  const devices = store.listRemembered();
  assert.equal(devices.length, 1, "the same device should not appear twice");
  // The point of rotating: a code lifted from disk stops working once the two
  // devices meet again.
  assert.equal(devices[0].pin, "BBBBBBBBBB");
});

test("an entry forgets itself once its week is up", () => {
  store.setRemembering(true);
  const now = Date.now();
  store.remember("Old laptop", "AAAAAAAAAA", now);

  assert.equal(store.listRemembered(now + store.REMEMBER_TTL_MS - 1000).length, 1);
  assert.equal(
    store.listRemembered(now + store.REMEMBER_TTL_MS + 1000).length,
    0,
    "an expired device was still offered",
  );
});

test("expiry is enforced on read, not only when Ferry is next used to pair", () => {
  const raw = stubStorage();
  store.setRemembering(true);
  const now = Date.now();
  store.remember("Old laptop", "AAAAAAAAAA", now);

  store.listRemembered(now + store.REMEMBER_TTL_MS + 1000);
  assert.equal(
    JSON.parse(raw.get("ferry.reunion.devices")).length,
    0,
    "the expired entry should have been pruned from storage, not just hidden",
  );
});

test("the list stays small", () => {
  store.setRemembering(true);
  for (let i = 0; i < store.MAX_REMEMBERED + 4; i += 1) {
    store.remember(`Device ${i}`, `PIN${i}`.padEnd(10, "0"), Date.now() + i);
  }
  assert.equal(store.listRemembered().length, store.MAX_REMEMBERED);
});

test("the newest device is offered first", () => {
  store.setRemembering(true);
  const now = Date.now();
  store.remember("Older", "AAAAAAAAAA", now);
  store.remember("Newer", "BBBBBBBBBB", now + 5000);

  assert.equal(store.listRemembered(now + 6000)[0].label, "Newer");
});

test("forgetting one leaves the others", () => {
  store.setRemembering(true);
  const now = Date.now();
  store.remember("Keep", "AAAAAAAAAA", now);
  store.remember("Drop", "BBBBBBBBBB", now + 1000);

  const left = store.forget("Drop", now + 2000);
  assert.deepEqual(
    left.map((device) => device.label),
    ["Keep"],
  );
});

test("turning remembering off erases what was already stored", () => {
  const raw = stubStorage();
  store.setRemembering(true);
  store.remember("Mac · Chrome", "ABCDEFGHJK");
  assert.equal(store.listRemembered().length, 1);

  store.setRemembering(false);

  assert.deepEqual(store.listRemembered(), []);
  assert.ok(
    ![...raw.values()].some((value) => value.includes("ABCDEFGHJK")),
    "the code survived being switched off",
  );
});

test("storage that throws does not take the app down with it", () => {
  globalThis.window = {
    localStorage: {
      getItem() {
        throw new Error("denied");
      },
      setItem() {
        throw new Error("denied");
      },
      removeItem() {
        throw new Error("denied");
      },
    },
  };

  // Safari in private mode, and anything with site data blocked.
  assert.deepEqual(store.listRemembered(), []);
  assert.equal(store.isRemembering(), false);
  assert.doesNotThrow(() => store.remember("Mac", "ABCDEFGHJK"));
});
