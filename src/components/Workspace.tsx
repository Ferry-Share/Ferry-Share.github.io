"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { IncomingItem, OutgoingItem, Session, SessionState } from "@/lib/session";
import type { ItemKind } from "@/lib/protocol";
import { useTicker } from "@/hooks/useSession";
import { isRemembering } from "@/lib/reunion";
import {
  classNames,
  copyToClipboard,
  downloadBlob,
  formatBytes,
  formatCountdown,
  wipeClipboard,
} from "@/lib/utils";
import { Button, Icon, useToast } from "./ui";

const KIND_ICON: Record<ItemKind, string> = {
  password: "key",
  text: "text",
  file: "file",
};

export function Workspace({ session, state }: { session: Session; state: SessionState }) {
  const now = useTicker(state.incoming.length > 0, () => session.sweepExpired());

  return (
    <div className="space-y-5">
      <Ribbon session={session} state={state} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Composer session={session} outgoing={state.outgoing} />
        <Received session={session} items={state.incoming} now={now} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ribbon — the one loud element on the page                           */
/* ------------------------------------------------------------------ */

function Ribbon({ session, state }: { session: Session; state: SessionState }) {
  const direct = state.transportMode === "direct";
  const reconnecting = state.reconnecting;
  // Read at first render rather than in an effect. Ferry is loaded with
  // `ssr: false`, so this component only ever runs in a browser and there is
  // no server pass for localStorage to disagree with.
  const [remembering, setRemembering] = useState(isRemembering);
  const toast = useToast();

  const toggleRemember = () => {
    const next = !remembering;
    setRemembering(next);
    session.setRemember(next);
    toast.push(
      next
        ? "This device will show up under “pick up where you left off”"
        : "Forgotten. Remembered devices cleared.",
      "good",
    );
  };

  return (
    <div className="overflow-hidden rounded-card bg-hull-900 text-fog-100 shadow-lift dark:bg-hull-900">
      <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={classNames(
              "flex h-2.5 w-2.5 shrink-0 rounded-full",
              reconnecting
                ? "animate-pulse bg-signal-400 shadow-[0_0_10px_2px] shadow-signal-400/50"
                : "bg-sea-400 shadow-[0_0_10px_2px] shadow-sea-400/50",
            )}
          />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium">
              {reconnecting
                ? "Reconnecting…"
                : `Connected to ${state.peerName ?? "the other device"}`}
            </p>
            <p className="truncate text-[13px] text-hull-300">
              {reconnecting
                ? state.notice ??
                  "Rebuilding the link with the code you already used — nothing to scan."
                : direct
                  ? "Direct link — your data does not pass through the relay"
                  : "Relayed link — encrypted end to end, the relay only forwards"}
              {!reconnecting && state.roundTripMs !== null
                ? ` · ${state.roundTripMs} ms`
                : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* While the link is being rebuilt there is no route to describe
              yet, and showing the last one would be a claim about a
              connection that does not currently exist. */}
          {reconnecting ? null : (
            <span
              className={classNames(
                "chip shrink-0",
                direct ? "bg-sea-400/15 text-sea-300" : "bg-signal-400/15 text-signal-300",
              )}
            >
              <Icon name={direct ? "bolt" : "cloud"} className="h-3.5 w-3.5" />
              {direct ? "Peer to peer" : "Via relay"}
            </span>
          )}
          {reconnecting ? null : (
            <span className="hidden whitespace-nowrap font-mono text-[12.5px] text-hull-400 lg:inline">
              {state.safetyWords.join(" · ")}
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={remembering}
            title={
              remembering
                ? "Remembered — one tap to reconnect next time"
                : "Remember this device so you do not have to scan again"
            }
            className={classNames(
              "hover:bg-white/10 hover:text-white",
              remembering ? "text-sea-300" : "text-hull-200",
            )}
            onClick={toggleRemember}
          >
            <Icon name={remembering ? "check" : "refresh"} className="h-4 w-4" />
            <span className="hidden sm:inline">
              {remembering ? "Remembered" : "Remember"}
            </span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-hull-200 hover:bg-white/10 hover:text-white"
            onClick={() => session.end()}
          >
            Disconnect
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Composer                                                            */
/* ------------------------------------------------------------------ */

const TABS: { kind: ItemKind; label: string }[] = [
  { kind: "password", label: "Password" },
  { kind: "text", label: "Text" },
  { kind: "file", label: "File" },
];

function Composer({
  session,
  outgoing,
}: {
  session: Session;
  outgoing: OutgoingItem[];
}) {
  const [kind, setKind] = useState<ItemKind>("password");
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const sendText = useCallback(() => {
    if (!value.trim() && kind === "password") return;
    if (!value) return;
    const id = session.sendText(kind === "password" ? "password" : "text", value);
    if (id) {
      setValue("");
      setReveal(false);
      toast.push(kind === "password" ? "Password sent" : "Text sent", "good");
    }
  }, [kind, session, toast, value]);

  const sendFiles = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return;
      const { accepted, rejected } = session.sendFiles(Array.from(files));

      if (accepted.length) {
        toast.push(
          accepted.length === 1
            ? "1 file queued"
            : `${accepted.length} files queued — they go one at a time`,
          "good",
        );
      }
      // Saying which files did not make it beats a count that silently
      // disagrees with what the user dropped.
      if (rejected.length) {
        toast.push(
          rejected.length === 1
            ? rejected[0]
            : `${rejected.length} files were not queued. ${rejected[0]}`,
          "bad",
        );
      }
    },
    [session, toast],
  );

  // Paste a file anywhere on the page and it goes straight across.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = event.clipboardData?.files;
      if (files?.length && document.activeElement?.tagName !== "TEXTAREA") {
        event.preventDefault();
        sendFiles(files);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [sendFiles]);

  return (
    <section className="panel flex flex-col" aria-label="Send">
      <header className="flex items-center gap-1 border-b border-hull-200/70 p-2 dark:border-hull-800">
        {TABS.map((tab) => (
          <button
            key={tab.kind}
            type="button"
            onClick={() => {
              setKind(tab.kind);
              setReveal(false);
            }}
            aria-pressed={kind === tab.kind}
            className={classNames(
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              kind === tab.kind
                ? "bg-hull-900 text-white dark:bg-hull-700"
                : "text-hull-600 hover:bg-hull-100 dark:text-hull-300 dark:hover:bg-hull-800",
            )}
          >
            <Icon name={KIND_ICON[tab.kind]} className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </header>

      <div className="flex-1 p-5">
        {kind === "file" ? (
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              sendFiles(event.dataTransfer.files);
            }}
            className={classNames(
              "grid min-h-[190px] place-items-center rounded-xl border-2 border-dashed p-6 text-center transition-colors",
              dragging
                ? "border-sea-500 bg-sea-500/5"
                : "border-hull-200 dark:border-hull-700",
            )}
          >
            <div>
              <p className="text-hull-600 dark:text-hull-300">
                Drop files here, paste them, or
              </p>
              <Button className="mt-3" onClick={() => fileInput.current?.click()}>
                Choose files
              </Button>
              <p className="mt-3 text-[13px] text-hull-500 dark:text-hull-400">
                Pick as many as you like — they queue and go one at a time, up
                to 250 MB each. Nothing is uploaded; the bytes stream straight
                to the other device.
              </p>
            </div>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                sendFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </div>
        ) : (
          <div>
            <div className="relative">
              <textarea
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") sendText();
                }}
                rows={kind === "password" ? 2 : 7}
                spellCheck={kind !== "password"}
                autoComplete="off"
                placeholder={
                  kind === "password"
                    ? "Paste the password to hand over"
                    : "Type or paste anything — a link, a snippet, an address"
                }
                aria-label={kind === "password" ? "Password to send" : "Text to send"}
                className={classNames(
                  "field resize-none",
                  kind === "password" && "pr-11 font-mono",
                )}
                style={
                  kind === "password" && !reveal
                    ? ({ WebkitTextSecurity: "disc" } as React.CSSProperties)
                    : undefined
                }
              />
              {kind === "password" ? (
                <button
                  type="button"
                  onClick={() => setReveal((current) => !current)}
                  aria-label={reveal ? "Hide password" : "Show password"}
                  className="absolute right-2 top-2 rounded-lg p-2 text-hull-500 hover:bg-hull-100 dark:hover:bg-hull-800"
                >
                  <Icon name={reveal ? "eyeOff" : "eye"} className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[13px] text-hull-500 dark:text-hull-400">
                {kind === "password"
                  ? "Clears itself on the other device after two minutes."
                  : `${value.length} characters`}
              </p>
              <Button variant="primary" onClick={sendText} disabled={!value}>
                <Icon name="send" className="h-4 w-4" />
                Send
              </Button>
            </div>
          </div>
        )}
      </div>

      {outgoing.length > 0 ? <SendQueue session={session} outgoing={outgoing} /> : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* The send queue                                                      */
/* ------------------------------------------------------------------ */

const OUTGOING_LABEL: Record<OutgoingItem["state"], string> = {
  queued: "Waiting",
  sending: "Sending",
  delivered: "Delivered",
  failed: "Failed",
  cancelled: "Cancelled",
};

/**
 * What is going, what is waiting behind it, and what did not make it.
 *
 * Items go one at a time, so the honest thing to show is a line: the file on
 * the wire with its progress, and everything else with its place in the
 * queue rather than a progress bar that will sit at nothing.
 */
function SendQueue({
  session,
  outgoing,
}: {
  session: Session;
  outgoing: OutgoingItem[];
}) {
  const [showAll, setShowAll] = useState(false);
  const toast = useToast();

  const waiting = outgoing.filter((item) => item.state === "queued").length;
  const failed = outgoing.filter(
    (item) => item.state === "failed" && item.retryable,
  ).length;
  const finished = outgoing.filter(
    (item) => item.state !== "queued" && item.state !== "sending",
  ).length;

  // Oldest first while there is a queue: a line reads top to bottom, and the
  // next file to go is the one people look for.
  const ordered = waiting > 0 ? [...outgoing].reverse() : outgoing;
  const rows = showAll ? ordered : ordered.slice(0, 6);

  return (
    <div className="border-t border-hull-200/70 px-5 py-4 dark:border-hull-800">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-hull-500 dark:text-hull-400">
          {waiting > 0
            ? `Queue — ${waiting} waiting`
            : "Sent from this device"}
        </h3>
        <div className="flex items-center gap-1">
          {failed > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const again = session.retryAllFailed();
                if (again) toast.push(`Retrying ${again}`, "good");
              }}
            >
              Retry failed
            </Button>
          ) : null}
          {waiting > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const dropped = session.cancelQueued();
                if (dropped) toast.push(`Cleared ${dropped} from the queue`, "good");
              }}
            >
              Clear queue
            </Button>
          ) : null}
          {finished > 0 && waiting === 0 ? (
            <Button size="sm" variant="ghost" onClick={() => session.clearOutgoingHistory()}>
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      <ul className="space-y-2">
        {rows.map((item) => (
          <li key={item.id} className="text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-hull-700 dark:text-hull-200">
                {item.state === "queued" ? (
                  <span
                    className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-hull-200 font-mono text-[10px] font-bold text-hull-600 dark:bg-hull-800 dark:text-hull-300"
                    aria-hidden="true"
                  >
                    {item.place}
                  </span>
                ) : (
                  <Icon
                    name={KIND_ICON[item.kind]}
                    className="h-4 w-4 shrink-0 text-hull-400"
                  />
                )}
                <span
                  className={classNames(
                    "truncate",
                    (item.state === "cancelled" || item.state === "queued") &&
                      "text-hull-500 dark:text-hull-400",
                  )}
                >
                  {item.name ??
                    (item.kind === "password" ? "Password" : "Text snippet")}
                </span>
              </span>

              <span className="flex shrink-0 items-center gap-2">
                <span
                  className={classNames(
                    "text-[13px]",
                    item.state === "delivered" && "text-sea-600 dark:text-sea-400",
                    item.state === "failed" && "text-buoy-500",
                    (item.state === "sending" ||
                      item.state === "queued" ||
                      item.state === "cancelled") &&
                      "text-hull-500 dark:text-hull-400",
                  )}
                >
                  {item.state === "sending"
                    ? `${Math.round((item.sent / Math.max(1, item.size)) * 100)}%`
                    : item.state === "queued"
                      ? item.place === 1
                        ? "Next"
                        : `${item.place} in line`
                      : OUTGOING_LABEL[item.state]}
                </span>

                {item.state === "queued" || item.state === "sending" ? (
                  <button
                    type="button"
                    onClick={() => session.cancelOutgoing(item.id)}
                    aria-label={`Cancel ${item.name ?? "item"}`}
                    className="rounded-md p-1 text-hull-400 hover:bg-hull-100 hover:text-hull-700 dark:hover:bg-hull-800 dark:hover:text-fog-100"
                  >
                    <Icon name="close" className="h-3.5 w-3.5" />
                  </button>
                ) : null}

                {(item.state === "failed" || item.state === "cancelled") &&
                item.retryable ? (
                  <button
                    type="button"
                    onClick={() => session.retryOutgoing(item.id)}
                    className="rounded-md px-1.5 py-0.5 text-[12.5px] font-medium text-sea-600 hover:underline dark:text-sea-400"
                  >
                    Retry
                  </button>
                ) : null}
              </span>
            </div>

            {item.state === "sending" && item.size > 65_536 ? (
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-hull-200 dark:bg-hull-800">
                <div
                  className="h-full rounded-full bg-sea-500 transition-[width] duration-200"
                  style={{ width: `${(item.sent / Math.max(1, item.size)) * 100}%` }}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {ordered.length > rows.length || showAll ? (
        <button
          type="button"
          onClick={() => setShowAll((open) => !open)}
          className="mt-2.5 text-[13px] font-medium text-sea-600 hover:underline dark:text-sea-400"
        >
          {showAll ? "Show fewer" : `Show all ${ordered.length}`}
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Received                                                            */
/* ------------------------------------------------------------------ */

function Received({
  session,
  items,
  now,
}: {
  session: Session;
  items: IncomingItem[];
  now: number;
}) {
  return (
    <section className="panel flex flex-col" aria-label="Received">
      <header className="flex items-center justify-between border-b border-hull-200/70 px-5 py-3.5 dark:border-hull-800">
        <h2 className="text-[15px] font-semibold">Received here</h2>
        {items.length > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => session.clearAllIncoming()}>
            Clear all
          </Button>
        ) : null}
      </header>

      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <p className="max-w-[26ch] text-hull-500 dark:text-hull-400">
            Anything sent from the other device lands here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-hull-200/70 dark:divide-hull-800">
          {items.map((item) => (
            <ReceivedRow key={item.id} session={session} item={item} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReceivedRow({
  session,
  item,
  now,
}: {
  session: Session;
  item: IncomingItem;
  now: number;
}) {
  const [reveal, setReveal] = useState(false);
  const toast = useToast();
  const remaining = item.expiresAt ? item.expiresAt - now : null;

  const copy = async () => {
    if (!item.text) return;
    const ok = await copyToClipboard(item.text);
    if (!ok) {
      toast.push("Could not reach the clipboard", "bad");
      return;
    }
    if (item.kind === "password") {
      toast.push("Password copied — clear the clipboard when you are done", "good", {
        label: "Clear now",
        run: () => {
          void wipeClipboard();
          toast.push("Clipboard cleared", "good");
        },
      });
    } else {
      toast.push("Copied", "good");
    }
  };

  return (
    <li className="animate-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={classNames(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              item.kind === "password"
                ? "bg-buoy-500/10 text-buoy-500"
                : "bg-sea-600/10 text-sea-600 dark:bg-sea-400/15 dark:text-sea-300",
            )}
          >
            <Icon name={KIND_ICON[item.kind]} className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-hull-900 dark:text-fog-100">
              {item.name ?? (item.kind === "password" ? "Password" : "Text snippet")}
            </p>
            <p className="text-[13px] text-hull-500 dark:text-hull-400">
              {item.state === "receiving"
                ? `Receiving ${formatBytes(item.received)} of ${formatBytes(item.size)}`
                : formatBytes(item.size)}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => session.clearIncoming(item.id)}
          aria-label="Remove this item"
          className="shrink-0 rounded-lg p-1.5 text-hull-400 hover:bg-hull-100 hover:text-buoy-500 dark:hover:bg-hull-800"
        >
          <Icon name="trash" className="h-4 w-4" />
        </button>
      </div>

      {item.state === "receiving" ? (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-hull-200 dark:bg-hull-800">
          <div
            className="h-full rounded-full bg-sea-500 transition-[width] duration-200"
            style={{ width: `${(item.received / Math.max(1, item.size)) * 100}%` }}
          />
        </div>
      ) : null}

      {item.state === "complete" && item.kind !== "file" ? (
        <div className="mt-3">
          <pre
            className={classNames(
              "max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-fog-100 p-3 text-[13.5px] text-hull-800 dark:bg-hull-950 dark:text-hull-100",
              item.kind === "password" && "font-mono",
            )}
          >
            {item.kind === "password" && !reveal
              ? "•".repeat(Math.min(28, item.text?.length ?? 0))
              : item.text}
          </pre>
        </div>
      ) : null}

      {item.state === "complete" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {item.kind === "file" ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => item.blob && downloadBlob(item.blob, item.name ?? "file")}
            >
              <Icon name="download" className="h-4 w-4" />
              Save file
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={copy}>
              <Icon name="copy" className="h-4 w-4" />
              Copy
            </Button>
          )}

          {item.kind === "password" ? (
            <Button size="sm" variant="ghost" onClick={() => setReveal((r) => !r)}>
              <Icon name={reveal ? "eyeOff" : "eye"} className="h-4 w-4" />
              {reveal ? "Hide" : "Reveal"}
            </Button>
          ) : null}

          {remaining !== null ? (
            <span className="ml-auto flex items-center gap-2 text-[13px] text-hull-500 dark:text-hull-400">
              <span aria-live="off">Clears in {formatCountdown(remaining)}</span>
              <button
                type="button"
                onClick={() => session.extendIncoming(item.id)}
                className="font-medium text-sea-600 hover:underline dark:text-sea-400"
              >
                +2 min
              </button>
              <button
                type="button"
                onClick={() => session.keepIncoming(item.id)}
                className="font-medium text-sea-600 hover:underline dark:text-sea-400"
              >
                Keep
              </button>
            </span>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
