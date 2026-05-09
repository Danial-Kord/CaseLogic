import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Mirrors baseline Section 7 palette, with accent retuned to EvenUp's
        // electric blue (#436BF5) for brand consistency with evenuplaw.com.
        brand: {
          bg: "#F8FAFC",
          surface: "#FFFFFF",
          primary: "#0F172A",
          secondary: "#334155",
          muted: "#64748B",
          border: "#E2E8F0",
          accent: "#436BF5",
          "accent-hover": "#1B51F3",
          verified: "#16A34A",
          warning: "#D97706",
          error: "#DC2626",
        },
      },
      fontFamily: {
        // Inter for body/UI, PT Serif for editorial headings — matches
        // EvenUp's pairing.
        sans: ["var(--font-sans)", ...defaultTheme.fontFamily.sans],
        serif: ["var(--font-serif)", ...defaultTheme.fontFamily.serif],
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "modal-in": {
          "0%": {
            opacity: "0",
            transform: "translateY(12px) scale(0.97)",
          },
          "100%": {
            opacity: "1",
            transform: "translateY(0) scale(1)",
          },
        },
      },
      animation: {
        "fade-in": "fade-in 180ms ease-out",
        "modal-in": "modal-in 240ms cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
