"use client";

import Link from "next/link";
import Reveal from "./Reveal";

export default function CallToAction() {
  return (
    <section className="relative overflow-hidden py-24">
      {/* shimmering accent band */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 opacity-30 animate-gradient-pan"
        style={{
          backgroundImage:
            "linear-gradient(120deg, rgb(var(--color-brand-accent) / 0.15), transparent 30%, rgb(var(--color-brand-verified) / 0.12) 60%, transparent 90%)",
          backgroundSize: "200% 200%",
        }}
      />

      <div className="mx-auto max-w-3xl px-6 text-center">
        <Reveal>
          <h2 className="font-serif text-3xl font-bold text-brand-primary sm:text-4xl">
            Pull up a chair. Bring a fact pattern.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-brand-secondary">
            The judge query set drops at kickoff. We&apos;d rather show you
            the system than describe it — try a question, watch the
            citations.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/research"
              className="group inline-flex items-center gap-2 rounded-full bg-brand-accent px-7 py-3.5 text-sm font-semibold text-white shadow-lg transition-all hover:bg-brand-accent-hover hover:shadow-xl animate-glow"
            >
              Open the research console
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
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-brand-surface px-7 py-3.5 text-sm font-semibold text-brand-primary transition-colors hover:border-brand-accent hover:text-brand-accent"
            >
              Read the architecture
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
