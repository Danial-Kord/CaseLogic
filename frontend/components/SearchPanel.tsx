"use client";

import { useState, useEffect } from "react";
import type { SearchRequest, FactorCategory } from "@/lib/types";
import { api } from "@/lib/api";

// TODO: confirm canonical citation form with Person 4 (docs/api.md)
// Matches: "Cal. Veh. Code § 23152(a)", "§ 23152", "23152(a)", "21453"
const CITATION_RE = /^(cal\.?\s*veh\.?\s*code\s*)?§?\s*\d{4,5}(\([a-z]\))?$/i;

interface SearchPanelProps {
  onSearch: (request: SearchRequest) => void;
  isLoading: boolean;
}

export default function SearchPanel({ onSearch, isLoading }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [factor, setFactor] = useState("");
  const [factors, setFactors] = useState<FactorCategory[]>([]);
  const [factorsError, setFactorsError] = useState(false);

  useEffect(() => {
    // TODO: replace mock with live GET /factors once Person 4's endpoint is up
    api
      .getFactors()
      .then((res) => setFactors(res.factors))
      .catch(() => setFactorsError(true));
  }, []);

  function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    onSearch({
      query: trimmed,
      filters: factor ? { factor } : undefined,
      top_k: 10,
    });
  }

  const looksLikeCitation = CITATION_RE.test(query.trim());

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="block text-xs font-medium text-brand-muted mb-1">
          Search statutes
        </label>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder={`"reckless driving"\n"Cal. Veh. Code § 23152(a)"\n"running a red light"`}
          rows={4}
          className="w-full rounded border border-brand-border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-accent"
        />
        {looksLikeCitation && (
          <p className="mt-1 text-xs text-brand-accent">
            Looks like a citation — will look up directly.
          </p>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-brand-muted mb-1">
          Contributing factor
        </label>
        {/* TODO: counts come from GET /factors; currently mocked */}
        <select
          value={factor}
          onChange={(e) => setFactor(e.target.value)}
          disabled={factorsError}
          className="w-full rounded border border-brand-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent disabled:opacity-50"
        >
          <option value="">All factors</option>
          {factors.map((f) => (
            <option key={f.factor} value={f.factor}>
              {f.factor} ({f.count})
            </option>
          ))}
        </select>
        {factorsError && (
          <p className="mt-1 text-xs text-brand-error">
            Could not load factors from backend.
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isLoading || !query.trim()}
        className="rounded bg-brand-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-blue-700 transition-colors"
      >
        {isLoading ? "Searching…" : "Search"}
      </button>
    </form>
  );
}
