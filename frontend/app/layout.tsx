import type { Metadata } from "next";
import { Inter, PT_Serif } from "next/font/google";
import { strings } from "@/lib/i18n/en";
import { getInitialThemeScript } from "@/lib/theme";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const ptSerif = PT_Serif({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: strings.app.metaTitle,
  description: strings.app.metaDescription,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning is needed because the inline theme script
    // runs before React hydrates and may add a `dark` class — the SSR
    // markup won't match unless we tell React to skip the warning here.
    <html
      lang="en"
      className={`${inter.variable} ${ptSerif.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          // Pre-paint script: applies .dark to <html> synchronously based
          // on stored preference / OS setting, so the user never sees a
          // flash of the wrong theme on first paint.
          dangerouslySetInnerHTML={{ __html: getInitialThemeScript() }}
        />
      </head>
      <body className="bg-brand-bg text-brand-primary font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
