export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function formatRate(bytes: number, ms: number): string {
  if (ms <= 0) return "";
  return `${formatBytes(Math.round((bytes / ms) * 1000))}/s`;
}

/** Clipboard write that still works on browsers without the async API. */
export async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* Fall through to the textarea approach. */
  }

  try {
    const scratch = document.createElement("textarea");
    scratch.value = value;
    scratch.setAttribute("readonly", "");
    scratch.style.position = "fixed";
    scratch.style.opacity = "0";
    document.body.appendChild(scratch);
    scratch.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(scratch);
    return ok;
  } catch {
    return false;
  }
}

/** Overwrite the clipboard so a copied password does not linger. */
export async function wipeClipboard(): Promise<boolean> {
  return copyToClipboard(" ");
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "ferry-download";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4_000);
}

export function classNames(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}
