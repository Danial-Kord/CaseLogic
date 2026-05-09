"use client";

import { useState } from "react";
import { strings } from "@/lib/i18n/en";

interface PlanComposerProps {
  onSubmit: (incidentText: string) => void | Promise<void>;
  isSubmitting?: boolean;
}

const SAMPLE_PROMPTS: readonly string[] = [
  "Hit-and-run at intersection: opposing driver ran red light at high speed, my client (pedestrian) suffered a fractured tibia.",
  "Rear-end collision on I-5 in heavy rain; opposing driver was tailgating and admitted to texting just before impact.",
  "Single-vehicle crash: client was passenger; driver had a BAC of 0.12 and lost control on a curve at 65 mph in a 40 zone.",
];

/**
 * Empty-state composer shown inside `PlanWorkspace` when no plan is
 * selected. Submitting kicks off plan creation upstream — the parent
 * page handles the create + stream sequence so this component stays
 * presentational.
 */
export default function PlanComposer({
  onSubmit,
  isSubmitting = false,
}: PlanComposerProps) {
  const [text, setText] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isSubmitting) return;
    onSubmit(trimmed);
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-2xl px-4 pt-12 pb-8">
        <h1 className="font-serif text-2xl font-semibold text-brand-primary">
          {strings.planning.composer.headline}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-brand-secondary">
          {strings.planning.composer.subhead}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <label htmlFor="incident" className="sr-only">
            {strings.planning.composer.label}
          </label>
          <textarea
            id="incident"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={strings.planning.composer.placeholder}
            rows={6}
            className="w-full resize-y rounded-lg border border-brand-border bg-brand-surface px-4 py-3 text-sm text-brand-primary shadow-inner placeholder:text-brand-muted focus:border-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent/30"
            disabled={isSubmitting}
          />

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-brand-muted">
              {strings.planning.composer.disclaimer}
            </p>
            <button
              type="submit"
              disabled={!text.trim() || isSubmitting}
              className="rounded-full bg-brand-accent px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-accent-hover disabled:cursor-not-allowed disabled:bg-brand-muted/40 disabled:text-brand-muted"
            >
              {isSubmitting
                ? strings.planning.composer.submitting
                : strings.planning.composer.submit}
            </button>
          </div>
        </form>

        <div className="mt-10">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-brand-muted">
            {strings.planning.composer.samplesTitle}
          </h2>
          <ul className="mt-3 space-y-2">
            {SAMPLE_PROMPTS.map((sample) => (
              <li key={sample}>
                <button
                  type="button"
                  onClick={() => setText(sample)}
                  className="block w-full rounded-lg border border-brand-border bg-brand-bg/40 px-4 py-3 text-left text-sm text-brand-secondary transition-colors hover:border-brand-accent/50 hover:bg-brand-bg"
                  disabled={isSubmitting}
                >
                  {sample}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
