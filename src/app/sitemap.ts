import type { MetadataRoute } from "next";

import { urlFor } from "./site";

export const dynamic = "force-static";

/**
 * Every page the site publishes. Priorities are relative to each other and
 * describe the site's own shape: the app first, then the pages that explain
 * and justify it.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // No `lastModified`: stamping every build with the current time tells
  // crawlers the content changed when only the build did.
  return [
    { url: urlFor("/"), changeFrequency: "monthly", priority: 1 },
    { url: urlFor("/how-it-works/"), changeFrequency: "yearly", priority: 0.9 },
    { url: urlFor("/faq/"), changeFrequency: "monthly", priority: 0.8 },
    { url: urlFor("/compare/"), changeFrequency: "monthly", priority: 0.8 },
    { url: urlFor("/about/"), changeFrequency: "yearly", priority: 0.6 },
  ];
}
