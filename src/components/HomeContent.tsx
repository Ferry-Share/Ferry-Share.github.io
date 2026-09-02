import Link from "next/link";

import { featuredFaqs } from "@/content/faq";
import { pageUrl } from "@/app/site";
import { withBasePath } from "@/lib/config";
import { JsonLd } from "./JsonLd";

/**
 * The front page, in plain HTML.
 *
 * The app above this is client-only — it needs WebCrypto, WebRTC and a
 * camera, none of which exist on a server. That is fine for the app, but it
 * used to mean the front page reached a crawler as a loading bar and nothing
 * else, and a page with no text cannot be quoted, indexed or recommended by
 * anything.
 *
 * So everything on this page that is prose rather than interface is rendered
 * on the server and stays in the document. It is the same content a visitor
 * scrolls to, not a hidden copy written for machines.
 */

const steps = [
  {
    title: "One device opens a crossing",
    body: "It mints a ten-character code and shows it as a QR. The code is the only secret, and it never reaches a server — the relay only ever sees a hash of it.",
  },
  {
    title: "The other device reads the code",
    body: "Scan the QR or type the ten characters. Both browsers generate a throwaway key pair and agree on a shared key, salted with the code, so a relay that tried to insert itself would end up with a different key and be caught immediately.",
  },
  {
    title: "Both screens show four words",
    body: "Those words come from the agreed key. Matching words on both devices mean nobody is in the middle — a check you make yourself, without trusting anyone.",
  },
  {
    title: "The data goes straight across",
    body: "On the same network the bytes travel device to device and never touch the relay at all. When a network blocks that, the same encrypted frames are forwarded instead — the relay still cannot read them.",
  },
];

const uses = [
  {
    title: "A password onto your phone",
    body: "Off the password manager on your laptop and into your hand, without it passing through an inbox or a chat log. It clears itself two minutes after it arrives.",
  },
  {
    title: "A photo or a video off your phone",
    body: "Straight into the browser on your desktop, at local network speed, without a cable, an app, or a round trip through cloud storage.",
  },
  {
    title: "A document to a laptop that is not yours",
    body: "A hotel computer, a client's machine, a library terminal. Nothing is installed and nothing is left behind when the tab closes.",
  },
  {
    title: "A long URL or a block of text",
    body: "Config snippets, one-time codes, an address you would otherwise retype character by character across a room.",
  },
  {
    title: "Between platforms that will not talk",
    body: "Android to Windows, iPhone to Linux, work laptop to personal tablet. Ferry only needs a browser on both ends, so the operating systems never have to agree on anything.",
  },
  {
    title: "On a network with no internet",
    body: "Run the bundled LAN host and two devices on the same Wi-Fi pair with nothing leaving the building at all.",
  },
];

const guarantees = [
  { title: "End-to-end encrypted", body: "ECDH P-256, HKDF and AES-256-GCM through WebCrypto, with separate keys for each direction." },
  { title: "No account, ever", body: "Nothing to sign up for and no identity to prove. Open the page and use it." },
  { title: "Nothing stored", body: "No upload, no copy on a disk somewhere, and received items clear themselves on a timer." },
  { title: "Nothing logged", body: "The relay never learns your code, sees only ciphertext, and keeps no record of who paired with whom." },
  { title: "Nothing measured", body: "No analytics, no tracking pixels, no third-party fonts or scripts. The page talks to nobody but you." },
  { title: "Open source, MIT", body: "Read it, run the crypto tests, or host the whole thing yourself." },
];

/**
 * A comparison people can check rather than take on faith: each row is a fact
 * about how that route works, not a judgement about it.
 */
const comparison = [
  {
    route: "Emailing it to yourself",
    where: "Sits on a mail server, both yours and theirs",
    account: "Required",
    limit: "About 25 MB",
  },
  {
    route: "A chat app",
    where: "Stored by the chat provider",
    account: "Required",
    limit: "Varies, often 100 MB",
  },
  {
    route: "Cloud storage and a link",
    where: "On their disk; the link becomes the secret",
    account: "Required",
    limit: "Quota-based",
  },
  {
    route: "Ferry",
    where: "Nowhere — browser to browser",
    account: "None",
    limit: "250 MB per transfer",
  },
];

export function HomeContent() {
  const howTo = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to send a file securely between two devices with Ferry",
    description:
      "Pair two browsers with a ten-character code and hand a password, some text or a file across an end-to-end encrypted connection. No account and no upload.",
    totalTime: "PT1M",
    supply: [{ "@type": "HowToSupply", name: "Two devices with a modern web browser" }],
    tool: [{ "@type": "HowToTool", name: "Ferry (free web app)" }],
    estimatedCost: { "@type": "MonetaryAmount", currency: "USD", value: "0" },
    step: steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.title,
      text: step.body,
      url: `${pageUrl}#step-${index + 1}`,
    })),
  };

  return (
    <div className="border-t border-hull-200/70 pt-14 dark:border-hull-800">
      <JsonLd data={howTo} />

      <section aria-labelledby="what-is-ferry">
        <h2 id="what-is-ferry" className="text-2xl font-semibold">
          What Ferry is
        </h2>
        <div className="mt-3 max-w-prose space-y-4 text-[15.5px] leading-[1.75] text-hull-700 dark:text-hull-200">
          <p>
            Ferry is a free, open-source tool for moving a password, a piece of
            text or a file from one device to another. Both devices open the
            same web page, one shows a code, the other reads it, and the thing
            goes across a connection that is encrypted end to end. There is no
            account to make, nothing to install, and nothing left on a server
            afterwards.
          </p>
          <p>
            It exists because the usual routes all go through somebody else.
            Email it to yourself and it sits on a mail server. Drop it in a
            chat and it lands in that company&rsquo;s storage. Upload it and paste
            a link, and now the link is the secret and the file is on a disk
            you do not control. None of that is necessary when the two devices
            are yours and often an arm&rsquo;s length apart.
          </p>
        </div>
      </section>

      <section aria-labelledby="how-a-crossing-works" className="mt-14">
        <h2 id="how-a-crossing-works" className="text-2xl font-semibold">
          How a crossing works
        </h2>
        <ol className="mt-6 grid gap-x-8 gap-y-7 sm:grid-cols-2">
          {steps.map((step, index) => (
            <li key={step.title} id={`step-${index + 1}`} className="flex gap-4">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-hull-900 font-mono text-[13px] font-bold text-signal-400 dark:bg-hull-800">
                {index + 1}
              </span>
              <div>
                <h3 className="text-[15px] font-semibold">{step.title}</h3>
                <p className="mt-1 text-[14.5px] text-hull-600 dark:text-hull-300">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-[14.5px]">
          <Link
            className="font-medium text-sea-600 hover:underline dark:text-sea-400"
            href="/how-it-works/"
          >
            The long version, with the cryptography spelled out →
          </Link>
        </p>
      </section>

      <section aria-labelledby="what-ferry-promises" className="mt-14">
        <h2 id="what-ferry-promises" className="text-2xl font-semibold">
          What Ferry promises
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {guarantees.map((item) => (
            <div key={item.title} className="panel p-5">
              <h3 className="text-[15px] font-semibold">{item.title}</h3>
              <p className="mt-1.5 text-[14.5px] text-hull-600 dark:text-hull-300">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="what-people-use-it-for" className="mt-14">
        <h2 id="what-people-use-it-for" className="text-2xl font-semibold">
          What people use it for
        </h2>
        <div className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2">
          {uses.map((use) => (
            <div key={use.title}>
              <h3 className="text-[15px] font-semibold">{use.title}</h3>
              <p className="mt-1 text-[14.5px] text-hull-600 dark:text-hull-300">
                {use.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="compared-with" className="mt-14">
        <h2 id="compared-with" className="text-2xl font-semibold">
          Compared with the usual ways
        </h2>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left text-[14.5px]">
            <caption className="sr-only">
              Where the file ends up, whether an account is needed, and the size
              limit, for four ways of moving a file between two devices.
            </caption>
            <thead>
              <tr className="border-b border-hull-200 dark:border-hull-800">
                <th scope="col" className="py-2.5 pr-4 font-semibold">Route</th>
                <th scope="col" className="py-2.5 pr-4 font-semibold">Where the file ends up</th>
                <th scope="col" className="py-2.5 pr-4 font-semibold">Account</th>
                <th scope="col" className="py-2.5 font-semibold">Size limit</th>
              </tr>
            </thead>
            <tbody className="text-hull-600 dark:text-hull-300">
              {comparison.map((row) => (
                <tr
                  key={row.route}
                  className="border-b border-hull-200/60 last:border-0 dark:border-hull-800/60"
                >
                  <th scope="row" className="py-2.5 pr-4 font-medium text-hull-900 dark:text-fog-100">
                    {row.route}
                  </th>
                  <td className="py-2.5 pr-4">{row.where}</td>
                  <td className="py-2.5 pr-4">{row.account}</td>
                  <td className="py-2.5">{row.limit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-5 text-[14.5px]">
          <Link
            className="font-medium text-sea-600 hover:underline dark:text-sea-400"
            href="/compare/"
          >
            Ferry next to AirDrop, WeTransfer, Snapdrop and the rest →
          </Link>
        </p>
      </section>

      <section aria-labelledby="questions" className="mt-14">
        <h2 id="questions" className="text-2xl font-semibold">
          Questions people ask
        </h2>
        <div className="mt-5 divide-y divide-hull-200/70 dark:divide-hull-800">
          {featuredFaqs.map((faq) => (
            <div key={faq.question} className="py-4 first:pt-0">
              <h3 className="text-[15.5px] font-semibold">{faq.question}</h3>
              <p className="mt-1.5 max-w-prose text-[14.5px] leading-[1.7] text-hull-600 dark:text-hull-300">
                {faq.answer}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-[14.5px]">
          <Link
            className="font-medium text-sea-600 hover:underline dark:text-sea-400"
            href="/faq/"
          >
            Every question, answered →
          </Link>
        </p>
      </section>

      <section aria-labelledby="read-more" className="mt-14">
        <h2 id="read-more" className="text-2xl font-semibold">
          Read on
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {[
            { href: "/how-it-works/", title: "How Ferry works", body: "The code, the key agreement, the four safety words, and why the relay cannot read what it carries." },
            { href: "/faq/", title: "Frequently asked questions", body: "Size limits, browsers, self-hosting, and what Ferry deliberately does not protect against." },
            { href: "/compare/", title: "Ferry and the alternatives", body: "How it differs from AirDrop, Nearby Share, WeTransfer, Snapdrop and cloud storage links." },
            { href: "/about/", title: "About Ferry", body: "Why it exists, what it refuses to do with your data, and who is behind it." },
          ].map((card) => (
            <li key={card.href}>
              <Link href={card.href} className="panel block p-5 transition-colors hover:border-sea-400 dark:hover:border-sea-500">
                <span className="text-[15px] font-semibold text-hull-900 dark:text-fog-100">
                  {card.title}
                </span>
                <span className="mt-1.5 block text-[14.5px] text-hull-600 dark:text-hull-300">
                  {card.body}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[13.5px] text-hull-500 dark:text-hull-400">
          A plain-text summary of this site for language models lives at{" "}
          <a className="hover:underline" href={withBasePath("/llms.txt")}>
            /llms.txt
          </a>
          .
        </p>
      </section>
    </div>
  );
}
