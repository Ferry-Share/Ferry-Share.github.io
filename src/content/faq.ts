/**
 * The questions people actually ask before trusting a transfer tool.
 *
 * Every answer here is a claim about the code, so each one is written to be
 * checkable against it: the sizes, the timers and the algorithms are the real
 * ones. This list is the single source for the FAQ page, its FAQPage
 * structured data and the short set shown on the front page, so the three can
 * never drift apart.
 *
 * Answers are plain sentences on purpose. They are read by people scanning a
 * page, by search engines that quote one paragraph as an answer, and by
 * assistants summarising what this tool is — and all three do better with a
 * direct first sentence than with a wind-up.
 */
export interface Faq {
  question: string;
  answer: string;
  /** Shown on the front page as well as the FAQ page. */
  featured?: boolean;
}

export const faqs: Faq[] = [
  {
    question: "What is Ferry?",
    answer:
      "Ferry is a free, open-source web app for sending a password, a piece of text or a file from one of your devices to another. The two browsers connect directly and everything is encrypted end to end, so nothing is uploaded to a server and nothing is kept afterwards. You open the page on both devices, match a code, and send.",
    featured: true,
  },
  {
    question: "Is Ferry free, and is there a catch?",
    answer:
      "It is free with no paid tier, no usage limit and no upsell. There is nothing to buy because there is nothing to run at scale: with no accounts and no stored files, the only always-on piece is a small relay that introduces two browsers to each other. The source is MIT licensed, so you can also host the whole thing yourself.",
    featured: true,
  },
  {
    question: "Do I need an account to use it?",
    answer:
      "No. There is no sign-up, no email address and no identity of any kind. Open the page and it works. Because there is no account, there is also no profile, no history and nothing to delete later.",
    featured: true,
  },
  {
    question: "Are my files uploaded to a server?",
    answer:
      "No. Where the network allows it — which is most of the time, and always on a shared Wi-Fi network — the bytes travel directly from one browser to the other over WebRTC and never touch a server at all. On networks that block direct connections, the same already-encrypted frames are forwarded through a relay that cannot read them and does not store them.",
    featured: true,
  },
  {
    question: "How is the transfer encrypted?",
    answer:
      "Each side generates a throwaway P-256 key pair and they perform an ECDH key agreement. The shared secret is run through HKDF salted with a value derived from your pairing code, and the result encrypts every payload with AES-256-GCM, in separate keys for each direction. All of it happens in the browser through WebCrypto. The keys exist only in memory and are gone when the tab closes.",
    featured: true,
  },
  {
    question: "How large a file can I send?",
    answer:
      "Up to 250 MB in a single transfer. Files stream across in 64 KB pieces with backpressure, so a large one does not build up in memory on either device. There is no limit on how many transfers you make.",
    featured: true,
  },
  {
    question: "How do I know nobody is intercepting the transfer?",
    answer:
      "After the two devices agree on a key, both screens show the same four words, derived from that key. If the words match, the two devices hold the same key and there is no third party in between. If they differ, stop — that is exactly what the check is for. You do not have to trust the relay or the people running it to make that judgement.",
    featured: true,
  },
  {
    question: "What happens to what I receive?",
    answer:
      "It clears itself. A received password disappears after two minutes, text after five, a file after fifteen. Each item offers you two more minutes or a button to keep it while the tab stays open, and copying a password offers to wipe your clipboard afterwards. Close the tab and everything goes with it.",
  },
  {
    question: "Does Ferry keep logs or analytics?",
    answer:
      "No. There are no analytics, no tracking pixels and no third-party scripts. Fonts and images are served from the same origin as the page, so no other company learns that you visited. The relay keeps no record of who paired with whom; it is handed a hash of your code rather than the code, and it only ever sees ciphertext.",
    featured: true,
  },
  {
    question: "Which devices and browsers does it work on?",
    answer:
      "Any modern browser that supports WebCrypto and WebRTC — Chrome, Edge, Firefox and Safari — on Windows, macOS, Linux, Android and iOS. There is nothing to install, and it works between different platforms: Android to Windows, iPhone to Linux, or any other pairing.",
    featured: true,
  },
  {
    question: "Can I use it to send a password?",
    answer:
      "Yes, and it is one of the things Ferry is designed for. A password sent this way never sits in an inbox, a chat history or a clipboard manager on somebody else's server. On the receiving device it is masked until you reveal it, clears itself after two minutes, and copying it offers to wipe the clipboard afterwards.",
  },
  {
    question: "Does it work without the internet, on a local network?",
    answer:
      "Yes. Running `npm run lan` from the source serves both the app and its own relay from one machine, so two devices on the same Wi-Fi can pair with nothing leaving the building. You can also point the hosted app at your own relay under Settings, if you would rather not use the one this project runs.",
  },
  {
    question: "What is the pairing code, exactly?",
    answer:
      "Ten characters of Crockford base-32 — about fifty bits — drawn from your browser's cryptographic random source. It is shown as a QR code so the second device can scan it, and it is the only secret in the system. When it travels in a link it sits after the # , the part of a URL browsers never send to a server.",
  },
  {
    question: "What can Ferry not protect me from?",
    answer:
      "Three things, stated plainly. Anyone who learns your code before your second device joins can take that place — though a room holds only two devices, so your own device would be refused and you would notice. A device that is already compromised, because end-to-end encryption ends at the ends. And traffic analysis by the relay, which can see that two sockets exchanged some number of bytes at some time, but not what they were.",
  },
  {
    question: "Is Ferry open source?",
    answer:
      "Yes, under the MIT licence, and the cryptographic properties are covered by tests that run against real WebCrypto on every change: that both sides agree on a key, that the two directions use different ones, that a peer with the wrong code is refused, and that a tampered frame is rejected. You can read the source, run the tests, or host your own copy.",
    featured: true,
  },
];

export const featuredFaqs = faqs.filter((faq) => faq.featured);
