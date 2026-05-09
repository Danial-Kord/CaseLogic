"use client";

import type { StatuteHit } from "@/lib/types";

interface ResultsPanelProps {
  results: StatuteHit[];
  isLoading: boolean;
  query: string;
  onSelect: (result: StatuteHit) => void;
  selectedStatuteId?: string | null;
}

export default function ResultsPanel({
  results,
  isLoading,
  query,
  onSelect,
  selectedStatuteId,
}: ResultsPanelProps) {
  if (isLoading) {
    return (
      <div className="text-sm text-brand-muted animate-pulse">Searching…</div>
    );
  }

  if (!query) {
    return (
      <p className="text-sm text-brand-muted">
        Enter a query on the left to search statutes.
      </p>
    );
  }

  if (results.length === 0) {
    return (
      <p className="text-sm text-brand-muted">
        No statutes found for &ldquo;{query}&rdquo;.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-brand-muted">
        {results.length} result{results.length !== 1 ? "s" : ""} for &ldquo;
        {query}&rdquo;
      </p>
      {results.map((result) => (
        <ResultCard
          key={result.statute_id}
          result={result}
          isSelected={result.statute_id === selectedStatuteId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function ResultCard({
  result,
  isSelected,
  onSelect,
}: {
  result: StatuteHit;
  isSelected: boolean;
  onSelect: (r: StatuteHit) => void;
}) {
  const TRUNCATE_AT = 280;
  const truncated =
    result.statute_text.length > TRUNCATE_AT
      ? result.statute_text.slice(0, TRUNCATE_AT) + "…"
      : result.statute_text;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(result)}
      onKeyDown={(e) => e.key === "Enter" && onSelect(result)}
      className={`cursor-pointer rounded border p-3 transition-colors ${
        isSelected
          ? "border-brand-accent bg-blue-50"
          : "border-brand-border hover:border-brand-accent"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-sm font-semibold text-brand-primary">
          {result.universal_citation}
        </p>
        <span className="text-[10px] uppercase tracking-wide text-brand-muted">
          {result.matched_via}
        </span>
      </div>

      <p className="mt-1 text-sm text-brand-secondary">{truncated}</p>

      {result.factors.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {result.factors.map((f) => (
            <span
              key={f}
              className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-brand-accent"
            >
              {f}
            </span>
          ))}
        </div>
      )}

      <a
        href={result.official_url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="mt-2 inline-block text-xs text-brand-accent hover:underline"
      >
        Open on leginfo →
      </a>
    </div>
  );
}
