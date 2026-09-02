"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/hooks/useSession";
import { normalizePin, PIN_LENGTH } from "@/lib/crypto";
import {
  defaultRelayUrl,
  getRelayUrl,
  getTurnConfig,
  isValidRelayUrl,
  setRelayUrl,
  setTurnConfig,
  withBasePath,
} from "@/lib/config";
import { Button, Icon, Sheet, ToastHost, useToast } from "./ui";
import { Pairing } from "./Pairing";
import { Workspace } from "./Workspace";

export default function Ferry() {
  return (
    <ToastHost>
      <Shell />
    </ToastHost>
  );
}

/**
 * A shared invite arrives as `#p=CODE`. Returns the normalised code, or null
 * when the fragment holds none — including when it is not decodable, which
 * would otherwise throw.
 */
function pinFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const match = /[#&]p=([^&]+)/.exec(window.location.hash);
  if (!match) return null;
  try {
    return normalizePin(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

function Shell() {
  const { session, state } = useSession();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const toast = useToast();

  // Read before first paint rather than in an effect, so pairing does not wait
  // on a second render.
  const [autoPin] = useState<string | null>(() => {
    const pin = pinFromHash();
    return pin?.length === PIN_LENGTH ? pin : null;
  });

  // Then scrub the code out of the address bar so the one secret in the whole
  // system does not sit there or in browser history.
  useEffect(() => {
    if (pinFromHash() === null) return;
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);

  useEffect(() => {
    if (state.error && state.phase !== "error") toast.push(state.error, "bad");
  }, [state.error, state.phase, toast]);

  const connected = state.phase === "ready";

  return (
    <>
      <Header onOpenSettings={() => setSettingsOpen(true)} />

      <main className="flex-1">
        {connected ? (
          <Workspace session={session} state={state} />
        ) : (
          <>
            {state.phase === "idle" || state.phase === "ended" ? <Hero /> : null}
            <Pairing session={session} state={state} autoPin={autoPin} />
          </>
        )}
      </main>

      <AppFooter onOpenSettings={() => setSettingsOpen(true)} />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Chrome                                                              */
/* ------------------------------------------------------------------ */

function Header({ onOpenSettings }: { onOpenSettings: () => void }) {
  // The inline script in the document head has already applied the saved
  // theme, so the class on <html> is the source of truth to start from.
  const [dark, setDark] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"),
  );

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("ferry.theme", next ? "dark" : "light");
  };

  return (
    <header className="flex items-center justify-between gap-4 py-5 sm:py-7">
      <a href="#main" className="flex items-center gap-2.5">
        <AppLogo />
        <span className="font-display text-[19px] font-bold tracking-tight text-hull-900 dark:text-fog-100">
          Ferry
        </span>
      </a>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={toggle} aria-label="Switch theme">
          {dark ? <SunGlyph /> : <MoonGlyph />}
        </Button>
        <Button variant="ghost" size="sm" onClick={onOpenSettings}>
          <Icon name="settings" className="h-4 w-4" />
          <span className="hidden sm:inline">Settings</span>
        </Button>
      </div>
    </header>
  );
}

function AppLogo() {
  // The ship on its own: the wordmark is already next to it in the header,
  // and served from this origin so no third party learns who visits.
  return (
    <Image
      src={withBasePath("/logo.png")}
      alt=""
      width={28}
      height={28}
      className="h-7 w-7 rounded-lg"
      priority
      unoptimized
    />
  );
}

function SunGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="10" cy="10" r="3.4" />
      <path d="M10 2.4v1.8M10 15.8v1.8M17.6 10h-1.8M4.2 10H2.4M15.4 4.6l-1.3 1.3M5.9 14.1l-1.3 1.3M15.4 15.4l-1.3-1.3M5.9 5.9L4.6 4.6" />
    </svg>
  );
}

function MoonGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d="M16.2 12.3A6.8 6.8 0 0 1 7.7 3.8a6.8 6.8 0 1 0 8.5 8.5z" />
    </svg>
  );
}

function Hero() {
  return (
    <section id="main" className="pb-8 pt-2 sm:pb-10">
      <h1 className="max-w-[19ch] text-[38px] font-bold leading-[1.05] sm:text-[54px]">
        Hand it to your other device.
      </h1>
      <p className="mt-4 max-w-prose text-[17px] text-hull-600 dark:text-hull-300">
        A password, a paragraph, a file. Ferry moves it across in a couple of
        seconds, encrypted the whole way, and keeps nothing once you close the
        tab.
      </p>
    </section>
  );
}

/**
 * The bar under the app itself. The page's own footer, with the links to the
 * written pages, sits below the prose further down — this one only carries
 * what belongs to the running app.
 */
function AppFooter({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="mt-14 flex flex-col gap-3 border-t border-hull-200/70 pt-6 text-[13.5px] text-hull-500 sm:flex-row sm:items-center sm:justify-between dark:border-hull-800 dark:text-hull-400">
      <p>
        Ferry keeps no accounts, no logs and no copies. Close the tab and the
        session is gone.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/how-it-works/" className="hover:underline">
          How it works
        </Link>
        <Link href="/faq/" className="hover:underline">
          FAQ
        </Link>
        <button
          type="button"
          onClick={onOpenSettings}
          className="font-medium text-sea-600 hover:underline dark:text-sea-400"
        >
          Relay and network settings
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} title="Relay and network" onClose={onClose}>
      {/* The sheet renders nothing while closed, so the form below mounts
          fresh on every open and reads what is stored as its initial state.
          No effect is needed to keep the two in step. */}
      <SettingsForm onClose={onClose} />
    </Sheet>
  );
}

function SettingsForm({ onClose }: { onClose: () => void }) {
  const stored = useMemo(() => getTurnConfig(), []);
  const [relay, setRelay] = useState(getRelayUrl);
  const [turnUrls, setTurnUrls] = useState(stored?.urls ?? "");
  const [turnUser, setTurnUser] = useState(stored?.username ?? "");
  const [turnPass, setTurnPass] = useState(stored?.credential ?? "");
  const toast = useToast();

  const save = () => {
    if (relay && !isValidRelayUrl(relay)) {
      toast.push("A relay address must start with ws:// or wss://", "bad");
      return;
    }
    setRelayUrl(relay);
    setTurnConfig(
      turnUrls
        ? { urls: turnUrls.trim(), username: turnUser.trim(), credential: turnPass.trim() }
        : null,
    );
    toast.push("Settings saved. They apply to your next session.", "good");
    onClose();
  };

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="relay-url" className="mb-1.5 block text-sm font-medium">
          Relay address
        </label>
        <input
          id="relay-url"
          value={relay}
          onChange={(event) => setRelay(event.target.value)}
          placeholder={defaultRelayUrl() || "wss://your-relay.example.com/ws"}
          spellCheck={false}
          className="field font-mono text-[13.5px]"
        />
        <p className="mt-1.5 text-[13px] text-hull-500 dark:text-hull-400">
          The relay introduces the two devices. It never sees your code or
          your data. Leave this blank to use the one shown above, or point it
          at your own.
        </p>
      </div>

      <details className="rounded-xl bg-fog-100 p-4 dark:bg-hull-950">
        <summary className="cursor-pointer text-sm font-medium">
          TURN server (only for stubborn networks)
        </summary>
        <div className="mt-4 space-y-3">
          <input
            value={turnUrls}
            onChange={(event) => setTurnUrls(event.target.value)}
            placeholder="turn:turn.example.com:3478"
            spellCheck={false}
            aria-label="TURN server address"
            className="field font-mono text-[13.5px]"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={turnUser}
              onChange={(event) => setTurnUser(event.target.value)}
              placeholder="Username"
              aria-label="TURN username"
              className="field text-[13.5px]"
            />
            <input
              value={turnPass}
              onChange={(event) => setTurnPass(event.target.value)}
              placeholder="Credential"
              type="password"
              aria-label="TURN credential"
              className="field text-[13.5px]"
            />
          </div>
          <p className="text-[13px] text-hull-500 dark:text-hull-400">
            Without TURN, a few restrictive networks cannot form a direct
            link. Ferry falls back to the relay in that case, which is still
            end-to-end encrypted but slower.
          </p>
        </div>
      </details>

      <div className="flex gap-2.5">
        <Button variant="primary" onClick={save} block>
          Save settings
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
