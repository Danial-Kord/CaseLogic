"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { parseCitationToSlug } from "@/lib/citation";
import { strings } from "@/lib/i18n/en";
import DatasetStatus from "@/components/DatasetStatus";
import SearchPanel from "@/components/SearchPanel";
import ResultsPanel from "@/components/ResultsPanel";
import ComparisonTable from "@/components/ComparisonTable";
import VerificationPanel from "@/components/VerificationPanel";
import SourceViewer from "@/components/SourceViewer";
import type { SearchRequest, StatuteHit } from "@/lib/types";

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StatuteHit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedStatuteId, setSelectedStatuteId] = useState<string | null>(
    null
  );

  async function handleSearch(request: SearchRequest) {
    setQuery(request.query);
    setIsLoading(true);
    setSearchError(null);
    setSelectedStatuteId(null);

    // Citation fast-path: parse the query into a slug client-side and try
    // GET /statutes/{slug} directly. On 404 (slug grammar drift, etc.),
    // fall back to POST /statutes/search so the user always sees results.
    const slug = parseCitationToSlug(request.query);
    if (slug) {
      try {
        await api.getStatute(slug);
        setSelectedStatuteId(slug);
        setResults([]);
        setIsLoading(false);
        return;
      } catch {
        // Fall through to /search.
      }
    }

    try {
      const res = await api.search(request);
      setResults(res.results);
      // Auto-select the first hit so SourceViewer is never empty after a
      // successful search.
      setSelectedStatuteId(
        res.results.length > 0 ? res.results[0].statute_id : null
      );
    } catch (err) {
      setSearchError(
        err instanceof Error
          ? err.message
          : "Search failed. Is the backend running?"
      );
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between border-b border-brand-border bg-brand-surface px-6 py-4">
        <div className="flex items-baseline gap-3">
          <span className="font-serif text-xl text-brand-primary">
            {strings.app.name}
          </span>
          <span className="text-xs text-brand-muted">
            {strings.app.tagline}
          </span>
        </div>
        <DatasetStatus />
      </header>

      {/* Three-column research layout per baseline architecture §12.
          ComparisonTable and VerificationPanel are Phase-2 stubs (return
          null) but live in their natural slots so they activate without
          touching this layout when Phase 2 ships. */}
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
            selectedStatuteId={selectedStatuteId ?? undefined}
            onSelect={(hit) => setSelectedStatuteId(hit.statute_id)}
          />
          <ComparisonTable />
        </section>

        <aside className="space-y-4">
          <SourceViewer statuteId={selectedStatuteId} />
          <VerificationPanel />
        </aside>
      </main>

      <footer className="border-t border-brand-border bg-brand-surface px-6 py-2 text-xs text-brand-muted text-center">
        {strings.app.disclaimer}
      </footer>
    </div>
  );
}
