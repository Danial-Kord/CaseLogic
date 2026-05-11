import type { Config } from "tailwindcss";
import defaultTheme from "tailwindcss/defaultTheme";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  // Class-based dark mode: the inline bootstrap script in app/layout.tsx
  // adds `.dark` to <html> based on the user's stored preference (or
  // their OS setting when no choice has been made).
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Brand palette resolves to CSS variables defined in app/globals.css.
        // The `<alpha-value>` placeholder is what makes `bg-brand-accent/5`
        // and similar opacity utilities keep working with variables.
        brand: {
          bg: "rgb(var(--color-brand-bg) / <alpha-value>)",
          surface: "rgb(var(--color-brand-surface) / <alpha-value>)",
          primary: "rgb(var(--color-brand-primary) / <alpha-value>)",
          secondary: "rgb(var(--color-brand-secondary) / <alpha-value>)",
          muted: "rgb(var(--color-brand-muted) / <alpha-value>)",
          border: "rgb(var(--color-brand-border) / <alpha-value>)",
          accent: "rgb(var(--color-brand-accent) / <alpha-value>)",
          "accent-hover": "rgb(var(--color-brand-accent-hover) / <alpha-value>)",
          verified: "rgb(var(--color-brand-verified) / <alpha-value>)",
          warning: "rgb(var(--color-brand-warning) / <alpha-value>)",
          error: "rgb(var(--color-brand-error) / <alpha-value>)",
        },
      },
      fontFamily: {
        // Inter for body/UI, PT Serif for editorial headings.
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
        // Landing-page motion. Kept here so any component can opt in,
        // and so the durations live alongside the theme.
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "gradient-pan": {
          "0%, 100%": { "background-position": "0% 50%" },
          "50%": { "background-position": "100% 50%" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        "float-slow": {
          "0%, 100%": { transform: "translate3d(0,0,0)" },
          "50%": { transform: "translate3d(8px, -16px, 0)" },
        },
        "blink-caret": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        // Soft pulsing glow for accent buttons / hero CTA.
        glow: {
          "0%, 100%": {
            "box-shadow":
              "0 0 0 0 rgb(var(--color-brand-accent) / 0.45)",
          },
          "50%": {
            "box-shadow":
              "0 0 0 14px rgb(var(--color-brand-accent) / 0)",
          },
        },
        shimmer: {
          "0%": { "background-position": "-200% 0" },
          "100%": { "background-position": "200% 0" },
        },
      },
      animation: {
        "fade-in": "fade-in 180ms ease-out",
        "modal-in": "modal-in 240ms cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-up": "fade-up 600ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "gradient-pan": "gradient-pan 14s ease-in-out infinite",
        float: "float 6s ease-in-out infinite",
        "float-slow": "float-slow 11s ease-in-out infinite",
        "blink-caret": "blink-caret 1s steps(1) infinite",
        glow: "glow 2.4s ease-in-out infinite",
        shimmer: "shimmer 2.4s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
