"use client";

import dynamic from "next/dynamic";
import Image from "next/image";

import { withBasePath } from "@/lib/config";

/**
 * The app, and what stands in for it until it loads.
 *
 * Ferry itself cannot be rendered on a server: it needs WebCrypto, WebRTC and
 * a camera. What *can* be rendered is the part of the front page that is
 * words — the heading and the sentence under it — and that is what this shell
 * is. It ships in the HTML, so a reader with a slow connection sees the page
 * rather than a blank rectangle, and a crawler that does not run JavaScript
 * sees what the page is about rather than a spinner.
 *
 * The app replaces it with the same heading and sentence the moment it
 * mounts, so nothing here is written for machines that a person would not
 * also see.
 */
const Ferry = dynamic(() => import("./Ferry"), {
  ssr: false,
  loading: () => <AppShell />,
});

export function FerryApp() {
  return <Ferry />;
}

function AppShell() {
  return (
    <>
      <header className="flex items-center justify-between gap-4 py-5 sm:py-7">
        <span className="flex items-center gap-2.5">
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
        </span>
      </header>

      <main className="flex-1">
        <section id="main" className="pb-8 pt-2 sm:pb-10">
          <h1 className="max-w-[19ch] text-[38px] font-bold leading-[1.05] sm:text-[54px]">
            Hand it to your other device.
          </h1>
          <p className="mt-4 max-w-prose text-[17px] text-hull-600 dark:text-hull-300">
            A password, a paragraph, a file. Ferry moves it across in a couple
            of seconds, encrypted the whole way, and keeps nothing once you
            close the tab.
          </p>
        </section>

        <div className="plate flex items-center gap-4 p-6">
          <div
            className="h-1 w-40 overflow-hidden rounded-full bg-hull-200 dark:bg-hull-800"
            role="progressbar"
            aria-label="Starting Ferry"
          >
            <div className="h-full w-1/3 rounded-full bg-sea-500 animate-sweep" />
          </div>
          <p className="text-[14.5px] text-hull-600 dark:text-hull-300">
            Starting Ferry…
          </p>
        </div>

        <noscript>
          <p className="mt-4 text-[14.5px] text-hull-600 dark:text-hull-300">
            Ferry does its encryption in the browser, so it needs JavaScript to
            run. Everything below explains what it does and how; nothing is
            sent anywhere until you start a transfer yourself.
          </p>
        </noscript>
      </main>
    </>
  );
}
