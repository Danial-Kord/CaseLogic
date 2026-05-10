"use client";

import { useMemo, useState } from "react";
import { strings } from "@/lib/i18n/en";
import type { MatchedVia, StatuteHit } from "@/lib/types";
import BookmarkButton from "../BookmarkButton";
import FactorChips from "../shared/FactorChips";
import { highlightLegal } from "../SourceViewer/highlightLegal";
import MatchedViaBadge from "./MatchedViaBadge";

const TRUNCATE_AT = 280;

type SortKey =
  | "state"
  | "citation"
  | "section"
  | "division"
  | "score"
  | "matched_via"
  | "factors";
type SortDir = "asc" | "desc";

// citation > hybrid > vector > keyword reflects retrieval-confidence ordering.
const MATCHED_VIA_ORDER: Record<MatchedVia, number> = {
  citation: 0,
  hybrid: 1,
  vector: 2,
  keyword: 3,
};

// Default direction when a column is first clicked. Score and factor count
// are most useful descending; everything else reads naturally ascending.
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  state: "asc",
  citation: "asc",
  section: "asc",
  division: "asc",
  score: "desc",
  matched_via: "asc",
  factors: "desc",
};

function sectionNumeric(s: string): number {
  const n = parseFloat(s);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
}

// Source value is e.g. "DIVISION 11. RULES OF THE ROAD [21000 - 23336]…" —
// compress to "Div. 11" for the table cell; full label stays in the title attr.
function shortDivision(d: string | null): string {
  if (!d) return "—";
  const m = d.match(/DIVISION\s+(\d+(?:\.\d+)?)/i);
  return m ? `Div. ${m[1]}` : d;
}

function compareHits(a: StatuteHit, b: StatuteHit, key: SortKey): number {
  switch (key) {
    case "state":
      return a.jurisdiction.localeCompare(b.jurisdiction);
    case "citation":
      return a.universal_citation.localeCompare(b.universal_citation);
    case "section":
      return sectionNumeric(a.section_number) - sectionNumeric(b.section_number);
    case "division":
      return (a.division ?? "").localeCompare(b.division ?? "");
    case "score":
      return a.score - b.score;
    case "matched_via":
      return MATCHED_VIA_ORDER[a.matched_via] - MATCHED_VIA_ORDER[b.matched_via];
    case "factors":
      return a.factors.length - b.factors.length;
  }
}

interface ResultsPanelProps {
  results: StatuteHit[];
  isLoading: boolean;
  query: string;
  onSelect: (result: StatuteHit) => void;
  selectedStatuteId?: string;
  /**
   * Optional. When provided, statute cross-references inside each row's
   * snippet (e.g. "RCW 46.61.5249", "§ 22350(a)") become clickable
   * buttons that jump straight to that statute. Bare "§ N" references
   * resolve against the row's jurisdiction.
   */
  onOpenStatute?: (statuteId: string) => void;
}

export default function ResultsPanel({
  results,
  isLoading,
  query,
  onSelect,
  selectedStatuteId,
  onOpenStatute,
}: ResultsPanelProps) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const copy = [...results];
    copy.sort((a, b) => {
      const cmp = compareHits(a, b, sortKey);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [results, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(DEFAULT_DIR[key]);
    }
  }

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

  const cols = strings.resultsPanel.col;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-brand-muted">
        {strings.resultsPanel.resultCount(results.length, query)}
      </p>
      <div className="overflow-x-auto rounded border border-brand-border">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <colgroup>
            <col className="w-[2.75rem]" />
            <col className="w-[3.5rem]" />
            <col className="w-[14rem]" />
            <col className="w-[5rem]" />
            <col className="w-[5rem]" />
            <col className="w-[4rem]" />
            <col className="w-[5rem]" />
            <col className="w-[10rem]" />
            <col />
          </colgroup>
          <thead className="bg-brand-surface text-left text-[11px] uppercase tracking-wide text-brand-muted">
            <tr>
              <th
                scope="col"
                className="w-11 px-0 py-2 text-center font-medium"
              >
                <span className="sr-only">{cols.bookmark}</span>
              </th>
              <SortableHeader
                label={cols.state}
                keyName="state"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
              />
              <SortableHeader
                label={cols.citation}
                keyName="citation"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
              />
              <SortableHeader
                label={cols.section}
                keyName="section"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
                align="right"
              />
              <SortableHeader
                label={cols.division}
                keyName="division"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
              />
              <SortableHeader
                label={cols.score}
                keyName="score"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
                align="right"
              />
              <SortableHeader
                label={cols.matchedVia}
                keyName="matched_via"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
              />
              <SortableHeader
                label={cols.factors}
                keyName="factors"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
              />
              <th className="px-2 py-2 font-medium">{cols.snippet}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const truncated =
                r.statute_text.length > TRUNCATE_AT
                  ? r.statute_text.slice(0, TRUNCATE_AT) + "…"
                  : r.statute_text;
              const isSelected = r.statute_id === selectedStatuteId;
              return (
                <tr
                  key={r.statute_id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(r)}
                  onKeyDown={(e) => e.key === "Enter" && onSelect(r)}
                  className={`cursor-pointer border-t border-brand-border align-top transition-colors hover:bg-brand-accent/5 ${
                    isSelected
                      ? "border-brand-accent bg-brand-accent/10"
                      : "border-brand-border"
                  }`}
                >
                  <td className="px-0 py-2 text-center align-middle">
                    <BookmarkButton hit={r} />
                  </td>
                  <td className="px-2 py-2">
                    <span
                      title={
                        strings.jurisdiction.labels[r.jurisdiction] ??
                        r.jurisdiction
                      }
                      className="inline-block rounded bg-brand-bg px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-muted"
                    >
                      {r.jurisdiction}
                    </span>
                  </td>
                  <td className="px-2 py-2">
                    <a
                      href={r.official_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={strings.resultsPanel.leginfoLink}
                      className="block truncate font-mono text-sm font-semibold text-brand-primary hover:underline"
                    >
                      {r.universal_citation}
                    </a>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                    {r.section_number}
                  </td>
                  <td
                    className="whitespace-nowrap px-2 py-2 text-brand-secondary"
                    title={r.division ?? undefined}
                  >
                    {shortDivision(r.division)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                    {r.score.toFixed(3)}
                  </td>
                  <td className="px-2 py-2">
                    <MatchedViaBadge matchedVia={r.matched_via} />
                  </td>
                  <td className="px-2 py-2">
                    <FactorChips factors={r.factors} />
                  </td>
                  <td className="px-2 py-2 text-sm text-brand-secondary">
                    <span className="line-clamp-2 leading-relaxed">
                      {highlightLegal(truncated, {
                        onCiteClick: onOpenStatute,
                        defaultJurisdiction: r.jurisdiction,
                        currentStatuteId: r.statute_id,
                      })}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface SortableHeaderProps {
  label: string;
  keyName: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: (k: SortKey) => void;
  align?: "left" | "right";
}

function SortableHeader({
  label,
  keyName,
  sortKey,
  sortDir,
  onClick,
  align = "left",
}: SortableHeaderProps) {
  const isActive = sortKey === keyName;
  const ariaSort: "ascending" | "descending" | "none" = !isActive
    ? "none"
    : sortDir === "asc"
      ? "ascending"
      : "descending";
  const justify = align === "right" ? "justify-end" : "justify-start";
  return (
    <th
      aria-sort={ariaSort}
      scope="col"
      className="px-2 py-2 font-medium"
    >
      <button
        type="button"
        onClick={() => onClick(keyName)}
        className={`flex w-full items-center gap-1 uppercase tracking-wide hover:text-brand-primary ${justify} ${
          isActive ? "text-brand-primary" : ""
        }`}
      >
        <span>{label}</span>
        {isActive && (
          <span aria-hidden="true" className="font-sans text-[9px] leading-none">
            {sortDir === "asc" ? "▲︎" : "▼︎"}
          </span>
        )}
      </button>
    </th>
  );
}
