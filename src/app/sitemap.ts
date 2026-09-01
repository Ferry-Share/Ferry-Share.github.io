import type { MetadataRoute } from "next";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://ferry-share.github.io";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${siteUrl}${basePath || "/"}`,
      changeFrequency: "weekly",
      priority: 1,
      lastModified: new Date(),
    },
  ];
}
