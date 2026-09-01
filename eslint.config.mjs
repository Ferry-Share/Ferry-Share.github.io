import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/** @type {import('eslint').Linter.Config[]} */
const config = [
  { ignores: [".next/**", "out/**", "node_modules/**", "next-env.d.ts"] },
  ...coreWebVitals,
  ...typescript,
  {
    // The relay, the LAN host and their tests are plain CommonJS, run by Node
    // rather than bundled by Next.
    files: ["server/**/*.js", "scripts/**/*.js", "test/**/*.js"],
    languageOptions: { sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // The Worker relay is an ES module running on Cloudflare's runtime, not in
    // Node and not in the browser.
    files: ["worker/**/*.js"],
    languageOptions: { sourceType: "module" },
  },
];

export default config;
