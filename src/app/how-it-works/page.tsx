import type { Metadata } from "next";
import Link from "next/link";

import { Lede, Section, SiteChrome } from "@/components/SiteChrome";
import { basePath, pageUrl, repoUrl } from "../site";

const title = "How Ferry works";
const description =
  "The ten-character code, the key agreement it anchors, the four safety words, and why the relay in the middle cannot read anything it carries.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${basePath}/how-it-works/` },
  openGraph: {
    title: `${title} — Ferry`,
    description,
    url: `${pageUrl}how-it-works/`,
    type: "article",
  },
  twitter: { card: "summary_large_image", title: `${title} — Ferry`, description },
};

const steps = [
  {
    n: "1",
    title: "One device opens a crossing",
    body: "It mints a ten-character code from your browser's cryptographic random source — about fifty bits — and shows it as a QR. That code is the only secret in the system. It travels in the QR, or in the part of a link after the # that browsers never send to a server.",
  },
  {
    n: "2",
    title: "The other device reads it",
    body: "Scan the QR, or type the ten characters. The code is Crockford base-32, which leaves out I, L, O and U, so there is no pair of characters you can confuse reading it aloud down a phone line.",
  },
  {
    n: "3",
    title: "They find each other at the relay",
    body: "Both browsers ask the relay for the same room. The room is named by a SHA-256 hash of your code, never the code itself, so the relay learns a meaningless string and cannot work backwards to the secret.",
  },
  {
    n: "4",
    title: "They agree on a key",
    body: "Each side generates a throwaway P-256 key pair and they exchange public halves. The shared secret goes through HKDF salted with a value derived from your code — so anyone who does not hold the code, the relay included, ends up with a different key.",
  },
  {
    n: "5",
    title: "Four words appear on both screens",
    body: "Those words are derived from the agreed key. If both screens show the same four, the two devices hold the same key and nobody is sitting in between. If they differ, stop.",
  },
  {
    n: "6",
    title: "The data goes across",
    body: "On the same network the bytes travel device to device and never touch the relay at all. Where a network blocks that, the same encrypted frames are forwarded instead — the relay still only sees ciphertext.",
  },
];

export default function HowItWorks() {
  return (
    <SiteChrome current="/how-it-works/">
      <article className="pb-4 pt-2">
        <h1 className="max-w-[18ch] text-[36px] font-bold leading-[1.1] sm:text-[46px]">
          How Ferry works
        </h1>
        <Lede>
          Two browsers that have never met need something to introduce them.
          Ferry uses a ten-character code for that, and builds everything else
          on top of it, so the introduction service never learns anything worth
          knowing.
        </Lede>

        <Section title="A crossing, step by step">
          <ol className="mt-2 space-y-6">
            {steps.map((step) => (
              <li key={step.n} className="flex gap-4">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-hull-900 font-mono text-[13px] font-bold text-signal-400 dark:bg-hull-800">
                  {step.n}
                </span>
                <div>
                  <h3 className="text-[16px] font-semibold">{step.title}</h3>
                  <p className="mt-1.5">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Why the relay cannot read your data">
          <p>
            Two browsers on different networks cannot dial each other directly;
            something has to introduce them. That introduction service is the
            one always-on piece Ferry needs, and it is treated as hostile from
            the start.
          </p>
          <p>
            It is handed a room name that is a hash of your code, so it cannot
            recover the code. The key agreement is salted with that same code,
            so a relay that tried to insert itself as your peer would derive a
            different key and its very first frame would fail authentication.
            And every payload is sealed with AES-256-GCM before it is handed
            over — including the WebRTC offer, answer and network candidates,
            so the relay does not even learn your local network addresses.
          </p>
          <p>
            Keys are thrown away when the tab closes. Recording the traffic and
            learning the code afterwards does not help: the key pair that
            encrypted it no longer exists anywhere.
          </p>
        </Section>

        <Section title="Two routes across">
          <p>
            Ferry prefers a direct browser-to-browser link. On a shared network
            the bytes go straight from one device to the other and the relay
            carries nothing at all.
          </p>
          <p>
            A small number of networks block that — some corporate Wi-Fi, some
            mobile carriers. Ferry notices and starts passing the same sealed
            frames through the relay instead. It is slower, and it is still
            unreadable to everyone in between.
          </p>
        </Section>

        <Section title="What arrives, and how long it stays">
          <p>
            Received items clear themselves: a password after two minutes, text
            after five, a file after fifteen. Each one offers you two more
            minutes, or a button to keep it for as long as the tab is open.
            Copying a password offers to wipe your clipboard afterwards.
          </p>
          <p>
            Files stream across in 64 KB pieces with backpressure, so a large
            transfer does not build up in memory. A single transfer can be up
            to 250 MB.
          </p>
        </Section>

        <Section title="What Ferry deliberately does not protect against">
          <ul className="ml-5 list-disc space-y-2 marker:text-hull-400">
            <li>
              Anyone who gets your code before the second device joins can take
              that place. A room holds two devices and no more, so if a stranger
              got there first your own device is refused and you will know. Treat
              the code the way you would a door key.
            </li>
            <li>
              A device that is already compromised. End-to-end encryption ends
              at the ends.
            </li>
            <li>
              Traffic analysis by the relay. It can see that two sockets
              exchanged some number of bytes at some time. It cannot see what
              they were.
            </li>
          </ul>
        </Section>

        <Section title="See for yourself">
          <p>
            Every claim on this page is in the source, and the properties are
            checked by tests that run against real WebCrypto on every change:
            that both sides agree on a key, that the two directions use
            different ones, that a peer with the wrong code is refused, that a
            tampered frame is rejected.
          </p>
          <p>
            <a
              className="font-medium text-sea-600 hover:underline dark:text-sea-400"
              href={repoUrl}
              rel="noreferrer"
            >
              Read the source on GitHub
            </a>{" "}
            or{" "}
            <Link className="font-medium text-sea-600 hover:underline dark:text-sea-400" href="/">
              open Ferry and try a crossing
            </Link>
            .
          </p>
        </Section>
      </article>
    </SiteChrome>
  );
}
