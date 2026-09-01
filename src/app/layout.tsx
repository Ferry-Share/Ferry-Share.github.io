import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, JetBrains_Mono, Public_Sans } from "next/font/google";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://ferry-share.github.io";
const pageUrl = `${siteUrl}${basePath || "/"}`;
const logoUrl =
  "https://res.cloudinary.com/dkj22lm1g/image/upload/v1788291772/Ferry_zs4ns4.webp";

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
  title: "Ferry Sri Lanka — Secure Device-to-Device File Transfer",
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
  alternates: {
    canonical: basePath || "/",
    languages: {
      "en-LK": basePath || "/",
      "si-LK": basePath || "/",
      "ta-LK": basePath || "/",
    },
  },
  manifest: `${basePath}/manifest.webmanifest`,
  icons: {
    icon: [logoUrl, `${basePath}/icon.svg`],
    apple: logoUrl,
    shortcut: logoUrl,
  },
  openGraph: {
    title: "Ferry Sri Lanka — Secure Device-to-Device File Transfer",
    description:
      "Securely transfer files, text, and passwords between your devices in Sri Lanka with Ferry. End-to-end encrypted and no data stored.",
    type: "website",
    url: pageUrl,
    siteName: "Ferry Sri Lanka",
    locale: "en_LK",
    images: [{ url: logoUrl, width: 1200, height: 630, alt: "Ferry Sri Lanka logo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ferry Sri Lanka — Secure Device-to-Device File Transfer",
    description:
      "Private file and text sharing for Sri Lankan users. End-to-end encrypted, account-free, and instant across devices.",
    images: [logoUrl],
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
    inLanguage: ["en-LK", "si-LK", "ta-LK"],
    areaServed: {
      "@type": "Country",
      name: "Sri Lanka",
    },
    image: logoUrl,
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
