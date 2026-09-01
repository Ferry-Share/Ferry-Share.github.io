"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Button, Icon } from "./ui";

/* ------------------------------------------------------------------ */
/* Renderer                                                            */
/* ------------------------------------------------------------------ */

/**
 * QR codes are always drawn dark-on-white regardless of theme — inverted
 * codes are unreliable for a lot of phone cameras.
 */
export function QrCode({ value, label }: { value: string; label: string }) {
  const [markup, setMarkup] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(value, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 0,
      color: { dark: "#0C1D23", light: "#00000000" },
    })
      .then((svg) => {
        if (!cancelled) setMarkup(svg);
      })
      .catch(() => {
        if (!cancelled) setMarkup(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-hull-900/10">
      <div
        role="img"
        aria-label={label}
        className="aspect-square w-full [&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={markup ? { __html: markup } : undefined}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Scanner                                                             */
/* ------------------------------------------------------------------ */

type ScannerStatus = "idle" | "starting" | "scanning" | "denied" | "unsupported";

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
}

export function QrScanner({
  onResult,
  onCancel,
}: {
  onResult: (value: string) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;

    async function run() {
      if (!window.isSecureContext) {
        setStatus("unsupported");
        setNote(
          "Cameras are only available over HTTPS. Type the ten character code instead.",
        );
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported");
        setNote("This browser will not give the page camera access.");
        return;
      }

      setStatus("starting");
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
      } catch {
        setStatus("denied");
        setNote("Camera access was refused. Type the code instead.");
        return;
      }

      const video = videoRef.current;
      if (!video || stopped) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      setStatus("scanning");

      const DetectorCtor = (
        window as unknown as {
          BarcodeDetector?: new (options: { formats: string[] }) => BarcodeDetectorLike;
        }
      ).BarcodeDetector;

      const detector = DetectorCtor ? new DetectorCtor({ formats: ["qr_code"] }) : null;
      const jsQR = detector ? null : (await import("jsqr")).default;

      const tick = async () => {
        if (stopped || !videoRef.current) return;
        const element = videoRef.current;

        if (element.readyState === element.HAVE_ENOUGH_DATA) {
          try {
            if (detector) {
              const [hit] = await detector.detect(element);
              if (hit?.rawValue) return finish(hit.rawValue);
            } else if (jsQR) {
              const canvas = canvasRef.current;
              const context = canvas?.getContext("2d", { willReadFrequently: true });
              if (canvas && context) {
                const width = 420;
                const height = Math.round(
                  (element.videoHeight / element.videoWidth) * width,
                );
                canvas.width = width;
                canvas.height = height;
                context.drawImage(element, 0, 0, width, height);
                const pixels = context.getImageData(0, 0, width, height);
                const hit = jsQR(pixels.data, width, height, {
                  inversionAttempts: "dontInvert",
                });
                if (hit?.data) return finish(hit.data);
              }
            }
          } catch {
            /* A single bad frame is not worth surfacing. */
          }
        }
        frame = requestAnimationFrame(() => void tick());
      };

      const finish = (value: string) => {
        stopped = true;
        onResult(value);
      };

      frame = requestAnimationFrame(() => void tick());
    }

    void run();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onResult]);

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl bg-hull-950 aspect-[4/3]">
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full object-cover"
        />
        <canvas ref={canvasRef} className="hidden" />

        {status === "scanning" ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="relative h-40 w-40 rounded-xl ring-2 ring-signal-400/90">
              <span className="absolute inset-x-2 top-1/2 h-px bg-signal-400/80 shadow-[0_0_12px_2px] shadow-signal-400/60" />
            </div>
          </div>
        ) : null}

        {status !== "scanning" ? (
          <div className="absolute inset-0 grid place-items-center bg-hull-950/80 px-6 text-center text-sm text-fog-200">
            {note ?? "Waking the camera…"}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-hull-500 dark:text-hull-400">
          Point at the code on the other screen.
        </p>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <Icon name="close" className="h-4 w-4" />
          Stop
        </Button>
      </div>
    </div>
  );
}
