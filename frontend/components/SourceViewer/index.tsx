"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { strings } from "@/lib/i18n/en";
import type { StatuteOut } from "@/lib/types";
import FactorChips from "../shared/FactorChips";
import StatuteMetadata from "./StatuteMetadata";
import SourceProvenance from "./SourceProvenance";

interface SourceViewerProps {
  statuteId: string | null;
}

export default function SourceViewer({ statuteId }: SourceViewerProps) {
  const [statute, setStatute] = useState<StatuteOut | null>(null);
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

    api
      .getStatute(statuteId)
      .then(setStatute)
      .catch(() => setError(strings.sourceViewer.notFound))
      .finally(() => setIsLoading(false));
  }, [statuteId]);

  if (!statuteId) {
    return (
      <p className="text-sm text-brand-muted">
        {strings.sourceViewer.placeholder}
      </p>
    );
  }

  if (isLoading) {
    return (
      <p className="text-sm text-brand-muted animate-pulse">
        {strings.sourceViewer.loading}
      </p>
    );
  }

  if (error) {
    return <p className="text-sm text-brand-error">{error}</p>;
  }

  if (!statute) return null;

  const showFullContext =
    statute.complete_statute &&
    statute.complete_statute !== statute.statute_text;

  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-sm font-semibold text-brand-primary">
        {statute.universal_citation}
      </p>

      <StatuteMetadata statute={statute} />

      <p className="whitespace-pre-wrap text-sm text-brand-secondary leading-relaxed">
        {statute.statute_text}
      </p>

      {showFullContext && (
        <details className="text-xs text-brand-muted">
          <summary className="cursor-pointer hover:text-brand-accent">
            {strings.sourceViewer.showFullContext}
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-sm text-brand-secondary leading-relaxed">
            {statute.complete_statute}
          </p>
        </details>
      )}

      {statute.factors.length > 0 && (
        <div>
          <p className="text-xs font-medium text-brand-muted mb-1">
            {strings.sourceViewer.contributingFactors}
          </p>
          <FactorChips factors={statute.factors} />
        </div>
      )}

      <a
        href={statute.official_url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-brand-accent hover:underline"
      >
        {strings.sourceViewer.leginfoLink}
      </a>

      <SourceProvenance url={statute.official_url} />
    </div>
  );
}
