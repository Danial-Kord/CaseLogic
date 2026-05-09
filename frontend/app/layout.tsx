import type { Metadata } from "next";
import { Inter, PT_Serif } from "next/font/google";
import { strings } from "@/lib/i18n/en";
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
    <html lang="en" className={`${inter.variable} ${ptSerif.variable}`}>
      <body className="bg-brand-bg text-brand-primary font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
