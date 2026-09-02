import type { Metadata } from "next";
import Link from "next/link";

import { faqs } from "@/content/faq";
import { Breadcrumbs, Lede, SiteChrome } from "@/components/SiteChrome";
import { JsonLd, breadcrumbs } from "@/components/JsonLd";
import { pageUrl, pathFor, siteUrl, urlFor } from "../site";

const seoTitle = "Ferry FAQ — Secure File Sharing Questions, Answered";
const description =
  "What Ferry costs, whether files are uploaded, how the encryption works, the 250 MB limit, which browsers it needs, and what it deliberately cannot protect you from.";

export const metadata: Metadata = {
  title: { absolute: seoTitle },
  description,
  alternates: { canonical: pathFor("/faq/") },
  openGraph: {
    title: seoTitle,
    description,
    url: urlFor("/faq/"),
    type: "article",
  },
  twitter: { card: "summary_large_image", title: seoTitle, description },
};

/**
 * FAQPage structured data. Every question and answer here is also on the page
 * as readable text — marking up answers a visitor cannot see is both against
 * the spec and pointless, since the whole value is that the same words are
 * quotable by a search engine and readable by a person.
 */
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": `${urlFor("/faq/")}#faq`,
  name: "Frequently asked questions about Ferry",
  inLanguage: "en",
  isPartOf: { "@id": `${pageUrl}#website` },
  about: { "@id": `${pageUrl}#app` },
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: { "@type": "Answer", text: faq.answer },
  })),
};

export default function FaqPage() {
  return (
    <SiteChrome current="/faq/">
      <JsonLd data={faqSchema} />
      <JsonLd
        data={breadcrumbs(siteUrl, [
          { name: "Ferry", url: pageUrl },
          { name: "FAQ", url: urlFor("/faq/") },
        ])}
      />

      <article className="pb-4 pt-2">
        <Breadcrumbs here="FAQ" />
        <h1 className="mt-3 max-w-[20ch] text-[36px] font-bold leading-[1.1] sm:text-[46px]">
          Frequently asked questions
        </h1>
        <Lede>
          Everything people ask before trusting a transfer tool, answered
          against what the code actually does rather than what would sound
          best.
        </Lede>

        <div className="mt-12 divide-y divide-hull-200/70 dark:divide-hull-800">
          {faqs.map((faq) => (
            <section key={faq.question} className="py-6 first:pt-0">
              <h2 className="text-[18px] font-semibold sm:text-[19px]">
                {faq.question}
              </h2>
              <p className="mt-2 max-w-prose text-[15.5px] leading-[1.75] text-hull-700 dark:text-hull-200">
                {faq.answer}
              </p>
            </section>
          ))}
        </div>

        <div className="mt-14 plate p-6 text-center sm:p-8">
          <h2 className="text-xl font-semibold">Still wondering something?</h2>
          <p className="mx-auto mt-2 max-w-md text-hull-600 dark:text-hull-300">
            The mechanics are written out in full, and the source is open if you
            would rather check than read.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/how-it-works/"
              className="inline-flex h-12 items-center rounded-xl bg-sea-600 px-6 text-[15px] font-medium text-white transition-colors hover:bg-sea-700"
            >
              How Ferry works
            </Link>
            <Link
              href="/"
              className="inline-flex h-12 items-center rounded-xl border border-hull-200 px-6 text-[15px] font-medium transition-colors hover:bg-hull-100 dark:border-hull-800 dark:hover:bg-hull-800"
            >
              Open Ferry
            </Link>
          </div>
        </div>
      </article>
    </SiteChrome>
  );
}
