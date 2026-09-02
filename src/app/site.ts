/**
 * Where the site lives. Everything that has to spell out an absolute URL —
 * the canonical link, the social card, robots.txt, the sitemap — reads it
 * from here, so a fork changes one value rather than hunting for six.
 */
export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://ferry-share.github.io";

export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** The page's own address, base path included. */
export const pageUrl = `${siteUrl}${basePath || "/"}`;
