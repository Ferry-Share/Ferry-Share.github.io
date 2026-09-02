import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, JetBrains_Mono, Public_Sans } from "next/font/google";

import { JsonLd } from "@/components/JsonLd";
import {
  authorName,
  authorUrl,
  basePath,
  featureList,
  pageUrl,
  pathFor,
  repoUrl,
  siteName,
  siteUrl,
  summary,
  urlFor,
} from "./site";
import "./globals.css";


/**
 * Everything the page references is served from this origin. A logo pulled
 * from someone else's CDN would hand that CDN the address of every visitor,
 * which is a strange thing to do on a page promising it keeps no record of
 * anyone. `npm run icons` regenerates these from assets/logo.png.
 */
const asset = (file: string) => `${basePath}/${file}`;
const socialCard = `${siteUrl}${asset("opengraph-image.png")}`;

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

const body = Public_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-mono",
  display: "swap",
});

/**
 * One title, used by the tab, the search result and every social preview.
 * It leads with the problem people search for rather than the product name,
 * because nobody looks for a tool they have not heard of by its name.
 */
const title = "Ferry — Secure, Private File Sharing Between Your Devices";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: title, template: "%s — Ferry" },
  description: summary,
  keywords: [
    "secure file sharing",
    "encrypted file transfer",
    "peer to peer file transfer",
    "send files phone to laptop",
    "share files between devices",
    "end-to-end encrypted file sharing",
    "file sharing without account",
    "private file transfer",
    "send a password securely",
    "browser to browser file transfer",
    "WebRTC file transfer",
    "open source file sharing",
    "AirDrop alternative for Android and Windows",
    "WeTransfer alternative",
    // Ferry is built in Sri Lanka and used there; the tool itself is not
    // regional, so these sit alongside the general terms rather than in the
    // title, where they would narrow what the page appears to be for.
    "secure file sharing Sri Lanka",
    "file transfer app Sri Lanka",
  ],
  applicationName: siteName,
  authors: [{ name: authorName, url: authorUrl }],
  creator: authorName,
  publisher: siteName,
  // No `languages` here: hreflang alternates would be claiming translations
  // of this page, and every one of them would serve the same English text.
  alternates: { canonical: pathFor("/") },
  manifest: `${basePath}/manifest.webmanifest`,
  icons: {
    icon: [
      { url: asset("icon-32.png"), sizes: "32x32", type: "image/png" },
      { url: asset("icon-192.png"), sizes: "192x192", type: "image/png" },
      { url: asset("icon-512.png"), sizes: "512x512", type: "image/png" },
    ],
    // iOS reads neither WebP nor SVG here, so this one has to be a PNG.
    apple: { url: asset("apple-touch-icon.png"), sizes: "180x180" },
    shortcut: asset("favicon.ico"),
  },
  openGraph: {
    title: { default: title, template: "%s — Ferry" },
    description: summary,
    type: "website",
    url: pageUrl,
    siteName,
    locale: "en_US",
    // 1200x630 is the ratio every platform crops to, and the card really is
    // that size — declaring it for a square image gets the artwork cropped.
    images: [
      {
        url: socialCard,
        width: 1200,
        height: 630,
        type: "image/png",
        alt: "Ferry — hand a password, a paragraph or a file to your other device.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: { default: title, template: "%s — Ferry" },
    description: summary,
    images: [socialCard],
  },
  category: "technology",
  // `max-snippet` and `max-image-preview` are what let a search engine — and
  // the assistants that read its index — quote more than a clipped line.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F1F5F4" },
    { media: "(prefers-color-scheme: dark)", color: "#061217" },
  ],
};

/** Applies the saved theme before first paint so there is no flash. */
const themeBootstrap = `
try {
  var saved = localStorage.getItem('ferry.theme');
  var dark = saved ? saved === 'dark'
    : window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (dark) document.documentElement.classList.add('dark');
} catch (e) {}
`;

/**
 * What the whole site is, in the vocabulary crawlers parse rather than the
 * prose they have to interpret.
 *
 * The nodes reference each other by `@id`, which is what turns four separate
 * claims into one description of a single thing. Everything here is checked
 * against the app: there is no rating, because nobody has rated it, and no
 * download count, because none is counted.
 */
const graph = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${pageUrl}#website`,
      url: pageUrl,
      name: siteName,
      description: summary,
      inLanguage: "en",
      publisher: { "@id": `${pageUrl}#author` },
    },
    {
      "@type": "Person",
      "@id": `${pageUrl}#author`,
      name: authorName,
      url: authorUrl,
      sameAs: [authorUrl, repoUrl],
    },
    {
      "@type": ["WebApplication", "SoftwareApplication"],
      "@id": `${pageUrl}#app`,
      name: siteName,
      alternateName: "Ferry Share",
      url: pageUrl,
      description:
        "Ferry is a free, open-source web app that transfers passwords, text and " +
        "files directly between two devices over an end-to-end encrypted " +
        "peer-to-peer connection. It requires no account, uploads nothing to a " +
        "server and stores nothing after the tab closes.",
      applicationCategory: "SecurityApplication",
      applicationSubCategory: "File Sharing",
      operatingSystem: "Any (web browser): Windows, macOS, Linux, Android, iOS",
      browserRequirements: "Requires WebCrypto and WebRTC. Chrome, Edge, Firefox or Safari.",
      // English only. Listing translations that do not exist misleads both
      // crawlers and the people they send here.
      inLanguage: "en",
      areaServed: "Worldwide",
      // Free, and saying so is what lets a search engine show it as free
      // rather than leaving the price unknown.
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
      },
      isAccessibleForFree: true,
      featureList,
      license: `${repoUrl}/blob/main/LICENSE`,
      softwareHelp: { "@type": "CreativeWork", url: urlFor("/how-it-works/") },
      codeRepository: repoUrl,
      author: { "@id": `${pageUrl}#author` },
      maintainer: { "@id": `${pageUrl}#author` },
      image: socialCard,
      screenshot: socialCard,
      sameAs: [repoUrl],
      // Stated plainly because it is the question every reader of this page
      // actually has, and a crawler cannot infer it from marketing copy.
      privacyPolicy: urlFor("/about/"),
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <JsonLd data={graph} />
      </head>
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>
        {children}
      </body>
    </html>
  );
}
