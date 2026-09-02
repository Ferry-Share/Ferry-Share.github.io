import type { MetadataRoute } from "next";

import { siteUrl } from "./site";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    // Absolute on purpose: a relative Sitemap line is ignored by crawlers.
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
