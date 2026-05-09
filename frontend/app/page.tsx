"use client";

import { useState } from "react";
import SearchPanel from "@/components/SearchPanel";
import ResultsPanel from "@/components/ResultsPanel";
import ComparisonTable from "@/components/ComparisonTable";
import VerificationPanel from "@/components/VerificationPanel";
import SourceViewer from "@/components/SourceViewer";
import DatasetStatus from "@/components/DatasetStatus";
import { api } from "@/lib/api";
import type { SearchRequest, StatuteHit } from "@/lib/types";

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StatuteHit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedStatuteId, setSelectedStatuteId] = useState<string | null>(
    null,
  );

  async function handleSearch(request: SearchRequest) {
    setQuery(request.query);
    setIsLoading(true);
    setSearchError(null);
    try {
      const res = await api.search(request);
      setResults(res.results);
      setSelectedStatuteId(
        res.results.length > 0 ? res.results[0].statute_id : null,
      );
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "Search failed. Is the backend running?",
      );
      setResults([]);
      setSelectedStatuteId(null);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between border-b border-brand-border bg-brand-surface px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-lg">CaseLogic</span>
          <span className="text-xs text-brand-muted">
            Source-grounded PI legal research
          </span>
        </div>
        <DatasetStatus />
      </header>

      <main className="flex-1 grid grid-cols-1 md:grid-cols-[20rem_1fr_22rem] gap-4 p-4">
        <aside className="space-y-4">
          <SearchPanel onSearch={handleSearch} isLoading={isLoading} />
        </aside>

        <section className="space-y-4">
          {searchError && (
            <p className="text-sm text-brand-error">{searchError}</p>
          )}
          <ResultsPanel
            results={results}
            isLoading={isLoading}
            query={query}
            selectedStatuteId={selectedStatuteId}
            onSelect={(hit) => setSelectedStatuteId(hit.statute_id)}
          />
          <ComparisonTable />
          <SourceViewer statuteId={selectedStatuteId} />
        </section>

        <aside className="space-y-4">
          <VerificationPanel />
        </aside>
      </main>

      <footer className="border-t border-brand-border bg-brand-surface px-6 py-2 text-xs text-brand-muted">
        Research prototype. Not legal advice. Results limited to indexed public sources.
      </footer>
    </div>
  );
}
