"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { parseCitationToSlug } from "@/lib/citation";
import { strings } from "@/lib/i18n/en";
import DatasetStatus from "@/components/DatasetStatus";
import SearchPanel from "@/components/SearchPanel";
import ResultsPanel from "@/components/ResultsPanel";
import SourceViewer from "@/components/SourceViewer";
import type { StatuteSearchRequest, StatuteHit } from "@/lib/types";

export default function HomePage() {
  const [results, setResults] = useState<StatuteHit[]>([]);
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [selectedStatuteId, setSelectedStatuteId] = useState<string | null>(
    null
  );

  async function handleSearch(request: StatuteSearchRequest) {
    setQuery(request.query);
    setIsSearching(true);
    setSelectedStatuteId(null);
    setResults([]);

    try {
      // Citation fast-path: parse the query into a slug client-side and try
      // GET /statutes/{slug} directly. On 404 (slug grammar drift, etc.),
      // fall back to POST /statutes/search so the user always sees results.
      const slug = parseCitationToSlug(request.query);
      if (slug) {
        try {
          await api.getStatute(slug);
          setSelectedStatuteId(slug);
          return;
        } catch {
          // Fall through to /search.
        }
      }

      const res = await api.search(request);
      setResults(res.results);
    } catch {
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  function handleSelectResult(hit: StatuteHit) {
    setSelectedStatuteId(hit.statute_id);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between border-b border-brand-border bg-brand-surface px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-lg">{strings.app.name}</span>
          <span className="text-xs text-brand-muted">
            {strings.app.tagline}
          </span>
        </div>
        <DatasetStatus />
      </header>

      {/* Three-column research layout per baseline architecture §12 */}
      {/* TODO: make columns collapsible on narrow viewports */}
      <main className="flex-1 grid grid-cols-[280px_1fr_320px] divide-x divide-brand-border overflow-hidden">
        <aside className="overflow-y-auto p-4">
          <SearchPanel onSearch={handleSearch} isLoading={isSearching} />
        </aside>

        <section className="overflow-y-auto p-4">
          <ResultsPanel
            results={results}
            isLoading={isSearching}
            query={query}
            onSelect={handleSelectResult}
            selectedStatuteId={selectedStatuteId ?? undefined}
          />
        </section>

        {/* TODO: Phase 2 swap this for VerificationPanel when OpenClaw is wired */}
        <aside className="overflow-y-auto p-4">
          <SourceViewer statuteId={selectedStatuteId} />
        </aside>
      </main>

      <footer className="border-t border-brand-border bg-brand-surface px-6 py-2 text-xs text-brand-muted text-center">
        {strings.app.disclaimer}
      </footer>
    </div>
  );
}
