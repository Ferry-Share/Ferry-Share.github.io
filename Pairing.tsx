"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatPin, isCompletePin, normalizePin, PIN_LENGTH } from "@/lib/crypto";
import type { Session, SessionState } from "@/lib/session";
import { copyToClipboard } from "@/lib/utils";
import { Button, Icon, useToast } from "./ui";
import { QrCode, QrScanner } from "./Qr";

type Mode = "choose" | "host" | "join";

export function Pairing({
  session,
  state,
  autoPin,
}: {
  session: Session;
  state: SessionState;
  autoPin: string | null;
}) {
  const [mode, setMode] = useState<Mode>("choose");
  const toast = useToast();

  // A shared link lands here with the code already in the fragment.
  useEffect(() => {
    if (!autoPin || state.phase !== "idle") return;
    setMode("join");
    void session.join(autoPin);
  }, [autoPin, session, state.phase]);

  useEffect(() => {
    if (state.phase === "ended") setMode("choose");
  }, [state.phase]);

  const startHosting = useCallback(() => {
    setMode("host");
    void session.host();
  }, [session]);

  if (state.phase === "verifying") {
    return <Verify session={session} state={state} />;
  }

  if (mode === "host") {
    return (
      <HostPlate
        state={state}
        onRestart={() => {
          session.reset();
          startHosting();
        }}
        onCancel={() => {
          session.reset();
          setMode("choose");
        }}
        toast={toast}
      />
    );
  }

  if (mode === "join") {
    return (
      <JoinPlate
        session={session}
        state={state}
        initialPin={autoPin ?? ""}
        onBack={() => {
          session.reset();
          setMode("choose");
        }}
      />
    );
  }

  return <Choose onHost={startHosting} onJoin={() => setMode("join")} />;
}

/* ------------------------------------------------------------------ */
/* Step 1 — pick a side                                                */
/* ------------------------------------------------------------------ */

function Choose({ onHost, onJoin }: { onHost: () => void; onJoin: () => void }) {
  return (
    <div className="plate overflow-hidden">
      <div className="border-b border-hull-200/70 px-6 py-7 sm:px-8 dark:border-hull-800">
        <h2 className="text-2xl font-semibold sm:text-[28px]">
          Open a crossing between two devices
        </h2>
        <p className="mt-2 max-w-prose text-hull-600 dark:text-hull-300">
          One device opens the crossing and shows a code. The other reads it.
          From then on the two talk directly, and everything in between is
          encrypted with a key neither the relay nor anyone else holds.
        </p>
      </div>

      <div className="grid gap-px bg-hull-200/70 sm:grid-cols-2 dark:bg-hull-800">
        <button
          type="button"
          onClick={onHost}
          className="group bg-white p-6 text-left transition-colors hover:bg-fog-50 sm:p-8 dark:bg-hull-900 dark:hover:bg-hull-800"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sea-600 text-white">
            <Icon name="bolt" className="h-5 w-5" />
          </span>
          <h3 className="mt-4 text-lg font-semibold">Open a crossing</h3>
          <p className="mt-1.5 text-sm text-hull-600 dark:text-hull-300">
            You get a QR code and a ten character code to hand to the other
            device.
          </p>
          <span className="mt-4 inline-flex items-center text-sm font-medium text-sea-600 group-hover:text-sea-700 dark:text-sea-400">
            Start here
          </span>
        </button>

        <button
          type="button"
          onClick={onJoin}
          className="group bg-white p-6 text-left transition-colors hover:bg-fog-50 sm:p-8 dark:bg-hull-900 dark:hover:bg-hull-800"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-hull-800 text-white dark:bg-hull-700">
            <Icon name="camera" className="h-5 w-5" />
          </span>
          <h3 className="mt-4 text-lg font-semibold">Come aboard</h3>
          <p className="mt-1.5 text-sm text-hull-600 dark:text-hull-300">
            Scan the code on the other screen, or type the ten characters.
          </p>
          <span className="mt-4 inline-flex items-center text-sm font-medium text-sea-600 group-hover:text-sea-700 dark:text-sea-400">
            Enter a code
          </span>
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 2a — hosting                                                   */
/* ------------------------------------------------------------------ */

function HostPlate({
  state,
  onRestart,
  onCancel,
  toast,
}: {
  state: SessionState;
  onRestart: () => void;
  onCancel: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const link = useMemo(() => {
    if (typeof window === "undefined" || !state.pin) return "";
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    return `${window.location.origin}${base}/#p=${state.pin}`;
  }, [state.pin]);

  if (state.phase === "error") {
    return <Problem message={state.error} onRetry={onRestart} onCancel={onCancel} />;
  }

  const waiting = state.phase === "waiting" || !state.peerPresent;

  return (
    <div className="plate overflow-hidden">
      <div className="flex flex-col gap-8 p-6 sm:p-8 lg:flex-row lg:items-start">
        <div className="mx-auto w-full max-w-[280px] shrink-0">
          {state.pin ? (
            <QrCode value={link} label="Pairing code for the other device" />
          ) : (
            <div className="aspect-square w-full animate-pulse rounded-2xl bg-hull-100 dark:bg-hull-800" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inset-0 rounded-full bg-signal-400 animate-pulseRing" />
              <span className="relative h-2.5 w-2.5 rounded-full bg-signal-500" />
            </span>
            <p className="text-sm font-medium text-hull-600 dark:text-hull-300" aria-live="polite">
              {waiting ? "Waiting for the other device" : "Other device found"}
            </p>
          </div>

          <h2 className="mt-3 text-2xl font-semibold sm:text-[26px]">
            Scan this from your other device
          </h2>
          <p className="mt-2 text-hull-600 dark:text-hull-300">
            Or open this page there and type the code below. It works on any
            device with a browser.
          </p>

          <div className="mt-6">
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-mono text-[30px] font-bold tracking-[0.14em] text-hull-900 sm:text-[36px] dark:text-fog-100">
                {formatPin(state.pin)}
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const ok = await copyToClipboard(formatPin(state.pin));
                  toast.push(ok ? "Code copied" : "Could not reach the clipboard", ok ? "good" : "bad");
                }}
              >
                <Icon name="copy" className="h-4 w-4" />
                Copy code
              </Button>
            </div>
            <p className="mt-2 text-[13px] text-hull-500 dark:text-hull-400">
              Read it aloud if you like — the code contains no letters that sound
              alike.
            </p>
          </div>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <Button
              onClick={async () => {
                if (navigator.share) {
                  try {
                    await navigator.share({ title: "Ferry", url: link });
                    return;
                  } catch {
                    /* The share sheet was dismissed. */
                  }
                }
                const ok = await copyToClipboard(link);
                toast.push(ok ? "Invite link copied" : "Could not reach the clipboard", ok ? "good" : "bad");
              }}
            >
              <Icon name="link" className="h-4 w-4" />
              Share an invite link
            </Button>
            <Button variant="ghost" onClick={onRestart}>
              <Icon name="refresh" className="h-4 w-4" />
              New code
            </Button>
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          </div>

          <p className="mt-6 border-t border-hull-200/70 pt-4 text-[13px] leading-relaxed text-hull-500 dark:border-hull-800 dark:text-hull-400">
            The code lives only in this tab and in the link fragment, which
            browsers never send to a server. Anyone holding it can join, so
            share it the way you would a door key.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 2b — joining                                                   */
/* ------------------------------------------------------------------ */

function JoinPlate({
  session,
  state,
  initialPin,
  onBack,
}: {
  session: Session;
  state: SessionState;
  initialPin: string;
  onBack: () => void;
}) {
  const [value, setValue] = useState(formatPin(initialPin));
  const [scanning, setScanning] = useState(false);
  const ready = isCompletePin(value);

  const submit = useCallback(() => {
    if (!ready) return;
    setScanning(false);
    void session.join(value);
  }, [ready, session, value]);

  const handleScan = useCallback(
    (raw: string) => {
      const fragment = raw.includes("#p=") ? raw.split("#p=")[1] : raw;
      const pin = normalizePin(fragment);
      setScanning(false);
      if (pin.length === PIN_LENGTH) {
        setValue(formatPin(pin));
        void session.join(pin);
      }
    },
    [session],
  );

  if (state.phase === "error") {
    return (
      <Problem
        message={state.error}
        onRetry={() => {
          session.reset();
          setValue("");
        }}
        onCancel={onBack}
      />
    );
  }

  if (state.phase === "connecting" || state.phase === "waiting") {
    return (
      <div className="plate p-8 text-center sm:p-12">
        <div className="mx-auto mb-5 h-1 w-40 overflow-hidden rounded-full bg-hull-200 dark:bg-hull-800">
          <div className="h-full w-1/3 rounded-full bg-sea-500 animate-sweep" />
        </div>
        <h2 className="text-xl font-semibold">Finding the other device</h2>
        <p className="mx-auto mt-2 max-w-sm text-hull-600 dark:text-hull-300">
          {state.phase === "waiting"
            ? "Nobody is holding this code yet. Leave this open — it will connect the moment the other side is ready."
            : "Agreeing on keys."}
        </p>
        <Button className="mt-6" variant="ghost" onClick={onBack}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="plate p-6 sm:p-8">
      <h2 className="text-2xl font-semibold">Come aboard</h2>
      <p className="mt-2 text-hull-600 dark:text-hull-300">
        Scan the code on the other screen, or type the ten characters below it.
      </p>

      <div className="mt-6 space-y-4">
        {scanning ? (
          <QrScanner onResult={handleScan} onCancel={() => setScanning(false)} />
        ) : (
          <Button block size="lg" onClick={() => setScanning(true)}>
            <Icon name="camera" className="h-5 w-5" />
            Scan the code
          </Button>
        )}

        <div className="flex items-center gap-3 text-[13px] text-hull-400">
          <span className="h-px flex-1 bg-hull-200 dark:bg-hull-800" />
          or type it
          <span className="h-px flex-1 bg-hull-200 dark:bg-hull-800" />
        </div>

        <div>
          <label
            htmlFor="pairing-code"
            className="mb-1.5 block text-sm font-medium text-hull-700 dark:text-hull-200"
          >
            Pairing code
          </label>
          <input
            id="pairing-code"
            value={value}
            onChange={(event) => setValue(formatPin(event.target.value))}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
            placeholder="XXXXX-XXXXX"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            aria-describedby="pairing-code-help"
            className="field font-mono text-center text-2xl tracking-[0.18em]"
          />
          <p
            id="pairing-code-help"
            className="mt-1.5 text-[13px] text-hull-500 dark:text-hull-400"
          >
            Dashes and spacing do not matter.
          </p>
        </div>

        <div className="flex gap-2.5">
          <Button variant="primary" size="lg" disabled={!ready} onClick={submit} block>
            Connect
          </Button>
          <Button variant="ghost" size="lg" onClick={onBack}>
            Back
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Step 3 — safety words                                               */
/* ------------------------------------------------------------------ */

function Verify({ session, state }: { session: Session; state: SessionState }) {
  return (
    <div className="plate p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sea-600/10 text-sea-700 dark:bg-sea-400/15 dark:text-sea-300">
          <Icon name="shield" className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-xl font-semibold">Check both screens show this</h2>
          <p className="mt-1.5 text-hull-600 dark:text-hull-300">
            These four words come from the key the two devices just agreed on.
            If they match, nothing slipped in between.
          </p>
        </div>
      </div>

      <ul className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {state.safetyWords.map((word, index) => (
          <li
            key={`${word}-${index}`}
            className="rounded-xl bg-fog-100 px-3 py-4 text-center font-mono text-[15px] font-bold text-hull-900 ring-1 ring-inset ring-hull-200 dark:bg-hull-950 dark:text-fog-100 dark:ring-hull-800"
          >
            {word}
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
        <Button variant="primary" size="lg" block onClick={() => session.confirmSafetyWords()}>
          <Icon name="check" className="h-5 w-5" />
          They match — continue
        </Button>
        <Button variant="ghost" size="lg" onClick={() => session.reset()}>
          They differ, stop
        </Button>
      </div>

      <p className="mt-4 text-[13px] text-hull-500 dark:text-hull-400">
        Different words on the two screens means someone is sitting in the
        middle. Stop and start over on a network you trust.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Problem({
  message,
  onRetry,
  onCancel,
}: {
  message: string | null;
  onRetry: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="plate p-8 sm:p-10">
      <h2 className="text-xl font-semibold text-buoy-600 dark:text-buoy-400">
        The crossing did not open
      </h2>
      <p className="mt-2 max-w-prose text-hull-600 dark:text-hull-300">
        {message ?? "Something went wrong while connecting."}
      </p>
      <div className="mt-6 flex gap-2.5">
        <Button variant="primary" onClick={onRetry}>
          Try again
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Start over
        </Button>
      </div>
    </div>
  );
}
