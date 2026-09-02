import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, JetBrains_Mono, Public_Sans } from "next/font/google";

import { basePath, pageUrl, siteUrl } from "./site";
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

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Ferry Sri Lanka — Secure Device-to-Device File Transfer",
    template: "%s — Ferry",
  },
  description:
    "Ferry is a fast, secure file sharing app for Sri Lanka. Move passwords, text, and files between your devices with end-to-end encryption and no account required.",
  keywords: [
    "Sri Lanka file sharing",
    "secure file transfer Sri Lanka",
    "device to device transfer",
    "encrypted file sharing",
    "send files phone to laptop",
    "Ferry Sri Lanka",
  ],
  applicationName: "Ferry",
  // No `languages` here: hreflang alternates would be claiming Sinhala and
  // Tamil versions of the page, and both would serve the same English one.
  alternates: { canonical: basePath || "/" },
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
    title: {
    default: "Ferry Sri Lanka — Secure Device-to-Device File Transfer",
    template: "%s — Ferry",
  },
    description:
      "Securely transfer files, text, and passwords between your devices in Sri Lanka with Ferry. End-to-end encrypted and no data stored.",
    type: "website",
    url: pageUrl,
    siteName: "Ferry Sri Lanka",
    locale: "en_LK",
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
    title: {
    default: "Ferry Sri Lanka — Secure Device-to-Device File Transfer",
    template: "%s — Ferry",
  },
    description:
      "Private file and text sharing for Sri Lankan users. End-to-end encrypted, account-free, and instant across devices.",
    images: [socialCard],
  },
  category: "technology",
  robots: { index: true, follow: true },
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Ferry Sri Lanka",
    url: pageUrl,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web Browser",
    browserRequirements: "Requires WebCrypto and WebRTC. Chrome, Edge, Firefox or Safari.",
    // English only. Listing si-LK and ta-LK would be describing translations
    // that do not exist.
    inLanguage: "en",
    areaServed: { "@type": "Country", name: "Sri Lanka" },
    // Free, and saying so is what lets search engines show it as free rather
    // than leaving the price unknown.
    offers: { "@type": "Offer", price: 0, priceCurrency: "LKR" },
    isAccessibleForFree: true,
    image: socialCard,
    description:
      "Secure device-to-device transfer for files, text, and passwords with end-to-end encryption.",
  };

  return (
    <html lang="en-LK" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <meta name="geo.region" content="LK" />
        <meta name="geo.placename" content="Sri Lanka" />
        <meta name="language" content="English" />
        <meta name="distribution" content="global" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>
        {children}
      </body>
    </html>
  );
}
