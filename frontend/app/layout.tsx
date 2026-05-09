import type { Metadata } from "next";
import { strings } from "@/lib/i18n/en";
import "./globals.css";

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
    <html lang="en">
      <body className="bg-brand-bg text-brand-primary antialiased">
        {children}
      </body>
    </html>
  );
}
