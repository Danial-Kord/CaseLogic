import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CaseLogic — Source-grounded PI legal research",
  description:
    "Hackathon prototype for personal-injury legal research. Source-grounded answers from public case law.",
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
