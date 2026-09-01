"use client";

import dynamic from "next/dynamic";

// The whole app is browser-only: it depends on WebCrypto, WebRTC and the
// camera. Rendering it on the client avoids a hydration pass that could never
// match anyway.
const Ferry = dynamic(() => import("@/components/Ferry"), {
  ssr: false,
  loading: () => (
    <div className="mx-auto flex min-h-dvh max-w-5xl items-center justify-center px-6">
      <div className="h-1 w-40 overflow-hidden rounded-full bg-hull-200 dark:bg-hull-800">
        <div className="h-full w-1/3 rounded-full bg-sea-500 animate-sweep" />
      </div>
    </div>
  ),
});

export default function Page() {
  return <Ferry />;
}
