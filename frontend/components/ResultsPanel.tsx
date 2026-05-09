"use client";

import type { StatuteResult } from "@/lib/types";

interface ResultsPanelProps {
  results: StatuteResult[];
  isLoading: boolean;
  query: string;
  onSelect: (result: StatuteResult) => void;
  selectedCitation?: string;
}

export default function ResultsPanel({
  results,
  isLoading,
  query,
  onSelect,
  selectedCitation,
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
          isSelected={result.citation === selectedCitation}
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
  result: StatuteResult;
  isSelected: boolean;
  onSelect: (r: StatuteResult) => void;
}) {
  // TODO: wire "show more" toggle to expand to full complete_statute once
  // backend returns that field alongside the truncated text
  const TRUNCATE_AT = 280;
  const truncated =
    result.text.length > TRUNCATE_AT
      ? result.text.slice(0, TRUNCATE_AT) + "…"
      : result.text;

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
      {/* citation — monospace per design spec */}
      <p className="font-mono text-sm font-semibold text-brand-primary">
        {result.citation}
      </p>

      {/* statute text */}
      <p className="mt-1 text-sm text-brand-secondary">{truncated}</p>

      {/* factor chips */}
      {result.factors && result.factors.length > 0 && (
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

      {/* leginfo link — required on every result per hard constraints */}
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
