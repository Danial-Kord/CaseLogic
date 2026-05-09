"use client";

import type { ReactNode } from "react";
import Reveal from "./Reveal";

interface Feature {
  icon: ReactNode;
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="6" />
        <path d="M20 20l-3.5-3.5" />
        <path d="M8 11h6M11 8v6" />
      </svg>
    ),
    title: "Hybrid retrieval",
    body: "Vector embeddings catch the gist. BM25 + FTS catches the exact phrase. Reciprocal-rank fusion picks the winners — so 'willful or wanton' never misses § 23103(a).",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l8 4v5c0 4-3.5 7.5-8 9-4.5-1.5-8-5-8-9V7l8-4z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
    title: "Cited or unsupported",
    body: "Every assertion carries a source URL and paragraph snippet. Unsupported claims are flagged, not hidden — judges (and your insurer) can verify in one click.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7h16M4 12h10M4 17h7" />
        <circle cx="18" cy="16" r="3" />
        <path d="M20.5 18.5L23 21" />
      </svg>
    ),
    title: "Lawyer-grade reading",
    body: "Subsections split out, terms-of-art highlighted, cross-references chipped. Skim a 1,200-word statute in eight seconds, not eight minutes.",
  },
];

export default function Features() {
  return (
    <section className="border-y border-brand-border bg-brand-surface/40 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-brand-accent">
            Built for the bar exam, not the buzzword bingo
          </p>
          <h2 className="mb-12 text-center font-serif text-3xl font-bold text-brand-primary sm:text-4xl">
            Three things every PI shop wants in a research tool
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delayMs={i * 120}>
              <FeatureCard {...f} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ icon, title, body }: Feature) {
  return (
    <div className="group relative h-full overflow-hidden rounded-2xl border border-brand-border bg-brand-surface p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand-accent/50 hover:shadow-xl">
      {/* hover-glow corner */}
      <div
        aria-hidden="true"
        className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-brand-accent/0 blur-2xl transition-all duration-500 group-hover:bg-brand-accent/20"
      />

      <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-accent/10 text-brand-accent transition-transform duration-300 group-hover:scale-110">
        <span className="block h-5 w-5">{icon}</span>
      </div>
      <h3 className="mb-2 font-serif text-xl font-semibold text-brand-primary">
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-brand-secondary">{body}</p>
    </div>
  );
}
