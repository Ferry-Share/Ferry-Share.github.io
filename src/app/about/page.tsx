import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs, Lede, Section, SiteChrome } from "@/components/SiteChrome";
import { JsonLd, breadcrumbs } from "@/components/JsonLd";
import { authorName, authorUrl, pageUrl, pathFor, repoUrl, siteUrl, urlFor } from "../site";

const seoTitle = "About Ferry — Who Built It and What It Promises";
const description =
  "Why Ferry exists, what it refuses to do with your data, and who is behind it. Free, open source, and built so that trusting the operator is not part of the deal.";

export const metadata: Metadata = {
  title: { absolute: seoTitle },
  description,
  alternates: { canonical: pathFor("/about/") },
  openGraph: {
    title: seoTitle,
    description,
    url: urlFor("/about/"),
    type: "article",
  },
  twitter: { card: "summary_large_image", title: seoTitle, description },
};

const promises = [
  {
    title: "No account, ever",
    body: "There is nothing to sign up for and no identity to prove. Open the page and you can use it.",
  },
  {
    title: "Nothing is stored",
    body: "Your files are not uploaded anywhere. They go from one browser to the other, and what arrives clears itself on a timer. Close the tab and the session is gone with it.",
  },
  {
    title: "Nothing is logged",
    body: "The relay that introduces two devices keeps no record of who paired with whom. It cannot: it never learns your code, and it sees only ciphertext.",
  },
  {
    title: "Nothing is measured",
    body: "No analytics, no tracking pixels, no fonts or images fetched from someone else's server. The page loads from one origin and talks to nobody else.",
  },
];

export default function About() {
  /**
   * This page doubles as the privacy statement — the structured data in the
   * layout points at it as one — so it is marked up as both, and the four
   * promises are listed where a crawler can read them as claims rather than
   * having to infer them from prose.
   */
  const aboutPage = {
    "@context": "https://schema.org",
    "@type": ["AboutPage", "PrivacyPolicy"],
    "@id": `${urlFor("/about/")}#about`,
    name: "About Ferry",
    description,
    inLanguage: "en",
    isPartOf: { "@id": `${pageUrl}#website` },
    about: { "@id": `${pageUrl}#app` },
    author: { "@type": "Person", name: authorName, url: authorUrl },
    mainEntity: {
      "@type": "ItemList",
      name: "What Ferry promises",
      itemListElement: promises.map((promise, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: promise.title,
        description: promise.body,
      })),
    },
  };

  return (
    <SiteChrome current="/about/">
      <JsonLd data={aboutPage} />
      <JsonLd
        data={breadcrumbs(siteUrl, [
          { name: "Ferry", url: pageUrl },
          { name: "About", url: urlFor("/about/") },
        ])}
      />

      <article className="pb-4 pt-2">
        <Breadcrumbs here="About" />
        <h1 className="mt-3 max-w-[18ch] text-[36px] font-bold leading-[1.1] sm:text-[46px]">
          About Ferry
        </h1>
        <Lede>
          Moving a password or a file between two devices you own should not
          require handing it to a company first. Ferry is the small tool that
          does it directly.
        </Lede>

        <Section title="Why it exists">
          <p>
            The usual ways of getting a file from a phone to a laptop all route
            through somebody else. You email it to yourself, and it sits on a
            mail server. You drop it in a chat, and it lands in that company&rsquo;s
            storage. You upload it somewhere and paste a link, and now the link
            is the secret and the file is on a disk you do not control.
          </p>
          <p>
            None of that is necessary when the two devices are yours and often
            an arm&rsquo;s length apart. Ferry opens a direct channel between the two
            browsers, hands the thing across, and forgets it happened.
          </p>
        </Section>

        <Section title="What Ferry promises">
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            {promises.map((promise) => (
              <div key={promise.title} className="panel p-5">
                <h3 className="text-[15.5px] font-semibold">{promise.title}</h3>
                <p className="mt-1.5 text-[14.5px] text-hull-600 dark:text-hull-300">
                  {promise.body}
                </p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Why you do not have to take our word for it">
          <p>
            Promises about privacy are worth exactly as much as the honesty of
            whoever makes them, which is not a good foundation. Ferry is built
            so that the promises hold even if the people running it are not
            trustworthy.
          </p>
          <p>
            The relay in the middle is treated as hostile by design. It is
            given a hash of your pairing code rather than the code, so it
            cannot recover it. The key agreement is anchored to that code, so a
            relay that tried to impersonate your other device would derive the
            wrong key and be caught by the first frame it sent. Everything it
            forwards is already sealed.
          </p>
          <p>
            The four words both screens show at the start are there for exactly
            this reason: they are derived from the agreed key, and matching
            words on both devices is something you can check yourself, without
            trusting anyone.
          </p>
          <p>
            All of it is open source under the MIT licence, and the
            cryptographic claims are covered by tests that run against real
            WebCrypto every time the code changes.{" "}
            <a
              className="font-medium text-sea-600 hover:underline dark:text-sea-400"
              href={repoUrl}
              rel="noreferrer"
            >
              Read it, or fork it.
            </a>
          </p>
        </Section>

        <Section title="What it costs">
          <p>
            Nothing. There is no paid tier, no limit on how often you use it,
            and nothing to upsell you — partly on principle, and partly because
            a tool that stores nothing and has no accounts costs almost nothing
            to run.
          </p>
        </Section>

        <Section title="Run your own">
          <p>
            You do not have to use the relay we host. Point Ferry at your own
            under <strong>Settings → Relay address</strong> and it will use that
            instead. On a single network you can skip the relay entirely:{" "}
            <code className="rounded bg-fog-100 px-1.5 py-0.5 font-mono text-[13.5px] dark:bg-hull-950">
              npm run lan
            </code>{" "}
            serves the app and its own relay together, and nothing leaves the
            building.
          </p>
        </Section>

        <Section title="Who made it">
          <p>
            Ferry is built and maintained by{" "}
            <a
              className="font-medium text-sea-600 hover:underline dark:text-sea-400"
              href="https://github.com/AshenWijesingha"
              rel="noreferrer"
            >
              Ashen Wijesingha
            </a>{" "}
            in Sri Lanka. Bugs, questions and suggestions are welcome on{" "}
            <a
              className="font-medium text-sea-600 hover:underline dark:text-sea-400"
              href={`${repoUrl}/issues`}
              rel="noreferrer"
            >
              the issue tracker
            </a>
            .
          </p>
        </Section>

        <div className="mt-14 plate p-6 text-center sm:p-8">
          <h2 className="text-xl font-semibold">Try it with your other device</h2>
          <p className="mx-auto mt-2 max-w-md text-hull-600 dark:text-hull-300">
            Nothing to install, nothing to sign up for. It takes about ten
            seconds.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex h-12 items-center rounded-xl bg-sea-600 px-6 text-[15px] font-medium text-white transition-colors hover:bg-sea-700"
          >
            Open Ferry
          </Link>
        </div>
      </article>
    </SiteChrome>
  );
}
