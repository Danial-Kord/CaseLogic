"use client";

import MarkdownContent from "@/components/MarkdownContent";
import { strings } from "@/lib/i18n/en";
import type { PlanSectionKind } from "@/lib/types";

export type SectionStatus = "pending" | "running" | "done" | "error";

interface PlanSectionCardProps {
  kind: PlanSectionKind;
  status: SectionStatus;
  contentMd: string | null;
  citedStatuteIds: string[];
  /** Open the StatuteModal for a slug. Wired by the parent page. */
  onOpenStatute: (statuteId: string) => void;
}

/**
 * One of the three plan-output cards. The card is laid out the same way
 * regardless of state — only the right-hand status indicator and the
 * body content swap. Keeping the chrome stable means the layout doesn't
 * jump as sections flip from running -> done.
 */
export default function PlanSectionCard({
  kind,
  status,
  contentMd,
  citedStatuteIds,
  onOpenStatute,
}: PlanSectionCardProps) {
  return (
    <article className="rounded-xl border border-brand-border bg-brand-surface shadow-sm transition-colors">
      <header className="flex items-center justify-between gap-3 border-b border-brand-border px-5 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-muted">
            {strings.planning.sectionKind[kind]}
          </p>
          <h3 className="font-serif text-base font-semibold text-brand-primary">
            {strings.planning.sectionTitle[kind]}
          </h3>
        </div>
        <StatusPill status={status} />
      </header>

      <div className="px-5 py-4">
        {status === "pending" && (
          <p className="text-sm italic text-brand-muted">
            {strings.planning.section.waiting}
          </p>
        )}

        {status === "running" && (
          <div className="flex items-center gap-3 text-sm text-brand-secondary">
            <Spinner />
            <span>{strings.planning.section.running}</span>
          </div>
        )}

        {(status === "done" || (status === "error" && contentMd)) && contentMd && (
          <div className="max-w-none text-sm leading-relaxed">
            <MarkdownContent content={stripCiteMarkers(contentMd)} />
          </div>
        )}

        {status === "error" && !contentMd && (
          <p className="text-sm text-brand-error">
            {strings.planning.section.errored}
          </p>
        )}

        {citedStatuteIds.length > 0 && status === "done" && (
          <div className="mt-4 border-t border-brand-border pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">
              {strings.planning.section.citedTitle}
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {citedStatuteIds.map((slug) => (
                <li key={slug}>
                  <button
                    type="button"
                    onClick={() => onOpenStatute(slug)}
                    className="rounded-full border border-brand-border bg-brand-bg px-3 py-1 font-mono text-[11px] text-brand-secondary transition-colors hover:border-brand-accent hover:text-brand-accent"
                  >
                    {slug}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </article>
  );
}

function StatusPill({ status }: { status: SectionStatus }) {
  const cfg: Record<
    SectionStatus,
    { label: string; cls: string }
  > = {
    pending: {
      label: strings.planning.section.statusPending,
      cls: "bg-brand-muted/15 text-brand-muted",
    },
    running: {
      label: strings.planning.section.statusRunning,
      cls: "bg-brand-accent/10 text-brand-accent",
    },
    done: {
      label: strings.planning.section.statusDone,
      cls: "bg-brand-success/15 text-brand-success",
    },
    error: {
      label: strings.planning.section.statusError,
      cls: "bg-brand-error/15 text-brand-error",
    },
  };
  const { label, cls } = cfg[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}
    >
      {status === "running" && <Spinner small />}
      {label}
    </span>
  );
}

function Spinner({ small = false }: { small?: boolean }) {
  const size = small ? "h-3 w-3" : "h-4 w-4";
  return (
    <svg
      className={`${size} animate-spin text-current`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );
}

// `[cite: ca-veh-22350]` is structured metadata for the cited-chip footer.
// Strip it from the rendered prose so the markdown body reads cleanly;
// the chips at the bottom of the card surface the same data interactively.
const _CITE_RE = /\[cite:\s*[a-z0-9-]+\s*\]/gi;
function stripCiteMarkers(md: string): string {
  return md.replace(_CITE_RE, "").replace(/[ \t]+([.!?,;:])/g, "$1");
}
