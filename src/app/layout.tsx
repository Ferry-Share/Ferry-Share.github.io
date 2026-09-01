import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, JetBrains_Mono, Public_Sans } from "next/font/google";
import "./globals.css";

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
  title: "Ferry — hand things between your devices",
  description:
    "Move a password, a piece of text or a file from one device to another. End-to-end encrypted, peer-to-peer where possible, and nothing is kept afterwards.",
  applicationName: "Ferry",
  manifest: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/manifest.webmanifest`,
  icons: {
    icon: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/icon.svg`,
  },
  openGraph: {
    title: "Ferry — hand things between your devices",
    description:
      "Move a password, a piece of text or a file from one device to another. End-to-end encrypted and nothing is kept afterwards.",
    type: "website",
  },
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
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className={`${display.variable} ${body.variable} ${mono.variable}`}>
        {children}
      </body>
    </html>
  );
}
