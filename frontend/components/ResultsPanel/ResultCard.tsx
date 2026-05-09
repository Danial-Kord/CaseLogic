"use client";

import { strings } from "@/lib/i18n/en";
import type { StatuteHit } from "@/lib/types";
import FactorChips from "../shared/FactorChips";
import MatchedViaBadge from "./MatchedViaBadge";

const TRUNCATE_AT = 280;

interface ResultCardProps {
  result: StatuteHit;
  isSelected: boolean;
  onSelect: (r: StatuteHit) => void;
}

export default function ResultCard({
  result,
  isSelected,
  onSelect,
}: ResultCardProps) {
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
      <div className="flex items-center gap-2 flex-wrap">
        <p className="font-mono text-sm font-semibold text-brand-primary">
          {result.universal_citation}
        </p>
        <MatchedViaBadge matchedVia={result.matched_via} />
      </div>

      <p className="mt-1 text-sm text-brand-secondary">{truncated}</p>

      <div className="mt-2">
        <FactorChips factors={result.factors} />
      </div>

      <a
        href={result.official_url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="mt-2 inline-block text-xs text-brand-accent hover:underline"
      >
        {strings.resultsPanel.leginfoLink}
      </a>
    </div>
  );
}
