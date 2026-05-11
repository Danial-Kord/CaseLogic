"use client";

import Link from "next/link";
import AnimatedDemo from "./AnimatedDemo";

export default function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Animated gradient background. The two large blurred orbs drift in
          opposite directions for a slow, organic motion. They use CSS
          variable colors so they re-tint automatically in dark mode. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div className="absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-brand-accent/20 blur-3xl animate-float-slow" />
        <div className="absolute -right-24 top-32 h-[26rem] w-[26rem] rounded-full bg-brand-verified/20 blur-3xl animate-float" />
        <div
          className="absolute inset-0 opacity-60 animate-gradient-pan"
          style={{
            backgroundImage:
              "radial-gradient(at 20% 0%, rgb(var(--color-brand-accent) / 0.10), transparent 50%), radial-gradient(at 80% 100%, rgb(var(--color-brand-accent) / 0.08), transparent 55%)",
            backgroundSize: "200% 200%",
          }}
        />
      </div>

      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 pb-24 pt-20 lg:grid-cols-[1.1fr_1fr] lg:pt-28">
        {/* COPY */}
        <div className="flex flex-col gap-6">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-brand-border bg-brand-surface px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-brand-muted shadow-sm animate-fade-up">
            <span className="relative inline-flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-verified opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-verified" />
            </span>
            CaseLogic · Source-Grounded Research
          </span>

          <h1
            className="font-serif text-4xl font-bold leading-[1.05] tracking-tight text-brand-primary animate-fade-up sm:text-5xl lg:text-6xl"
            style={{ animationDelay: "80ms" }}
          >
            Source-grounded research for{" "}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-brand-accent to-brand-verified bg-clip-text text-transparent">
                personal-injury
              </span>
              <svg
                aria-hidden="true"
                viewBox="0 0 200 8"
                className="absolute -bottom-1 left-0 h-2 w-full text-brand-accent/60"
              >
                <path
                  d="M2 5 C 50 1, 150 1, 198 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>{" "}
            attorneys.
          </h1>

          <p
            className="max-w-xl text-lg leading-relaxed text-brand-secondary animate-fade-up"
            style={{ animationDelay: "160ms" }}
          >
            Every claim cited. Every snippet verifiable. CaseLogic searches
            real public statutes and case law, then writes answers your
            associates can defend in chambers.
          </p>

          <div
            className="flex flex-wrap items-center gap-3 animate-fade-up"
            style={{ animationDelay: "240ms" }}
          >
            <Link
              href="/research"
              className="group relative inline-flex items-center gap-2 rounded-full bg-brand-accent px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-brand-accent-hover hover:shadow-xl animate-glow"
            >
              Launch the demo
              <svg
                viewBox="0 0 16 16"
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
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
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-brand-surface px-6 py-3 text-sm font-semibold text-brand-primary transition-colors hover:border-brand-accent hover:text-brand-accent"
            >
              How it works
            </a>
          </div>

          <dl
            className="mt-4 grid max-w-md grid-cols-3 gap-6 animate-fade-up"
            style={{ animationDelay: "320ms" }}
          >
            <Stat value="4" label="jurisdictions" />
            <Stat value="100%" label="cited" />
            <Stat value="<2s" label="retrieval" />
          </dl>
        </div>

        {/* DEMO */}
        <div
          className="relative flex justify-center lg:justify-end animate-fade-up"
          style={{ animationDelay: "400ms" }}
        >
          {/* Floating accent glyphs around the demo card. */}
          <FloatingGlyphs />
          <AnimatedDemo />
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-serif text-2xl font-bold text-brand-primary">
        {value}
      </span>
      <span className="text-[11px] font-medium uppercase tracking-wide text-brand-muted">
        {label}
      </span>
    </div>
  );
}

function FloatingGlyphs() {
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute -left-6 top-6 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-brand-border bg-brand-surface text-brand-accent shadow-lg animate-float"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
          <path d="M4 2.5a1.5 1.5 0 0 1 1.5-1.5h6.793A1.5 1.5 0 0 1 13.354 1.44l3.207 3.207a1.5 1.5 0 0 1 .439 1.06v11.793a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 17.5V2.5zM12 2H5.5a.5.5 0 0 0-.5.5V17.5a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5V6.207a.5.5 0 0 0-.146-.353L12.146 2.146A.5.5 0 0 0 11.793 2H12z" />
          <path d="M7 9h6v1H7zM7 11h6v1H7zM7 13h4v1H7z" />
        </svg>
      </span>
      <span
        aria-hidden="true"
        className="absolute -right-3 -top-4 inline-flex items-center gap-1 rounded-full border border-brand-accent/30 bg-brand-accent/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-brand-accent shadow-md animate-float-slow"
      >
        § 23103(a)
      </span>
      <span
        aria-hidden="true"
        className="absolute -bottom-2 left-8 inline-flex items-center gap-1.5 rounded-full border border-brand-verified/30 bg-brand-verified/10 px-2.5 py-1 text-[10px] font-semibold text-brand-verified shadow-md animate-float"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.707-9.293a1 1 0 0 0-1.414-1.414L9 10.586 7.707 9.293a1 1 0 0 0-1.414 1.414l2 2a1 1 0 0 0 1.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
        verified
      </span>
    </>
  );
}
