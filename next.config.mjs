/**
 * Ferry — Next.js configuration
 *
 * The app is exported as a fully static bundle so it can be served from
 * GitHub Pages, any CDN, or the bundled LAN server in `server/lan.js`.
 *
 * NEXT_PUBLIC_BASE_PATH  e.g. "/ferry" when hosted at user.github.io/ferry
 * NEXT_PUBLIC_RELAY_URL  e.g. "wss://ferry-relay.onrender.com/ws"
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.replace(/\/$/, "") || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
