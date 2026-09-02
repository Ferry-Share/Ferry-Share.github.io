/**
 * Where the site lives, and who made it. Everything that has to spell out an
 * absolute URL — the canonical link, the social card, robots.txt, the
 * sitemap, every piece of structured data — reads it from here, so a fork
 * changes one value rather than hunting for twenty.
 */
export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://ferry-share.github.io";

export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** The page's own address, base path included. */
export const pageUrl = `${siteUrl}${basePath || "/"}`;

/** Where the source lives. Linked from the footer and the written pages. */
export const repoUrl = "https://github.com/Ferry-Share/Ferry-Share.github.io";

export const siteName = "Ferry";
export const authorName = "Ashen Wijesingha";
export const authorUrl = "https://github.com/AshenWijesingha";

/**
 * The absolute address of a route like "/faq/". Structured data, Open Graph
 * and the sitemap all need the full URL; a relative one is either ignored or
 * resolved against the wrong origin.
 */
export const urlFor = (route: string) => `${siteUrl}${basePath}${route}`;

/**
 * The same route as a path, for `alternates.canonical`. Next resolves it
 * against `metadataBase`, so the base path has to be here but the origin
 * must not be.
 */
export const pathFor = (route: string) => `${basePath}${route}` || "/";

/**
 * The three sentences that answer "what is this?" — used by the page
 * description, the social card, the structured data and llms.txt, so all
 * four say the same thing rather than drifting apart.
 */
export const tagline =
  "Send passwords, text and files straight between your own devices, end-to-end encrypted.";

export const summary =
  "Ferry moves passwords, text and files directly between your devices, end-to-end encrypted. " +
  "No account, no uploads, nothing stored. Free and open source.";

/** What the app can do, in the flat form structured data wants. */
export const featureList = [
  "End-to-end encrypted transfer (ECDH P-256, HKDF, AES-256-GCM)",
  "Peer-to-peer over WebRTC, with an encrypted relay fallback",
  "No account, no sign-up and no email address",
  "Nothing stored on any server; received items self-destruct",
  "Pair by QR code or a ten-character code",
  "Four-word verification so you can check nobody is in the middle",
  "Send passwords, text and files up to 250 MB",
  "Works in any modern browser on phone, tablet and desktop",
  "Self-hostable relay, or fully offline over a local network",
  "Free, MIT licensed and open source",
];
