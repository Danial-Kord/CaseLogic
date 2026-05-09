"use client";

import type { ReactNode } from "react";
import Reveal from "./Reveal";

interface Step {
  num: string;
  title: string;
  body: string;
  glyph: ReactNode;
}

const STEPS: Step[] = [
  {
    num: "01",
    title: "Ask in plain English",
    body: "Type a fact pattern, a citation, or a half-remembered phrase. CaseLogic figures out the jurisdiction and the legal hook.",
    glyph: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9 8.38 8.38 0 0 1 12.5 3a8.5 8.5 0 0 1 8.5 8.5z" />
      </svg>
    ),
  },
  {
    num: "02",
    title: "Hybrid retrieval finds receipts",
    body: "Vector embeddings, BM25, and metadata filters fan out across CA, FL, NY and WA. Reciprocal rank fusion picks the top candidates — every one with a public-source URL.",
    glyph: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="6" rx="8" ry="3" />
        <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
        <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
      </svg>
    ),
  },
  {
    num: "03",
    title: "Claude drafts; verifier checks",
    body: "Claude reads only the retrieved snippets and writes the answer. A verification pass tags every sentence as supported or unsupported before it reaches you.",
    glyph: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M9 13l2 2 4-4" />
      </svg>
    ),
  },
];

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative overflow-hidden py-24"
    >
      {/* faint diagonal grid background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(var(--color-brand-primary)) 1px, transparent 1px), linear-gradient(to right, rgb(var(--color-brand-primary)) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-brand-accent">
            How it works
          </p>
          <h2 className="mb-4 text-center font-serif text-3xl font-bold text-brand-primary sm:text-4xl">
            Retrieval first. Reasoning on top.
          </h2>
          <p className="mx-auto mb-14 max-w-2xl text-center text-base leading-relaxed text-brand-secondary">
            The pipeline is deliberately boring in the right places: no model
            memory, no creative paraphrasing of the law. Just retrieve, cite,
            verify.
          </p>
        </Reveal>

        <ol className="grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-4">
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.num} delayMs={i * 140}>
              <StepCard step={s} isLast={i === STEPS.length - 1} />
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

function StepCard({ step, isLast }: { step: Step; isLast: boolean }) {
  return (
    <div className="relative h-full">
      {/* connector line to next step (hidden on last + on mobile) */}
      {!isLast && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-full top-12 hidden h-px w-6 bg-gradient-to-r from-brand-border to-transparent md:block"
        />
      )}
      <div className="flex h-full flex-col gap-3 rounded-2xl border border-brand-border bg-brand-surface p-6 transition-all hover:border-brand-accent/50">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] font-semibold text-brand-muted">
            {step.num}
          </span>
          <span className="h-px flex-1 bg-brand-border" />
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-accent/10 text-brand-accent">
            <span className="block h-4 w-4">{step.glyph}</span>
          </span>
        </div>
        <h3 className="font-serif text-lg font-semibold text-brand-primary">
          {step.title}
        </h3>
        <p className="text-sm leading-relaxed text-brand-secondary">
          {step.body}
        </p>
      </div>
    </div>
  );
}
