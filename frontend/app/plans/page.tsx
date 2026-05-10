"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { strings } from "@/lib/i18n/en";
import DatasetStatus from "@/components/DatasetStatus";
import StatuteModal from "@/components/StatuteModal";
import ThemeToggle from "@/components/ThemeToggle";
import { BookmarksProvider } from "@/contexts/BookmarksContext";
import PlansSidebar from "@/components/planning/PlansSidebar";
import PlanWorkspace, {
  type SectionView,
  buildInitialViews,
} from "@/components/planning/PlanWorkspace";
import { applyPlanEvent } from "@/components/planning/applyPlanEvent";
import type {
  PlanDetail,
  PlanSectionKind,
  PlanSummary,
} from "@/lib/types";

export default function PlansPage() {
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [activePlan, setActivePlan] = useState<PlanDetail | null>(null);
  const [sectionViews, setSectionViews] = useState<
    Record<PlanSectionKind, SectionView>
  >(buildInitialViews(null));
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalStatuteId, setModalStatuteId] = useState<string | null>(null);

  const refreshPlans = useCallback(async () => {
    try {
      const res = await api.listPlans();
      setPlans(res.plans);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load plans");
    }
  }, []);

  useEffect(() => {
    refreshPlans();
  }, [refreshPlans]);

  function handleNew() {
    setError(null);
    setActivePlan(null);
    setSectionViews(buildInitialViews(null));
  }

  async function handleSelect(planId: string) {
    setError(null);
    try {
      const detail = await api.getPlan(planId);
      setActivePlan(detail);
      setSectionViews(buildInitialViews(detail));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load plan");
    }
  }

  async function handleDelete(planId: string) {
    setError(null);
    try {
      await api.deletePlan(planId);
      if (activePlan?.plan_id === planId) {
        setActivePlan(null);
        setSectionViews(buildInitialViews(null));
      }
      await refreshPlans();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete plan");
    }
  }

  async function handleComposerSubmit(incidentText: string) {
    setError(null);
    setIsStreaming(true);

    let createdId: string | null = null;
    try {
      const created = await api.createPlan(incidentText);
      createdId = created.plan_id;

      const placeholder: PlanDetail = {
        plan_id: created.plan_id,
        title: created.title,
        status: "running",
        incident_text: incidentText,
        sections: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setActivePlan(placeholder);
      setSectionViews(buildInitialViews(null));
      await refreshPlans();

      const finalDetail = await api.streamPlanRun(created.plan_id, (event) => {
        applyPlanEvent(event, setSectionViews);
      });
      setActivePlan(finalDetail);
      setSectionViews(buildInitialViews(finalDetail));
      await refreshPlans();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate plan");
      // Try to re-load the partial plan so the user can see whatever
      // sections did finish before the run aborted.
      if (createdId) {
        try {
          const partial = await api.getPlan(createdId);
          setActivePlan(partial);
          setSectionViews(buildInitialViews(partial));
        } catch {
          // ignore — UI already shows the error banner
        }
        await refreshPlans();
      }
    } finally {
      setIsStreaming(false);
    }
  }

  return (
    <BookmarksProvider>
      <div className="flex h-screen flex-col">
        <header className="flex items-center justify-between border-b border-brand-border bg-brand-surface px-6 py-4">
          <div className="flex items-baseline gap-6">
            <Link href="/" className="flex items-baseline gap-3 group">
              <span className="font-serif text-xl text-brand-primary transition-colors group-hover:text-brand-accent">
                {strings.app.name}
              </span>
              <span className="text-xs text-brand-muted">
                {strings.app.tagline}
              </span>
            </Link>
            <nav className="flex items-baseline gap-4 text-sm">
              <Link
                href="/research"
                className="text-brand-muted transition-colors hover:text-brand-primary"
              >
                {strings.planning.nav.research}
              </Link>
              <Link
                href="/plans"
                className="font-semibold text-brand-primary"
              >
                {strings.planning.nav.plans}
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <DatasetStatus />
            <ThemeToggle />
          </div>
        </header>

        <main className="grid flex-1 grid-cols-[18rem_1fr] gap-4 overflow-hidden p-4">
          <PlansSidebar
            plans={plans}
            activePlanId={activePlan?.plan_id ?? null}
            onSelect={handleSelect}
            onNew={handleNew}
            onDelete={handleDelete}
          />

          <div className="flex flex-col gap-2 overflow-hidden">
            {error && (
              <p className="rounded border border-brand-error/30 bg-brand-error/5 px-3 py-2 text-sm text-brand-error">
                {error}
              </p>
            )}
            <PlanWorkspace
              plan={activePlan}
              sectionViews={sectionViews}
              isComposing={isStreaming}
              onComposerSubmit={handleComposerSubmit}
              onOpenStatute={(slug) => setModalStatuteId(slug)}
            />
          </div>
        </main>

        <footer className="border-t border-brand-border bg-brand-surface px-6 py-2 text-center text-xs text-brand-muted">
          {strings.app.disclaimer}
        </footer>

        <StatuteModal
          statuteId={modalStatuteId}
          onClose={() => setModalStatuteId(null)}
        />
      </div>
    </BookmarksProvider>
  );
}

