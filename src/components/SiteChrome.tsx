import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { withBasePath } from "@/lib/config";

/**
 * Header and footer for the written pages.
 *
 * These are server components on purpose. The app itself is client-only —
 * it needs WebCrypto and a camera — but a page explaining how the thing works
 * is worth rendering to plain HTML, so it can be read without JavaScript and
 * so a crawler sees prose rather than a loading bar.
 */

const NAV = [
  { href: "/how-it-works/", label: "How it works" },
  { href: "/about/", label: "About" },
];

function SiteHeader({ current }: { current?: string }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 py-5 sm:py-7">
      <Link href="/" className="flex items-center gap-2.5">
        <Image
          src={withBasePath("/logo.png")}
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 rounded-lg"
          priority
          unoptimized
        />
        <span className="font-display text-[19px] font-bold tracking-tight text-hull-900 dark:text-fog-100">
          Ferry
        </span>
      </Link>

      <nav className="flex items-center gap-1 text-[14.5px]" aria-label="Pages">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current === item.href ? "page" : undefined}
            className={
              current === item.href
                ? "rounded-lg px-3 py-1.5 font-medium text-hull-900 dark:text-fog-100"
                : "rounded-lg px-3 py-1.5 text-hull-600 hover:bg-hull-100 hover:text-hull-900 dark:text-hull-300 dark:hover:bg-hull-800 dark:hover:text-fog-100"
            }
          >
            {item.label}
          </Link>
        ))}
        <Link
          href="/"
          className="ml-1 inline-flex h-9 items-center rounded-xl bg-sea-600 px-4 text-[14.5px] font-medium text-white transition-colors hover:bg-sea-700"
        >
          Open Ferry
        </Link>
      </nav>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="mt-16 flex flex-col gap-3 border-t border-hull-200/70 pt-6 text-[13.5px] text-hull-500 sm:flex-row sm:items-center sm:justify-between dark:border-hull-800 dark:text-hull-400">
      <p>Ferry keeps no accounts, no logs and no copies.</p>
      <div className="flex flex-wrap items-center gap-4">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className="hover:underline">
            {item.label}
          </Link>
        ))}
        <a
          href="https://github.com/Ferry-Share/Ferry-Share.github.io"
          className="hover:underline"
          rel="noreferrer"
        >
          Source
        </a>
      </div>
    </footer>
  );
}

export function SiteChrome({
  current,
  children,
}: {
  current?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pb-12 sm:px-6">
      <SiteHeader current={current} />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

/** A titled block of prose. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-12 first:mt-0">
      <h2 className="text-[22px] font-semibold sm:text-2xl">{title}</h2>
      <div className="mt-3 space-y-4 text-[15.5px] leading-[1.75] text-hull-700 dark:text-hull-200">
        {children}
      </div>
    </section>
  );
}

/** The lead paragraph under a page title. */
export function Lede({ children }: { children: ReactNode }) {
  return (
    <p className="mt-4 text-[17.5px] leading-[1.65] text-hull-600 dark:text-hull-300">
      {children}
    </p>
  );
}
