import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs, Lede, Section, SiteChrome } from "@/components/SiteChrome";
import { JsonLd, breadcrumbs } from "@/components/JsonLd";
import { authorName, authorUrl, pageUrl, pathFor, siteUrl, urlFor } from "../site";

const seoTitle = "Ferry vs AirDrop, WeTransfer, Snapdrop and Cloud Links";
const description =
  "How Ferry differs from AirDrop, Quick Share, WeTransfer, Snapdrop, cloud storage links, messaging apps and email — including where those are the better choice.";

export const metadata: Metadata = {
  title: { absolute: seoTitle },
  description,
  alternates: { canonical: pathFor("/compare/") },
  openGraph: {
    title: seoTitle,
    description,
    url: urlFor("/compare/"),
    type: "article",
  },
  twitter: { card: "summary_large_image", title: seoTitle, description },
};

/**
 * Each row is a fact about how that route works, not a verdict on it. Several
 * of these tools are better than Ferry at what they were built for, and the
 * page says so — a comparison that only flatters the thing it is published on
 * is not worth reading and not worth trusting.
 */
const rows = [
  {
    tool: "Ferry",
    platforms: "Any browser: Windows, macOS, Linux, Android, iOS",
    account: "None",
    stored: "Nothing stored; direct browser to browser",
    encrypted: "End to end, AES-256-GCM, verifiable by four words",
  },
  {
    tool: "AirDrop",
    platforms: "Apple devices only",
    account: "Apple ID for some settings",
    stored: "Nothing stored; direct device to device",
    encrypted: "Yes, within Apple's system",
  },
  {
    tool: "Quick Share / Nearby Share",
    platforms: "Android, ChromeOS, Windows",
    account: "Google account for some modes",
    stored: "Nothing stored; direct device to device",
    encrypted: "Yes, within Google's system",
  },
  {
    tool: "Snapdrop / PairDrop",
    platforms: "Any browser",
    account: "None",
    stored: "Nothing stored; direct browser to browser",
    encrypted: "Yes, over WebRTC",
  },
  {
    tool: "WeTransfer and similar",
    platforms: "Any browser",
    account: "Optional or required, by tier",
    stored: "Uploaded to their servers, kept for days",
    encrypted: "In transit and at rest, on their keys",
  },
  {
    tool: "Cloud storage link",
    platforms: "Any browser",
    account: "Required",
    stored: "Held on their disks until you delete it",
    encrypted: "In transit and at rest, on their keys",
  },
  {
    tool: "Messaging apps",
    platforms: "Where the app runs",
    account: "Required, usually a phone number",
    stored: "In chat history on both devices and often their servers",
    encrypted: "End to end in Signal and WhatsApp",
  },
  {
    tool: "Emailing it to yourself",
    platforms: "Anywhere",
    account: "Required",
    stored: "On the mail servers at both ends, indefinitely",
    encrypted: "In transit only, in practice",
  },
];

export default function ComparePage() {
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${urlFor("/compare/")}#article`,
    headline: "Ferry compared with AirDrop, Quick Share, WeTransfer and cloud links",
    description,
    inLanguage: "en",
    isPartOf: { "@id": `${pageUrl}#website` },
    about: { "@id": `${pageUrl}#app` },
    author: { "@type": "Person", name: authorName, url: authorUrl },
    publisher: { "@id": `${pageUrl}#author` },
    mainEntityOfPage: urlFor("/compare/"),
  };

  return (
    <SiteChrome current="/compare/">
      <JsonLd data={article} />
      <JsonLd
        data={breadcrumbs(siteUrl, [
          { name: "Ferry", url: pageUrl },
          { name: "Compare", url: urlFor("/compare/") },
        ])}
      />

      <article className="pb-4 pt-2">
        <Breadcrumbs here="Compare" />
        <h1 className="mt-3 max-w-[20ch] text-[36px] font-bold leading-[1.1] sm:text-[46px]">
          Ferry and the alternatives
        </h1>
        <Lede>
          There are a lot of ways to move a file from one device to another.
          Most of them are fine. This page is about which one fits which
          situation — including the ones where Ferry is not the answer.
        </Lede>

        <Section title="Side by side">
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[40rem] border-collapse text-left text-[14.5px]">
              <caption className="sr-only">
                Platforms, account requirement, where the file ends up and how
                it is encrypted, for eight ways of moving a file between
                devices.
              </caption>
              <thead>
                <tr className="border-b border-hull-200 dark:border-hull-800">
                  <th scope="col" className="py-2.5 pr-4 font-semibold">Route</th>
                  <th scope="col" className="py-2.5 pr-4 font-semibold">Works on</th>
                  <th scope="col" className="py-2.5 pr-4 font-semibold">Account</th>
                  <th scope="col" className="py-2.5 pr-4 font-semibold">Where the file ends up</th>
                  <th scope="col" className="py-2.5 font-semibold">Encryption</th>
                </tr>
              </thead>
              <tbody className="align-top text-hull-600 dark:text-hull-300">
                {rows.map((row) => (
                  <tr
                    key={row.tool}
                    className="border-b border-hull-200/60 last:border-0 dark:border-hull-800/60"
                  >
                    <th
                      scope="row"
                      className="py-3 pr-4 font-medium text-hull-900 dark:text-fog-100"
                    >
                      {row.tool}
                    </th>
                    <td className="py-3 pr-4">{row.platforms}</td>
                    <td className="py-3 pr-4">{row.account}</td>
                    <td className="py-3 pr-4">{row.stored}</td>
                    <td className="py-3">{row.encrypted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[13.5px] text-hull-500 dark:text-hull-400">
            Products change. Treat this as a description of how each approach
            works rather than a specification of any one service, and check the
            current terms of anything you are relying on.
          </p>
        </Section>

        <Section title="Against AirDrop and Quick Share">
          <p>
            Both are excellent inside the world they were built for. AirDrop
            between two Apple devices is faster than Ferry, is built into the
            share sheet, and needs no browser. Quick Share does the same for
            Android, ChromeOS and Windows.
          </p>
          <p>
            The problem they share is the edge of that world. AirDrop will not
            talk to a Windows laptop; Quick Share will not talk to an iPhone.
            Ferry only asks for a browser on each end, so the two operating
            systems never have to agree on anything — and it works between
            devices that are nowhere near each other, which neither of those
            can do at all.
          </p>
        </Section>

        <Section title="Against Snapdrop and PairDrop">
          <p>
            These are the closest relatives: open-source, browser-based,
            peer-to-peer over WebRTC, no account. If they work for you, they
            are a good choice, and PairDrop in particular is actively
            maintained.
          </p>
          <p>
            Ferry differs in how the two sides find each other and what that
            buys. Those tools show you the other devices on your local network
            and you pick one. Ferry pairs on a ten-character code instead, so
            the two devices do not have to be on the same network, and the key
            agreement is salted with that code — which is what lets both
            screens show four words you can compare to prove nobody is in the
            middle. Ferry also treats the relay as hostile by design: it is
            given a hash of the code rather than the code, and even the WebRTC
            handshake is encrypted before it is handed over, so the relay never
            learns your local network addresses.
          </p>
        </Section>

        <Section title="Against WeTransfer and cloud storage links">
          <p>
            Upload-and-share services are the right tool for sending something
            to other people, especially several of them, especially something
            large. They will carry files far past 250 MB, the link keeps working
            after you close your laptop, and the recipient needs nothing but a
            browser and patience.
          </p>
          <p>
            The trade is that your file is on somebody else&rsquo;s disk, held under
            their keys and their retention policy, and the link is the secret —
            anyone who ends up with it has the file. For moving something
            between two devices you already own, that is a long way round with a
            copy left at the end of it.
          </p>
        </Section>

        <Section title="Against messaging apps and email">
          <p>
            Signal and WhatsApp are end-to-end encrypted and perfectly
            reasonable for sending a file to a person. Used on yourself, they
            leave the thing sitting in a chat history on both devices, which is
            the opposite of what you want for a password or a recovery code.
            Email is worse: it lands on at least two mail servers and stays
            there until you go and delete it from both.
          </p>
        </Section>

        <Section title="When Ferry is the wrong choice">
          <p>
            Ferry is built for one narrow job, so it is worth being clear about
            where it does not fit.
          </p>
          <ul className="ml-5 list-disc space-y-2 marker:text-hull-400">
            <li>
              <strong>Files over 250 MB.</strong> A single transfer is capped
              there. Use a service built for large files, or split it.
            </li>
            <li>
              <strong>Sending to someone who is not with you.</strong> Both
              sides have to be at their device at the same time, and you need a
              way to get the code across. There is no inbox and no link that
              still works tomorrow.
            </li>
            <li>
              <strong>Anything you need to keep.</strong> Nothing is stored, on
              purpose. Ferry is a crossing, not a folder.
            </li>
            <li>
              <strong>Many recipients.</strong> A room holds exactly two
              devices.
            </li>
            <li>
              <strong>Browsers without WebCrypto or WebRTC.</strong> Rare, but
              some locked-down corporate builds and very old browsers qualify.
            </li>
          </ul>
        </Section>

        <Section title="When Ferry is the right one">
          <p>
            Two devices, one of them yours, something you would rather not
            leave a copy of: a password out of a manager and onto a phone, a
            document onto a machine you do not own, a photo off a phone at
            local network speed, a config snippet between a work laptop and a
            personal one. No account to make, nothing installed, nothing left
            behind.
          </p>
          <p>
            <Link
              className="font-medium text-sea-600 hover:underline dark:text-sea-400"
              href="/"
            >
              Open Ferry and try a crossing
            </Link>{" "}
            —{" "}
            <Link
              className="font-medium text-sea-600 hover:underline dark:text-sea-400"
              href="/how-it-works/"
            >
              or read how it works first
            </Link>
            .
          </p>
        </Section>
      </article>
    </SiteChrome>
  );
}
