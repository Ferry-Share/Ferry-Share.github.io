/**
 * Ferry — remembered devices.
 *
 * Pairing by code is the right way to meet a device for the first time. It is
 * a poor way to meet the same laptop for the fourth time today, and worse
 * when a connection drops mid-transfer and the only way back is to fetch the
 * other device and scan again.
 *
 * So after a successful pairing each side can remember the other. What gets
 * stored is deliberately *not* the code the user saw:
 *
 *  - It is the reunion code from `deriveSessionKeys`, computed on both sides
 *    from the shared secret. The code that was typed, photographed off a
 *    screen or left sitting in a QR grants nothing later.
 *  - It rotates every time the two devices pair, so a value copied off disk
 *    stops working the next time they meet.
 *  - It expires on its own after a week, and is capped to a handful of
 *    devices, so this never quietly becomes a permanent record of who you
 *    talk to.
 *  - It is off until asked for. Ferry's promise is that closing the tab ends
 *    the session, and that stays true for anyone who does not turn this on.
 *
 * Anyone with both this browser profile and physical access can still use a
 * stored entry to reach the other device — that is inherent in remembering
 * anything at all, and it is why this is opt-in, short-lived and one tap to
 * forget.
 */

const ENABLED_KEY = "ferry.reunion.enabled";
const DEVICES_KEY = "ferry.reunion.devices";

/** Kept small on purpose: this is a shortcut, not an address book. */
export const MAX_REMEMBERED = 4;

/** A week is long enough to be useful and short enough to forgive. */
export const REMEMBER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface RememberedDevice {
  /** Stable across rotations, so a device keeps its place in the list. */
  id: string;
  /** What the other device called itself, e.g. "iPhone · Safari". */
  label: string;
  /** The rotating reunion code. Never displayed and never the typed code. */
  pin: string;
  savedAt: number;
  expiresAt: number;
}

function canStore(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Reading storage throws outright in some privacy modes rather than returning null. */
function read<T>(key: string, fallback: T): T {
  if (!canStore()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (!canStore()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Full, or storage is denied. Remembering is a convenience; losing it is not an error. */
  }
}

export function isRemembering(): boolean {
  return read<boolean>(ENABLED_KEY, false) === true;
}

/** Turning it off forgets everything already stored, rather than just hiding it. */
export function setRemembering(on: boolean): void {
  write(ENABLED_KEY, on);
  if (!on) forgetAll();
}

function isLive(device: RememberedDevice, now: number): boolean {
  return (
    typeof device?.id === "string" &&
    typeof device?.pin === "string" &&
    device.pin.length > 0 &&
    typeof device.expiresAt === "number" &&
    device.expiresAt > now
  );
}

/** Every remembered device that has not expired, most recent first. */
export function listRemembered(now = Date.now()): RememberedDevice[] {
  const stored = read<RememberedDevice[]>(DEVICES_KEY, []);
  if (!Array.isArray(stored)) return [];

  const live = stored.filter((device) => isLive(device, now));
  live.sort((a, b) => b.savedAt - a.savedAt);

  // Expiry is enforced on read as well as write, so an entry cannot outlive
  // its week just because Ferry was never opened again.
  if (live.length !== stored.length) write(DEVICES_KEY, live);
  return live;
}

/**
 * Record a device, or rotate the code of one already known.
 *
 * Identity is the device's own label. Two laptops that describe themselves
 * identically will share a row, which is the right trade: the alternative is
 * a list that fills with duplicates of the same machine.
 */
export function remember(
  label: string,
  pin: string,
  now = Date.now(),
): RememberedDevice[] {
  if (!isRemembering() || !pin) return listRemembered(now);

  const id = label.trim() || "Unnamed device";
  const others = listRemembered(now).filter((device) => device.id !== id);
  const next: RememberedDevice = {
    id,
    label: id,
    pin,
    savedAt: now,
    expiresAt: now + REMEMBER_TTL_MS,
  };

  const kept = [next, ...others].slice(0, MAX_REMEMBERED);
  write(DEVICES_KEY, kept);
  return kept;
}

export function forget(id: string, now = Date.now()): RememberedDevice[] {
  const kept = listRemembered(now).filter((device) => device.id !== id);
  write(DEVICES_KEY, kept);
  return kept;
}

export function forgetAll(): void {
  write(DEVICES_KEY, []);
}

/** How long until this entry forgets itself, in whole days, at least one. */
export function daysLeft(device: RememberedDevice, now = Date.now()): number {
  return Math.max(1, Math.ceil((device.expiresAt - now) / (24 * 60 * 60 * 1000)));
}
