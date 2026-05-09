import Link from "next/link";
import { strings } from "@/lib/i18n/en";
import ThemeToggle from "@/components/ThemeToggle";
import Hero from "@/components/landing/Hero";
import Features from "@/components/landing/Features";
import HowItWorks from "@/components/landing/HowItWorks";
import CallToAction from "@/components/landing/CallToAction";

// Marketing landing for CaseLogic. The actual research console lives at
// /research; every CTA on this page links to it.
//
// This page is a server component on purpose — the children handle their
// own client-side animation. Keeping the shell on the server means the
// hero copy is in the initial HTML for SEO and renders before JS hydrates.
export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-brand-bg">
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Features />
        <HowItWorks />
        <CallToAction />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-brand-border bg-brand-surface/80 backdrop-blur supports-[backdrop-filter]:bg-brand-surface/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="flex items-baseline gap-2.5 group">
          <span className="font-serif text-lg font-semibold text-brand-primary transition-colors group-hover:text-brand-accent">
            {strings.app.name}
          </span>
          <span className="hidden text-xs text-brand-muted sm:inline">
            {strings.app.tagline}
          </span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-4">
          <a
            href="#how-it-works"
            className="hidden text-sm font-medium text-brand-secondary transition-colors hover:text-brand-primary sm:inline"
          >
            How it works
          </a>
          <Link
            href="/plans"
            className="hidden text-sm font-medium text-brand-secondary transition-colors hover:text-brand-primary sm:inline"
          >
            {strings.planning.nav.plans}
          </Link>
          <ThemeToggle />
          <Link
            href="/research"
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-accent-hover"
          >
            Launch
            <svg
              viewBox="0 0 16 16"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3.33 8h9.34M9.33 4l3.34 4-3.34 4" />
            </svg>
          </Link>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-brand-border bg-brand-surface/60 py-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 text-center text-xs text-brand-muted sm:flex-row sm:text-left">
        <p>{strings.app.disclaimer}</p>
        <p className="font-mono">
          © {new Date().getFullYear()} CaseLogic — hackathon prototype
        </p>
      </div>
    </footer>
  );
}
