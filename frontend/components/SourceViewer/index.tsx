"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import BookmarkButton from "@/components/BookmarkButton";
import { strings } from "@/lib/i18n/en";
import { statuteDetailToHit } from "@/lib/bookmarksStorage";
import type { StatuteDetail } from "@/lib/types";
import FactorChips from "../shared/FactorChips";
import RelatedGraph from "./RelatedGraph";
import StatuteMetadata from "./StatuteMetadata";
import SourceProvenance from "./SourceProvenance";
import StatuteText from "./StatuteText";

interface SourceViewerProps {
  statuteId: string | null;
  /**
   * Optional. When provided, the viewer renders a "Related statutes" graph
   * underneath the body and calls this callback whenever the user clicks a
   * neighbor node. The parent (StatuteModal) is expected to push the new
   * statuteId onto its history stack and re-render the viewer.
   */
  onNavigate?: (statuteId: string) => void;
}

export default function SourceViewer({
  statuteId,
  onNavigate,
}: SourceViewerProps) {
  const [statute, setStatute] = useState<StatuteDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  // Reset the "Copied!" indicator a second after the user copies the
  // citation; keeps the button feeling responsive without a portal.
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);

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

  async function handleCopyCitation() {
    if (!statute) return;
    try {
      await navigator.clipboard.writeText(statute.universal_citation);
      setCopied(true);
    } catch {
      // Clipboard can fail in non-secure contexts; silently noop — the
      // user can still highlight the citation manually.
    }
  }

  return (
    <article className="flex flex-col gap-5">
      <header className="flex flex-col gap-2 border-b border-brand-border pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-brand-muted">
              {statute.jurisdiction}
            </p>
            <h2 className="mt-0.5 break-words font-mono text-lg font-semibold leading-snug text-brand-primary">
              {statute.universal_citation}
            </h2>
          </div>
          <div className="flex flex-wrap items-start justify-end gap-2">
            <BookmarkButton hit={statuteDetailToHit(statute)} />
            <button
              type="button"
              onClick={handleCopyCitation}
              className="shrink-0 rounded-md border border-brand-border bg-brand-bg px-2.5 py-1 text-[11px] font-medium text-brand-muted transition-colors hover:border-brand-accent hover:text-brand-accent"
            >
              {copied
                ? strings.sourceViewer.copied
                : strings.sourceViewer.copyCitation}
            </button>
          </div>
        </div>
        <StatuteMetadata statute={statute} />
      </header>

      <section>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-brand-muted">
          {strings.sourceViewer.statutoryText}
        </p>
        <StatuteText text={statute.statute_text} />
      </section>

      {showFullContext && (
        <details className="group rounded-lg border border-brand-border bg-brand-bg/40 px-3 py-2 text-sm">
          <summary className="cursor-pointer list-none text-xs font-medium text-brand-muted transition-colors hover:text-brand-accent">
            <span className="mr-1 inline-block transition-transform group-open:rotate-90">
              ›
            </span>
            {strings.sourceViewer.showFullContext}
          </summary>
          <div className="mt-3">
            <StatuteText text={statute.complete_statute ?? ""} />
          </div>
        </details>
      )}

      {statute.factors.length > 0 && (
        <section>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-brand-muted">
            {strings.sourceViewer.contributingFactors}
          </p>
          <FactorChips factors={statute.factors} />
        </section>
      )}

      {onNavigate && (
        <section>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-brand-muted">
            {strings.sourceViewer.relatedStatutes}
          </p>
          <RelatedGraph
            statuteId={statute.statute_id}
            centerCitation={statute.universal_citation}
            centerJurisdiction={statute.jurisdiction}
            onNavigate={onNavigate}
          />
        </section>
      )}

      <footer className="flex flex-col gap-2 border-t border-brand-border pt-4">
        <a
          href={statute.official_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-accent hover:underline"
        >
          {strings.sourceViewer.leginfoLink}
          <span aria-hidden="true">→</span>
        </a>
        <SourceProvenance url={statute.official_url} />
      </footer>
    </article>
  );
}
