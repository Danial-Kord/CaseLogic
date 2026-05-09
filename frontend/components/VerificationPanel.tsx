"use client";

import { useState } from "react";
import { strings } from "@/lib/i18n/en";
import type { VerificationReport } from "@/lib/types";

interface VerificationPanelProps {
  report: VerificationReport | null | undefined;
  /**
   * Optional className passthrough so callers (ChatThread, future placements)
   * can tune spacing without forking the component.
   */
  className?: string;
}

/**
 * Citation + quote audit chip rendered under each assistant message.
 *
 * - Green when every citation and quoted span maps to retrieved evidence.
 * - Amber with an expandable list of findings when something's off.
 * - Neutral grey when there was nothing to verify (no citations or
 *   quotes in the answer at all).
 *
 * The component never silently hides claims — that's the whole point per
 * CLAUDE.md ("Unsupported claims get flagged, not hidden"). When the
 * status is "unsupported" the lawyer can click through to see exactly
 * which spans the verifier couldn't trace.
 */
export default function VerificationPanel({
  report,
  className = "",
}: VerificationPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!report) return null;

  const status = report.status;
  const t = strings.verification;
  const label = t.statusLabel[status];
  const tooltip =
    status === "clean"
      ? t.tooltipClean
      : status === "unsupported"
        ? t.tooltipUnsupported
        : t.tooltipSkipped;

  const hasFindings =
    report.unsupported_citations.length + report.unsupported_quotes.length > 0;

  return (
    <div
      className={`rounded-lg border ${badgeBorder(status)} ${badgeBg(status)} ${className}`}
      data-testid="verification-panel"
      data-status={status}
    >
      <div className="flex items-start gap-2 px-3 py-2 text-xs">
        <StatusIcon status={status} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span
              className={`font-medium ${badgeText(status)}`}
              title={tooltip}
            >
              {label}
            </span>
            {status !== "skipped" && (
              <span className="text-brand-muted">
                {t.summary(
                  report.citations_supported,
                  report.citations_total,
                  report.quotes_supported,
                  report.quotes_total,
                )}
              </span>
            )}
            {status === "skipped" && (
              <span className="text-brand-muted">{t.skippedHint}</span>
            )}
          </div>
        </div>
        {hasFindings && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="shrink-0 rounded-md border border-amber-400/40 bg-white/60 px-2 py-0.5 text-[11px] font-medium text-amber-800 transition-colors hover:bg-white dark:border-amber-300/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
          >
            {expanded ? t.hideDetails : t.showDetails}
          </button>
        )}
      </div>

      {expanded && hasFindings && (
        <div className="space-y-3 border-t border-amber-400/30 px-3 py-3 text-xs dark:border-amber-300/20">
          {report.unsupported_citations.length > 0 && (
            <FindingSection
              title={t.unsupportedCitationsTitle}
              items={report.unsupported_citations.map((c) => ({
                key: `c-${c.offset}-${c.text}`,
                label: c.text,
                meta: c.jurisdiction
                  ? `${c.jurisdiction} \u00b7 \u00a7 ${c.section_number}`
                  : `\u00a7 ${c.section_number}`,
                reason: c.reason,
              }))}
            />
          )}
          {report.unsupported_quotes.length > 0 && (
            <FindingSection
              title={t.unsupportedQuotesTitle}
              items={report.unsupported_quotes.map((q) => ({
                key: `q-${q.offset}-${q.text.slice(0, 32)}`,
                label: `\u201c${truncate(q.text, 140)}\u201d`,
                meta: q.kind === "blockquote" ? "block quote" : undefined,
                reason: q.reason,
              }))}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface FindingSectionProps {
  title: string;
  items: Array<{
    key: string;
    label: string;
    meta?: string;
    reason: string;
  }>;
}

function FindingSection({ title, items }: FindingSectionProps) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-brand-muted">
        {title}
      </p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.key} className="leading-snug">
            <p className="font-mono text-[12px] text-brand-primary">
              {item.label}
            </p>
            {item.meta && (
              <p className="text-[11px] uppercase tracking-wide text-brand-muted">
                {item.meta}
              </p>
            )}
            <p className="mt-0.5 text-brand-secondary">{item.reason}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusIcon({ status }: { status: VerificationReport["status"] }) {
  if (status === "clean") {
    return (
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 8.5l3 3 7-7" />
      </svg>
    );
  }
  if (status === "unsupported") {
    return (
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600 dark:text-amber-300"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 1.5l7 13H1l7-13z" />
        <path d="M8 6.5v3.5" />
        <circle cx="8" cy="12" r="0.6" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand-muted"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="6" />
      <path d="M5.5 8h5" />
    </svg>
  );
}

function badgeBorder(status: VerificationReport["status"]) {
  if (status === "clean") return "border-emerald-300/50 dark:border-emerald-400/20";
  if (status === "unsupported")
    return "border-amber-400/50 dark:border-amber-300/30";
  return "border-brand-border";
}

function badgeBg(status: VerificationReport["status"]) {
  if (status === "clean") return "bg-emerald-50/60 dark:bg-emerald-500/5";
  if (status === "unsupported") return "bg-amber-50/70 dark:bg-amber-500/10";
  return "bg-brand-bg/40";
}

function badgeText(status: VerificationReport["status"]) {
  if (status === "clean") return "text-emerald-800 dark:text-emerald-200";
  if (status === "unsupported") return "text-amber-800 dark:text-amber-200";
  return "text-brand-secondary";
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "\u2026";
}
