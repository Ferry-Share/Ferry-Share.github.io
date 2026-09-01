"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Session, type SessionState } from "@/lib/session";

export function useSession() {
  const session = useMemo(() => new Session(), []);

  const state = useSyncExternalStore<SessionState>(
    (listener) => session.subscribe(() => listener()),
    session.getState,
    session.getState,
  );

  useEffect(() => () => session.reset(), [session]);

  // Warn before a refresh throws away a live session.
  useEffect(() => {
    if (state.phase !== "ready") return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [state.phase]);

  return { session, state };
}

/** Re-renders once a second so countdown timers stay honest. */
export function useTicker(active: boolean, onTick?: () => void): number {
  const [now, setNow] = useState(() => Date.now());
  const callback = useRef(onTick);
  callback.current = onTick;

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setNow(Date.now());
      callback.current?.();
    }, 1_000);
    return () => clearInterval(id);
  }, [active]);

  return now;
}
