import type { MetadataRoute } from "next";

import { pageUrl } from "./site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  // No `lastModified`: stamping every build with the current time tells
  // crawlers the content changed when only the build did.
  return [
    { url: pageUrl, changeFrequency: "monthly", priority: 1 },
    { url: `${pageUrl}how-it-works/`, changeFrequency: "yearly", priority: 0.8 },
    { url: `${pageUrl}about/`, changeFrequency: "yearly", priority: 0.6 },
  ];
}
