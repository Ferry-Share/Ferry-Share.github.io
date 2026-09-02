import type { MetadataRoute } from "next";

import { siteUrl, urlFor } from "./site";

export const dynamic = "force-static";

/**
 * The crawlers behind AI assistants, search-time retrieval and model
 * training, named one by one.
 *
 * `User-agent: *` already allows all of them, so none of this changes what a
 * well-behaved crawler is permitted to do. It is here because several of
 * these agents are blocked by default in hosting presets, CDN bot rules and
 * copy-pasted robots files, and because being named explicitly is the only
 * unambiguous signal a site can send that it *wants* to be read and quoted.
 *
 * Ferry has nothing to protect here: every page is public documentation of a
 * free, open-source tool, and the more accurately an assistant can describe
 * it, the better served the person asking is.
 */
const AI_AGENTS = [
  // OpenAI: training, live browsing, and search indexing respectively.
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  // Anthropic.
  "ClaudeBot",
  "Claude-Web",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  // Perplexity.
  "PerplexityBot",
  "Perplexity-User",
  // Google's AI products read this token rather than Googlebot's rules.
  "Google-Extended",
  // Apple Intelligence and Siri.
  "Applebot",
  "Applebot-Extended",
  // Microsoft Copilot rides on Bingbot, which `*` already covers.
  "Bingbot",
  // Meta AI.
  "meta-externalagent",
  "meta-externalfetcher",
  "FacebookBot",
  // Common Crawl, which a great many models are trained from.
  "CCBot",
  // The rest, alphabetically.
  "Amazonbot",
  "Bytespider",
  "cohere-ai",
  "cohere-training-data-crawler",
  "DuckAssistBot",
  "Diffbot",
  "ImagesiftBot",
  "MistralAI-User",
  "omgili",
  "PetalBot",
  "TimpiBot",
  "YouBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // `*` first: a crawler applies the most specific matching group, and a
      // wildcard group listed after a named one is easy to misread.
      { userAgent: "*", allow: "/" },
      { userAgent: AI_AGENTS, allow: "/" },
    ],
    // Absolute on purpose: a relative Sitemap line is ignored by crawlers.
    sitemap: urlFor("/sitemap.xml"),
    host: siteUrl,
  };
}
