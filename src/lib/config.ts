/**
 * Ferry — runtime configuration.
 *
 * The relay address is resolved in priority order so the same static bundle
 * works unchanged whether it is served from GitHub Pages, a private server,
 * or the LAN host bundled with this repo.
 */

const RELAY_STORAGE_KEY = "ferry.relay-url";
const TURN_STORAGE_KEY = "ferry.turn-config";

const BUILD_TIME_RELAY = process.env.NEXT_PUBLIC_RELAY_URL ?? "";

export function defaultRelayUrl(): string {
  if (typeof window === "undefined") return BUILD_TIME_RELAY;

  const { protocol, host, hostname } = window.location;
  const scheme = protocol === "https:" ? "wss:" : "ws:";

  // Served by `npm run lan` or any self-hosted deployment: the relay lives
  // on the very same origin, under /ws.
  const isStaticHost =
    hostname.endsWith("github.io") ||
    hostname.endsWith("pages.dev") ||
    hostname.endsWith("netlify.app") ||
    hostname.endsWith("vercel.app");

  if (!isStaticHost && protocol !== "file:") return `${scheme}//${host}/ws`;

  return BUILD_TIME_RELAY;
}

export function getRelayUrl(): string {
  if (typeof window === "undefined") return BUILD_TIME_RELAY;
  const stored = window.localStorage.getItem(RELAY_STORAGE_KEY);
  return stored?.trim() || defaultRelayUrl();
}

export function setRelayUrl(url: string): void {
  const trimmed = url.trim();
  if (!trimmed || trimmed === defaultRelayUrl()) {
    window.localStorage.removeItem(RELAY_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(RELAY_STORAGE_KEY, trimmed);
}

export function isValidRelayUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "ws:" || parsed.protocol === "wss:";
  } catch {
    return false;
  }
}

export interface TurnConfig {
  urls: string;
  username: string;
  credential: string;
}

export function getTurnConfig(): TurnConfig | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(TURN_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TurnConfig;
    return parsed.urls ? parsed : null;
  } catch {
    return null;
  }
}

export function setTurnConfig(config: TurnConfig | null): void {
  if (!config?.urls) {
    window.localStorage.removeItem(TURN_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(TURN_STORAGE_KEY, JSON.stringify(config));
}

export function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];
  const turn = getTurnConfig();
  if (turn) {
    servers.push({
      urls: turn.urls,
      username: turn.username,
      credential: turn.credential,
    });
  }
  return servers;
}

/** A short, non-identifying label so each side knows what it is talking to. */
export function describeThisDevice(): string {
  if (typeof navigator === "undefined") return "This device";
  const ua = navigator.userAgent;
  const platform =
    /iPhone/.test(ua) ? "iPhone" :
    /iPad/.test(ua) ? "iPad" :
    /Android/.test(ua) ? "Android phone" :
    /Macintosh/.test(ua) ? "Mac" :
    /Windows/.test(ua) ? "Windows PC" :
    /Linux/.test(ua) ? "Linux machine" :
    "Device";

  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /OPR\//.test(ua) ? "Opera" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Safari\//.test(ua) ? "Safari" :
    "browser";

  return `${platform} · ${browser}`;
}

export function withBasePath(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${base}${path}`;
}
