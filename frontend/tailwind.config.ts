import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Mirrors baseline Section 7 design palette so components stay on-brand.
        brand: {
          bg: "#F8FAFC",
          surface: "#FFFFFF",
          primary: "#0F172A",
          secondary: "#334155",
          muted: "#64748B",
          border: "#E2E8F0",
          accent: "#2563EB",
          verified: "#16A34A",
          warning: "#D97706",
          error: "#DC2626",
        },
      },
    },
  },
  plugins: [],
};

export default config;
