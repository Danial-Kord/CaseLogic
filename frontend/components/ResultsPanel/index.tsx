"use client";

import { strings } from "@/lib/i18n/en";
import type { StatuteHit } from "@/lib/types";
import ResultCard from "./ResultCard";

interface ResultsPanelProps {
  results: StatuteHit[];
  isLoading: boolean;
  query: string;
  onSelect: (result: StatuteHit) => void;
  selectedStatuteId?: string;
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
      <div className="text-sm text-brand-muted animate-pulse">
        {strings.resultsPanel.searching}
      </div>
    );
  }

  if (!query) {
    return (
      <p className="text-sm text-brand-muted">
        {strings.resultsPanel.enterQuery}
      </p>
    );
  }

  if (results.length === 0) {
    return (
      <p className="text-sm text-brand-muted">
        {strings.resultsPanel.noResults(query)}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-brand-muted">
        {strings.resultsPanel.resultCount(results.length, query)}
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
