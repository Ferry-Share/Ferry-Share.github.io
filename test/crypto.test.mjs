/**
 * The security properties the README claims, checked against the real
 * WebCrypto implementation rather than a stand-in.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveSessionKeys,
  exportPublicKey,
  generateEphemeralKeyPair,
  generatePin,
  isCompletePin,
  normalizePin,
  open,
  PIN_LENGTH,
  roomIdFromPin,
  safetyWordsForTests,
  seal,
} from "../src/lib/crypto.ts";

/** Runs a full two-sided handshake, optionally with the sides disagreeing. */
async function handshake(pinA, pinB = pinA) {
  const a = await generateEphemeralKeyPair();
  const b = await generateEphemeralKeyPair();
  return {
    a: await deriveSessionKeys(pinA, a, await exportPublicKey(b), "initiator"),
    b: await deriveSessionKeys(pinB, b, await exportPublicKey(a), "joiner"),
  };
}

const bytes = (text) => new TextEncoder().encode(text);
const text = (data) => new TextDecoder().decode(data);

test("a minted PIN is the advertised length and alphabet", () => {
  for (let i = 0; i < 200; i += 1) {
    const pin = generatePin();
    assert.equal(pin.length, PIN_LENGTH);
    assert.ok(isCompletePin(pin), `${pin} should be a complete PIN`);
  }
});

test("PINs are unpredictable", () => {
  const seen = new Set();
  for (let i = 0; i < 500; i += 1) seen.add(generatePin());
  assert.equal(seen.size, 500, "500 minted PINs should all differ");
});

test("typing repairs the characters people confuse", () => {
  // Crockford base32 drops I, L, O and U precisely so these stay unambiguous.
  assert.equal(normalizePin("oilu"), "011V", "O→0, I→1, L→1, U→V");
  assert.equal(normalizePin("OILU"), "011V");
  assert.equal(normalizePin("abcde fghjk"), "ABCDEFGHJK", "spacing is ignored");
  assert.equal(normalizePin("ABCDE-FGHJK"), "ABCDEFGHJK", "dashes are ignored");
  assert.equal(
    normalizePin("ABCDEFGHJKMNPQ"),
    "ABCDEFGHJK",
    `anything past ${PIN_LENGTH} characters is dropped`,
  );
});

test("the room id hides the PIN and is stable", async () => {
  const pin = generatePin();
  const first = await roomIdFromPin(pin);
  assert.equal(first, await roomIdFromPin(pin), "same PIN, same room");
  assert.equal(first, await roomIdFromPin(normalizePin(pin.toLowerCase())));
  assert.ok(!first.includes(pin), "the room id must not carry the PIN");
  assert.notEqual(first, await roomIdFromPin(generatePin()));
  assert.match(first, /^[A-Za-z0-9_-]{16,64}$/, "must satisfy the relay's room format");
});

test("both devices reach the same key and the same safety words", async () => {
  const pin = generatePin();
  const { a, b } = await handshake(pin);

  assert.deepEqual(a.safetyWords, b.safetyWords);
  assert.equal(a.safetyWords.length, 4);

  const sealed = await seal(a.outbound, bytes("a password"));
  assert.equal(text(await open(b.inbound, sealed)), "a password");
});

test("keys are separate per direction, so a frame cannot be replayed at its sender", async () => {
  const { a } = await handshake(generatePin());
  const sealed = await seal(a.outbound, bytes("outbound"));
  // The sender's own inbound key must not open what it just sent.
  await assert.rejects(() => open(a.inbound, sealed));
});

test("a peer with the wrong PIN derives a different key and is rejected", async () => {
  const { a, b } = await handshake(generatePin(), generatePin());

  assert.notDeepEqual(a.safetyWords, b.safetyWords, "mismatched words is the visible tell");
  const sealed = await seal(a.outbound, bytes("secret"));
  await assert.rejects(
    () => open(b.inbound, sealed),
    "a wrong-PIN peer must not be able to open a frame",
  );
});

test("tampering with a frame fails the integrity check", async () => {
  const pin = generatePin();
  const { a, b } = await handshake(pin);
  const sealed = await seal(a.outbound, bytes("untouched"));

  const flipped = Uint8Array.from(sealed);
  flipped[flipped.length - 1] ^= 0x01;
  await assert.rejects(() => open(b.inbound, flipped), "a flipped tag bit must be caught");

  const reNonced = Uint8Array.from(sealed);
  reNonced[0] ^= 0x01;
  await assert.rejects(() => open(b.inbound, reNonced), "a swapped nonce must be caught");

  await assert.rejects(() => open(b.inbound, sealed.subarray(0, 20)), /too short/);
});

test("every sealing uses a fresh nonce", async () => {
  const { a } = await handshake(generatePin());
  const seen = new Set();
  for (let i = 0; i < 50; i += 1) {
    const sealed = await seal(a.outbound, bytes("same plaintext every time"));
    seen.add(Buffer.from(sealed.subarray(0, 12)).toString("hex"));
  }
  assert.equal(seen.size, 50, "a nonce must never repeat under one key");
});

test("an empty payload survives the round trip", async () => {
  const { a, b } = await handshake(generatePin());
  const sealed = await seal(a.outbound, new Uint8Array(0));
  assert.equal((await open(b.inbound, sealed)).byteLength, 0);
});

test("safety words come from a 256-word list with no modulo bias", () => {
  const { wordlist, wordsFromBits } = safetyWordsForTests;
  assert.equal(wordlist.length, 256, "any other length reintroduces modulo bias");
  assert.equal(new Set(wordlist).size, 256, "the words must all be distinct");

  // Every byte must reach its own word, and all 256 must be reachable.
  const reached = new Set();
  for (let byte = 0; byte < 256; byte += 1) {
    reached.add(wordsFromBits(Uint8Array.from([byte]))[0]);
  }
  assert.equal(reached.size, 256, "every word must be reachable");
});

/* ---------------------------------------------------------------- */
/* Reconnecting without the original code                            */
/* ---------------------------------------------------------------- */

test("both devices derive the same reunion code without exchanging it", async () => {
  const { a, b } = await handshake(generatePin());
  assert.equal(a.reunionPin, b.reunionPin);
  assert.equal(a.reunionPin.length, PIN_LENGTH);
  // It has to survive a round trip through the same normaliser a typed code
  // does, or reconnecting would land in a different room than it stored.
  assert.equal(normalizePin(a.reunionPin), a.reunionPin);
  assert.ok(isCompletePin(a.reunionPin));
});

test("the reunion code is not the code the user saw", async () => {
  const pin = generatePin();
  const { a } = await handshake(pin);
  // This is the whole point of storing it instead: a code that was read
  // aloud, photographed off a screen or left in a QR grants nothing later.
  assert.notEqual(a.reunionPin, pin);
});

test("the reunion code rotates every time the same code is used", async () => {
  const pin = generatePin();
  // Same PIN, fresh ephemeral keys — which is exactly what a second pairing
  // is. A value copied off disk must not keep working.
  const first = await handshake(pin);
  const second = await handshake(pin);
  assert.notEqual(first.a.reunionPin, second.a.reunionPin);
});

test("a reunion code leads to its own room, not the original one", async () => {
  const pin = generatePin();
  const { a } = await handshake(pin);
  assert.notEqual(await roomIdFromPin(a.reunionPin), await roomIdFromPin(pin));
});

test("the reunion code is independent of the session keys", async () => {
  const { a } = await handshake(generatePin());
  // Derived from the same material under a different info string, so knowing
  // one must not hand over the other.
  const sealed = await seal(a.outbound, new TextEncoder().encode("secret"));
  assert.ok(!Buffer.from(sealed).includes(Buffer.from(a.reunionPin)));
});
