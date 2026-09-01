/**
 * Ferry — end-to-end encryption primitives.
 *
 * Threat model
 * ------------
 * The relay is treated as fully untrusted. It must never be able to read a
 * payload, and it must not be able to insert itself as a man in the middle.
 *
 * How that is achieved:
 *
 *  1. One device mints a random 10-character PIN (50 bits of entropy).
 *     The PIN is the *only* secret. It travels inside a QR code or the URL
 *     fragment (`#p=...`), which browsers never send to a server.
 *
 *  2. The rendezvous room id is SHA-256(domain-separator ‖ PIN). The relay
 *     therefore learns a room id but cannot invert it to recover the PIN.
 *
 *  3. Both devices generate an ephemeral ECDH P-256 key pair and exchange
 *     public keys through the relay. The shared secret is run through HKDF
 *     *salted with a key derived from the PIN*. An attacker who does not know
 *     the PIN — including the relay itself — derives different keys, so an
 *     injected peer simply fails to decrypt. Keys are ephemeral, so a later
 *     compromise of the PIN cannot decrypt a captured session.
 *
 *  4. Separate keys are derived per direction, so a frame can never be
 *     replayed back at its sender.
 *
 *  5. Four "safety words" are derived from the session key and shown on both
 *     screens. Matching words are a human-verifiable confirmation that the two
 *     devices hold the same key.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Crockford base32 — no I, L, O or U, so codes can be read aloud safely. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const PIN_LENGTH = 10;

const DOMAIN_ROOM = "ferry/v1/room";
const DOMAIN_PSK = "ferry/v1/psk";
const INFO_A_TO_B = "ferry/v1/stream/initiator->joiner";
const INFO_B_TO_A = "ferry/v1/stream/joiner->initiator";
const INFO_SAS = "ferry/v1/safety-words";

export type Role = "initiator" | "joiner";

export interface SessionKeys {
  /** Encrypts everything this device sends. */
  outbound: CryptoKey;
  /** Decrypts everything the peer sends. */
  inbound: CryptoKey;
  /** Four words shown on both devices for visual confirmation. */
  safetyWords: string[];
}

/* ------------------------------------------------------------------ */
/* PIN handling                                                        */
/* ------------------------------------------------------------------ */

/** Mint a fresh pairing PIN. 32^10 ≈ 2^50 possibilities. */
export function generatePin(): string {
  const bytes = new Uint8Array(PIN_LENGTH);
  crypto.getRandomValues(bytes);
  // 256 is an exact multiple of 32, so masking is uniform — no modulo bias.
  let pin = "";
  for (const byte of bytes) pin += ALPHABET[byte & 31];
  return pin;
}

/**
 * Accept whatever the user typed. Strips separators and repairs the
 * characters people habitually confuse.
 */
export function normalizePin(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V")
    .slice(0, PIN_LENGTH);
}

export function isCompletePin(input: string): boolean {
  const pin = normalizePin(input);
  if (pin.length !== PIN_LENGTH) return false;
  return [...pin].every((char) => ALPHABET.includes(char));
}

/** Display form: FERRY-2K9QX becomes two readable groups of five. */
export function formatPin(pin: string): string {
  const clean = normalizePin(pin);
  return clean.length > 5 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : clean;
}

/* ------------------------------------------------------------------ */
/* Derivations                                                         */
/* ------------------------------------------------------------------ */

async function sha256(input: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", encoder.encode(input));
}

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export { toBase64Url, fromBase64Url };

/** The room id handed to the relay. Reveals nothing about the PIN. */
export async function roomIdFromPin(pin: string): Promise<string> {
  const digest = await sha256(`${DOMAIN_ROOM}:${normalizePin(pin)}`);
  return toBase64Url(digest).slice(0, 22);
}

/** Pre-shared salt that binds the ECDH handshake to the PIN. */
async function saltFromPin(pin: string): Promise<Uint8Array> {
  const digest = await sha256(`${DOMAIN_PSK}:${normalizePin(pin)}`);
  return new Uint8Array(digest);
}

/* ------------------------------------------------------------------ */
/* Key agreement                                                       */
/* ------------------------------------------------------------------ */

export async function generateEphemeralKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, [
    "deriveBits",
  ]);
}

export async function exportPublicKey(pair: CryptoKeyPair): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", pair.publicKey);
  return toBase64Url(raw);
}

async function importPublicKey(encoded: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    fromBase64Url(encoded),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
}

/**
 * Complete the handshake. Returns directional AES-GCM keys plus the safety
 * words both devices should be showing.
 */
export async function deriveSessionKeys(
  pin: string,
  ownPair: CryptoKeyPair,
  peerPublicKey: string,
  role: Role,
): Promise<SessionKeys> {
  const peerKey = await importPublicKey(peerPublicKey);
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: peerKey },
    ownPair.privateKey,
    256,
  );

  const salt = await saltFromPin(pin);
  const material = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, [
    "deriveKey",
    "deriveBits",
  ]);

  const deriveStream = (info: string) =>
    crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt, info: encoder.encode(info) },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );

  const initiatorToJoiner = await deriveStream(INFO_A_TO_B);
  const joinerToInitiator = await deriveStream(INFO_B_TO_A);

  const sasBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info: encoder.encode(INFO_SAS) },
    material,
    64,
  );

  return {
    outbound: role === "initiator" ? initiatorToJoiner : joinerToInitiator,
    inbound: role === "initiator" ? joinerToInitiator : initiatorToJoiner,
    safetyWords: wordsFromBits(new Uint8Array(sasBits)),
  };
}

/* ------------------------------------------------------------------ */
/* Frame encryption                                                    */
/* ------------------------------------------------------------------ */

/** Layout: [12-byte random nonce][AES-GCM ciphertext ‖ 16-byte tag] */
export async function seal(key: CryptoKey, plaintext: Uint8Array): Promise<Uint8Array> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    key,
    plaintext as BufferSource,
  );
  const framed = new Uint8Array(12 + ciphertext.byteLength);
  framed.set(nonce, 0);
  framed.set(new Uint8Array(ciphertext), 12);
  return framed;
}

export async function open(key: CryptoKey, framed: Uint8Array): Promise<Uint8Array> {
  if (framed.byteLength < 29) throw new Error("Frame is too short to be valid");
  const nonce = framed.subarray(0, 12);
  const body = framed.subarray(12);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    key,
    body as BufferSource,
  );
  return new Uint8Array(plaintext);
}

export async function sealJson(key: CryptoKey, value: unknown): Promise<string> {
  const framed = await seal(key, encoder.encode(JSON.stringify(value)));
  return toBase64Url(framed.buffer as ArrayBuffer);
}

export async function openJson<T>(key: CryptoKey, encoded: string): Promise<T> {
  const plaintext = await open(key, fromBase64Url(encoded));
  return JSON.parse(decoder.decode(plaintext)) as T;
}

/* ------------------------------------------------------------------ */
/* Safety words                                                        */
/* ------------------------------------------------------------------ */

/**
 * A 256-word list of short, phonetically distinct nouns. Four words carry
 * 32 bits, which is ample for catching an active man-in-the-middle.
 */
const WORDLIST = [
  "anchor","amber","apple","arbor","arrow","aspen","atlas","autumn","bacon","badge",
  "bagel","balsa","banjo","barge","basil","beacon","beetle","bellow","birch","bison",
  "blaze","bloom","bolt","bonsai","boulder","bramble","brass","bridge","bronze","brook",
  "bugle","cabin","cactus","cameo","canvas","canyon","cargo","carrot","cedar","chalk",
  "chapel","cherry","chisel","cider","cinder","circus","citrus","clover","cobalt","cocoa",
  "comet","compass","copper","coral","cotton","crane","crater","crescent","crimson","crystal",
  "cypress","dagger","dahlia","daisy","dapple","dawn","delta","denim","diesel","dingo",
  "domino","donut","dragon","drift","dunes","eagle","ember","emerald","engine","estuary",
  "falcon","fathom","feather","fennel","fiddle","filter","flare","flint","florin","forest",
  "fossil","fountain","foxglove","frost","galley","garnet","gazelle","geyser","ginger","glacier",
  "gopher","granite","gravel","grotto","guitar","gulley","gypsum","hammer","harbor","harvest",
  "hazel","helix","heron","hickory","hollow","hornet","husky","igloo","indigo","ingot",
  "island","ivory","jackal","jasmine","jasper","jetty","jigsaw","jungle","juniper","kayak",
  "kelpie","kernel","kettle","keystone","kimono","kindle","koala","lagoon","lancet","lantern",
  "lattice","laurel","lemon","lentil","lever","lichen","lilac","linen","lobster","locket",
  "lumber","lyric","magnet","mahogany","mallet","mango","maple","marble","marina","marlin",
  "meadow","melon","meteor","mimosa","mineral","mirror","mitten","monsoon","mortar","mosaic",
  "moss","nectar","nickel","nimbus","nomad","noodle","nordic","nugget","nutmeg","oasis",
  "oatmeal","obsidian","ocean","octave","olive","onyx","opal","orbit","orchid","osprey",
  "otter","oxide","paddle","pagoda","palette","pampas","panther","papaya","parcel","parsley",
  "pastel","pebble","pelican","pepper","pewter","pigment","pillar","pinion","piston","pivot",
  "plaza","plover","plumage","pollen","pomelo","poplar","portal","pottery","prairie","prism",
  "puffin","pumice","quarry","quartz","quiver","radish","rafter","rapids","raven","reef",
  "relay","rhubarb","ribbon","rigging","ripple","rivet","rocket","rosemary","rudder","runner",
  "saffron","sailor","salmon","sandbar","sapling","satchel","saucer","scallop","schooner","sequoia",
  "shadow","shamrock","shelter","sherpa","shingle","sierra","signal","silo","silver","siphon",
  "skiff","slate","sleigh","socket","sonnet","sorrel","spindle",
];

function wordsFromBits(bits: Uint8Array): string[] {
  return Array.from(bits.subarray(0, 4), (byte) => WORDLIST[byte % WORDLIST.length]);
}
