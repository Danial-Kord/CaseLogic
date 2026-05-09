"use client";

import { useEffect, useState } from "react";
import type { StatuteDetail } from "@/lib/types";
import { api } from "@/lib/api";

interface SourceViewerProps {
  statuteId: string | null;
}

export default function SourceViewer({ statuteId }: SourceViewerProps) {
  const [statute, setStatute] = useState<StatuteDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!statuteId) {
      setStatute(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    let cancelled = false;
    api
      .getStatute(statuteId)
      .then((s) => {
        if (!cancelled) setStatute(s);
      })
      .catch(() => {
        if (!cancelled) setError("Statute not found.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [statuteId]);

  if (!statuteId) {
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
      <p className="font-mono text-sm font-semibold text-brand-primary">
        {statute.universal_citation}
      </p>

      {(statute.division || statute.chapter) && (
        <p className="text-xs text-brand-muted">
          {[statute.division, statute.chapter].filter(Boolean).join(" · ")}
        </p>
      )}

      <p className="whitespace-pre-wrap text-sm text-brand-secondary leading-relaxed">
        {statute.statute_text}
      </p>

      {statute.complete_statute &&
        statute.complete_statute !== statute.statute_text && (
          <details className="text-xs text-brand-muted">
            <summary className="cursor-pointer text-brand-accent hover:underline">
              Show formatted citation
            </summary>
            <p className="mt-2 whitespace-pre-wrap text-brand-secondary">
              {statute.complete_statute}
            </p>
          </details>
        )}

      {statute.factors.length > 0 && (
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

      <a
        href={statute.official_url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-brand-accent hover:underline"
      >
        Open on leginfo →
      </a>

      <div className="rounded bg-gray-50 px-3 py-2 text-xs text-brand-muted border border-brand-border">
        <p className="font-medium mb-0.5">Source</p>
        <p className="break-all">{statute.official_url}</p>
        {statute.retrieved_at && (
          <p className="mt-1">
            Retrieved {new Date(statute.retrieved_at).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
}
