"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { classNames } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-sea-600 text-white hover:bg-sea-700 active:bg-sea-700 disabled:bg-hull-300 dark:disabled:bg-hull-700",
  secondary:
    "bg-white text-hull-800 ring-1 ring-inset ring-hull-200 hover:bg-fog-100 dark:bg-hull-800 dark:text-fog-100 dark:ring-hull-700 dark:hover:bg-hull-700",
  ghost:
    "text-hull-600 hover:bg-hull-100 hover:text-hull-900 dark:text-hull-300 dark:hover:bg-hull-800 dark:hover:text-fog-100",
  danger:
    "bg-buoy-500 text-white hover:bg-buoy-600 disabled:bg-hull-300 dark:disabled:bg-hull-700",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-xl gap-2",
  lg: "h-12 px-6 text-[15px] rounded-xl gap-2",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  block?: boolean;
}

export function Button({
  variant = "secondary",
  size = "md",
  block,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      className={classNames(
        "inline-flex select-none items-center justify-center font-medium transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sea-500",
        "disabled:cursor-not-allowed disabled:opacity-70",
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        className,
      )}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

interface Toast {
  id: number;
  message: string;
  tone: "neutral" | "good" | "bad";
  action?: { label: string; run: () => void };
}

interface ToastApi {
  push: (
    message: string,
    tone?: Toast["tone"],
    action?: Toast["action"],
  ) => void;
}

const ToastContext = createContext<ToastApi>({ push: () => {} });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const push = useCallback<ToastApi["push"]>((message, tone = "neutral", action) => {
    counter.current += 1;
    const id = counter.current;
    setToasts((current) => [...current.slice(-2), { id, message, tone, action }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, action ? 9_000 : 4_000);
  }, []);

  const api = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={classNames(
              "pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-lift animate-surface",
              toast.tone === "good" && "bg-sea-700 text-white",
              toast.tone === "bad" && "bg-buoy-600 text-white",
              toast.tone === "neutral" && "bg-hull-900 text-fog-100",
            )}
          >
            <span className="flex-1">{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                onClick={toast.action.run}
                className="shrink-0 rounded-lg bg-white/15 px-2.5 py-1 text-[13px] font-medium hover:bg-white/25"
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Sheet                                                               */
/* ------------------------------------------------------------------ */

export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-hull-950/45 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-lg animate-surface rounded-t-plate bg-white p-6 shadow-lift sm:rounded-plate dark:bg-hull-900"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="font-display text-xl font-semibold text-hull-900 dark:text-fog-100">
            {title}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

const PATHS: Record<string, ReactNode> = {
  close: <path d="M5 5l10 10M15 5L5 15" />,
  copy: (
    <>
      <rect x="7" y="7" width="9" height="9" rx="2" />
      <path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
    </>
  ),
  download: (
    <>
      <path d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5" />
      <path d="M3.5 14.5V16a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-1.5" />
    </>
  ),
  key: (
    <>
      <circle cx="7" cy="7" r="3.2" />
      <path d="M9.3 9.3L16 16m-2.5-1.2l1.4-1.4m-3.2-.8l1.4-1.4" />
    </>
  ),
  text: (
    <>
      <path d="M4 5h12M4 9h12M4 13h7" />
    </>
  ),
  file: (
    <>
      <path d="M11 2.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 17.5h8a1.5 1.5 0 0 0 1.5-1.5V7z" />
      <path d="M11 2.5V7h4.5" />
    </>
  ),
  check: <path d="M4 10.5l4 4 8-9" />,
  shield: (
    <>
      <path d="M10 2.5l6 2.2v5c0 4-2.6 6.6-6 7.8-3.4-1.2-6-3.8-6-7.8v-5z" />
      <path d="M7.2 10.2l2 2 3.6-4" />
    </>
  ),
  settings: (
    <>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.6v2.2M10 15.2v2.2M17.4 10h-2.2M4.8 10H2.6M15.2 4.8l-1.5 1.5M6.3 13.7l-1.5 1.5M15.2 15.2l-1.5-1.5M6.3 6.3L4.8 4.8" />
    </>
  ),
  camera: (
    <>
      <path d="M2.8 6.5h2.6l1.1-2h6.9l1.1 2h2.7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" />
      <circle cx="10" cy="11" r="3" />
    </>
  ),
  link: (
    <>
      <path d="M8.3 11.7a3 3 0 0 0 4.2 0l2.4-2.4a3 3 0 0 0-4.2-4.2l-.9.9" />
      <path d="M11.7 8.3a3 3 0 0 0-4.2 0l-2.4 2.4a3 3 0 0 0 4.2 4.2l.9-.9" />
    </>
  ),
  bolt: <path d="M11 2.5L4.5 11H9l-.8 6.5L15.5 9H11z" />,
  cloud: (
    <>
      <path d="M6 15.5a3.5 3.5 0 0 1-.3-7 4.6 4.6 0 0 1 8.8 1.1A3.2 3.2 0 0 1 14 15.5z" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 5.5h11M8 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" />
      <path d="M6 5.5l.6 10a1 1 0 0 0 1 1h4.8a1 1 0 0 0 1-1l.6-10" />
    </>
  ),
  send: <path d="M3 10l14-6-5.2 14L9.6 12z" />,
  refresh: (
    <>
      <path d="M16.5 8a6.5 6.5 0 1 0-.6 5" />
      <path d="M16.8 3.5V8h-4.5" />
    </>
  ),
  eye: (
    <>
      <path d="M1.8 10S4.8 4.8 10 4.8 18.2 10 18.2 10 15.2 15.2 10 15.2 1.8 10 1.8 10z" />
      <circle cx="10" cy="10" r="2.3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M4 4l12 12" />
      <path d="M7.6 5.4A7.7 7.7 0 0 1 10 5c5.2 0 8.2 5 8.2 5a14 14 0 0 1-2.7 3.2M5.4 7.3A13.7 13.7 0 0 0 1.8 10s3 5 8.2 5c.9 0 1.7-.1 2.4-.4" />
    </>
  ),
};

export function Icon({
  name,
  className = "h-[18px] w-[18px]",
}: {
  name: keyof typeof PATHS | string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {PATHS[name] ?? null}
    </svg>
  );
}
