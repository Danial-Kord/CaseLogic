"use client";

import PlanComposer from "./PlanComposer";
import PlanSectionCard, { type SectionStatus } from "./PlanSectionCard";
import { strings } from "@/lib/i18n/en";
import type { PlanDetail, PlanSectionKind } from "@/lib/types";

/**
 * One per-section UI snapshot. The page-level SSE consumer builds a map
 * of these and passes it in; PlanWorkspace stays presentational.
 */
export interface SectionView {
  status: SectionStatus;
  contentMd: string | null;
  citedStatuteIds: string[];
}

interface PlanWorkspaceProps {
  plan: PlanDetail | null;
  sectionViews: Record<PlanSectionKind, SectionView>;
  isComposing: boolean;
  /** Submit the composer to create + run a new plan. */
  onComposerSubmit: (incidentText: string) => void | Promise<void>;
  onOpenStatute: (statuteId: string) => void;
}

const SECTION_ORDER: readonly PlanSectionKind[] = [
  "related_cases",
  "contacts",
  "brief",
];

export default function PlanWorkspace({
  plan,
  sectionViews,
  isComposing,
  onComposerSubmit,
  onOpenStatute,
}: PlanWorkspaceProps) {
  if (!plan) {
    return (
      <div className="flex-1 overflow-y-auto">
        <PlanComposer onSubmit={onComposerSubmit} isSubmitting={isComposing} />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="border-b border-brand-border bg-brand-surface px-5 py-3">
        <h1 className="font-serif text-lg font-semibold text-brand-primary">
          {plan.title}
        </h1>
        <p className="mt-0.5 truncate text-xs text-brand-muted">
          {strings.planning.workspace.incidentLabel}
          {": "}
          <span className="text-brand-secondary">{plan.incident_text}</span>
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {SECTION_ORDER.map((kind) => {
            const view = sectionViews[kind];
            return (
              <PlanSectionCard
                key={kind}
                kind={kind}
                status={view.status}
                contentMd={view.contentMd}
                citedStatuteIds={view.citedStatuteIds}
                onOpenStatute={onOpenStatute}
              />
            );
          })}

          <p className="pt-2 text-center text-[11px] text-brand-muted">
            {strings.planning.workspace.disclaimer}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Builds the initial `sectionViews` map from a PlanDetail. Used both on
 * first load (when the user re-opens a past plan from the sidebar) and
 * to reset state at the start of a streaming run.
 */
export function buildInitialViews(
  plan: PlanDetail | null,
): Record<PlanSectionKind, SectionView> {
  const out: Record<PlanSectionKind, SectionView> = {
    related_cases: blank(),
    contacts: blank(),
    brief: blank(),
  };
  if (!plan) return out;
  for (const s of plan.sections) {
    out[s.kind] = {
      status: "done",
      contentMd: s.content_md,
      citedStatuteIds: s.cited_statute_ids,
    };
  }
  return out;
}

function blank(): SectionView {
  return { status: "pending", contentMd: null, citedStatuteIds: [] };
}
