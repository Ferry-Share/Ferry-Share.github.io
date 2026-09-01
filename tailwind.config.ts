import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        hull: {
          50: "#F2F6F6",
          100: "#DDE8E8",
          200: "#BACFD1",
          300: "#8FAEB2",
          400: "#5D858B",
          500: "#3C666D",
          600: "#2A4F57",
          700: "#1E3D45",
          800: "#142B32",
          900: "#0C1D23",
          950: "#061217",
        },
        sea: {
          300: "#6FD5C6",
          400: "#3BBFAE",
          500: "#17A292",
          600: "#0C8377",
          700: "#0A6660",
        },
        signal: {
          300: "#FFD86B",
          400: "#F7C445",
          500: "#E9AE12",
          600: "#C08C06",
        },
        buoy: {
          400: "#F0705C",
          500: "#DE4E38",
          600: "#B93A26",
        },
        fog: {
          50: "#FBFCFC",
          100: "#F1F5F4",
          200: "#E4EAE9",
          300: "#D2DBDA",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "ui-sans-serif", "system-ui"],
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "18px",
        plate: "26px",
      },
      boxShadow: {
        plate:
          "0 1px 0 0 rgba(255,255,255,0.6) inset, 0 18px 46px -24px rgba(6,18,23,0.45)",
        lift: "0 10px 30px -18px rgba(6,18,23,0.55)",
      },
      keyframes: {
        sweep: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(220%)" },
        },
        surface: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseRing: {
          "0%": { transform: "scale(0.85)", opacity: "0.7" },
          "80%,100%": { transform: "scale(1.6)", opacity: "0" },
        },
      },
      animation: {
        sweep: "sweep 2.4s cubic-bezier(0.4,0,0.2,1) infinite",
        surface: "surface 260ms cubic-bezier(0.2,0.8,0.3,1) both",
        pulseRing: "pulseRing 2s ease-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
