"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import DatasetStatus from "@/components/DatasetStatus";
import SearchPanel from "@/components/SearchPanel";
import ResultsPanel from "@/components/ResultsPanel";
import SourceViewer from "@/components/SourceViewer";
import type { SearchRequest, StatuteResult } from "@/lib/types";

// Citation regex — mirrors the fast-path in SearchPanel and backend
// TODO: confirm canonical form with Person 4 (docs/api.md)
const CITATION_RE = /^(cal\.?\s*veh\.?\s*code\s*)?§?\s*\d{4,5}(\([a-z]\))?$/i;

export default function HomePage() {
  const [results, setResults] = useState<StatuteResult[]>([]);
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<string | null>(null);

  async function handleSearch(request: SearchRequest) {
    setQuery(request.query);
    setIsSearching(true);
    setSelectedCitation(null);

    try {
      // Citation shortcut: skip search and open viewer directly
      // TODO: refine regex with Person 4 once canonical form is in docs/api.md
      if (CITATION_RE.test(request.query.trim())) {
        setSelectedCitation(request.query.trim());
        setResults([]);
        return;
      }

      const res = await api.search(request);
      setResults(res.results);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  function handleSelectResult(result: StatuteResult) {
    setSelectedCitation(result.citation);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between border-b border-brand-border bg-brand-surface px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-lg">CaseLogic</span>
          <span className="text-xs text-brand-muted">
            Source-grounded legal research
          </span>
        </div>
        <DatasetStatus />
      </header>

      {/* Three-column research layout per baseline architecture §12 */}
      {/* TODO: make columns collapsible on narrow viewports */}
      <main className="flex-1 grid grid-cols-[280px_1fr_320px] divide-x divide-brand-border overflow-hidden">

        {/* Left — Search + Filters */}
        <aside className="overflow-y-auto p-4">
          <SearchPanel onSearch={handleSearch} isLoading={isSearching} />
        </aside>

        {/* Middle — Results */}
        <section className="overflow-y-auto p-4">
          <ResultsPanel
            results={results}
            isLoading={isSearching}
            query={query}
            onSelect={handleSelectResult}
            selectedCitation={selectedCitation ?? undefined}
          />
        </section>

        {/* Right — Source viewer */}
        {/* TODO: Phase 2 swap this for VerificationPanel when OpenClaw is wired */}
        <aside className="overflow-y-auto p-4">
          <SourceViewer citation={selectedCitation} />
        </aside>
      </main>

      <footer className="border-t border-brand-border bg-brand-surface px-6 py-2 text-xs text-brand-muted text-center">
        Research prototype. Not legal advice. Results limited to indexed public
        sources.
      </footer>
    </div>
  );
}
