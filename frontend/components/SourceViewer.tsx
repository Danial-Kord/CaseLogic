"use client";

import { useEffect, useState } from "react";
import type { StatuteResult } from "@/lib/types";
import { api } from "@/lib/api";

interface SourceViewerProps {
  citation: string | null;
}

export default function SourceViewer({ citation }: SourceViewerProps) {
  const [statute, setStatute] = useState<StatuteResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!citation) {
      setStatute(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    // TODO: when backend returns complete_statute (full multi-subdivision text),
    // swap StatuteResult for a richer StatuteDetail type
    api
      .getStatute(citation)
      .then(setStatute)
      .catch(() => setError("Statute not found."))
      .finally(() => setIsLoading(false));
  }, [citation]);

  if (!citation) {
    return (
      <p className="text-sm text-brand-muted">
        Select a result to view the full section text.
      </p>
    );
  }

  if (isLoading) {
    return <p className="text-sm text-brand-muted animate-pulse">Loading…</p>;
  }

  if (error) {
    return <p className="text-sm text-brand-error">{error}</p>;
  }

  if (!statute) return null;

  return (
    <div className="flex flex-col gap-3">
      {/* citation header */}
      <p className="font-mono text-sm font-semibold text-brand-primary">
        {statute.citation}
      </p>

      {/* full statute text */}
      {/* TODO: render subdivision structure (a), (b), (c)… when backend
          returns parsed paragraphs rather than a single text blob */}
      <p className="whitespace-pre-wrap text-sm text-brand-secondary leading-relaxed">
        {statute.text}
      </p>

      {/* factor chips */}
      {statute.factors && statute.factors.length > 0 && (
        <div>
          <p className="text-xs font-medium text-brand-muted mb-1">
            Contributing factors
          </p>
          <div className="flex flex-wrap gap-1">
            {statute.factors.map((f) => (
              <span
                key={f}
                className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-brand-accent"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* leginfo link — required per hard constraints */}
      <a
        href={statute.official_url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-brand-accent hover:underline"
      >
        Open on leginfo →
      </a>

      {/* source provenance panel */}
      {/* TODO: add last_fetched date once backend exposes it on StatuteDetail */}
      <div className="rounded bg-gray-50 px-3 py-2 text-xs text-brand-muted border border-brand-border">
        <p className="font-medium mb-0.5">Source</p>
        <p className="break-all">{statute.official_url}</p>
      </div>
    </div>
  );
}
