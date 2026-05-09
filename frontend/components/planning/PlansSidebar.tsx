"use client";

import { strings } from "@/lib/i18n/en";
import type { PlanSummary } from "@/lib/types";

interface PlansSidebarProps {
  plans: PlanSummary[];
  activePlanId: string | null;
  onSelect: (planId: string) => void;
  onNew: () => void;
  onDelete: (planId: string) => void;
}

/**
 * Sidebar for the /plans workspace. Mirrors `ChatSidebar` but trimmed:
 * planning doesn't carry a profile card or bookmark list — both live on
 * the research page. The "+ New plan" button creates a draft locally;
 * generation only kicks off once the user submits the composer.
 */
export default function PlansSidebar({
  plans,
  activePlanId,
  onSelect,
  onNew,
  onDelete,
}: PlansSidebarProps) {
  return (
    <aside className="flex h-full flex-col overflow-hidden rounded-lg border border-brand-border bg-brand-surface">
      <div className="shrink-0 border-b border-brand-border px-3 py-3">
        <h2 className="font-serif text-base font-semibold text-brand-primary">
          {strings.planning.sidebar.title}
        </h2>
        <p className="mt-1 text-xs text-brand-muted">
          {strings.planning.sidebar.subtitle}
        </p>
      </div>

      <div className="shrink-0 border-b border-brand-border p-3">
        <button
          type="button"
          onClick={onNew}
          className="w-full rounded-full bg-brand-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-accent-hover"
        >
          {strings.planning.sidebar.newCta}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-2">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-brand-border bg-brand-surface shadow-sm">
          <div className="shrink-0 border-b border-brand-border bg-gradient-to-r from-brand-bg/90 to-brand-surface px-3 py-2 dark:from-brand-bg/40 dark:to-brand-surface">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">
              {strings.planning.sidebar.historyTitle}
            </h3>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
            {plans.length === 0 ? (
              <p className="px-2 py-4 text-center text-[11px] leading-relaxed text-brand-muted">
                {strings.planning.sidebar.empty}
              </p>
            ) : (
              <ul className="space-y-1">
                {plans.map((p) => {
                  const isActive = p.plan_id === activePlanId;
                  return (
                    <li key={p.plan_id}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelect(p.plan_id)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && onSelect(p.plan_id)
                        }
                        className={`group flex cursor-pointer items-start justify-between gap-2 rounded-lg px-2 py-2 transition-colors ${
                          isActive
                            ? "bg-brand-accent/10 ring-1 ring-brand-accent/25"
                            : "hover:bg-brand-bg"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p
                            className={`truncate text-sm ${
                              isActive
                                ? "font-medium text-brand-primary"
                                : "text-brand-secondary"
                            }`}
                          >
                            {p.title}
                          </p>
                          <p className="text-[11px] text-brand-muted">
                            {formatRelative(p.updated_at)} \u00b7{" "}
                            <PlanStatusDot status={p.status} />{" "}
                            {strings.planning.statusLabel[p.status]}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label={strings.planning.sidebar.deleteAria(p.title)}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(strings.planning.sidebar.deleteConfirm(p.title))) {
                              onDelete(p.plan_id);
                            }
                          }}
                          className="opacity-0 text-brand-muted transition-opacity hover:text-brand-error group-hover:opacity-100"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="h-4 w-4"
                            aria-hidden="true"
                          >
                            <path
                              fillRule="evenodd"
                              d="M4.28 3.22a.75.75 0 0 0-1.06 1.06L8.94 10l-5.72 5.72a.75.75 0 1 0 1.06 1.06L10 11.06l5.72 5.72a.75.75 0 1 0 1.06-1.06L11.06 10l5.72-5.72a.75.75 0 0 0-1.06-1.06L10 8.94 4.28 3.22Z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

function PlanStatusDot({ status }: { status: PlanSummary["status"] }) {
  const cls =
    status === "running"
      ? "bg-brand-accent animate-pulse"
      : status === "error"
        ? "bg-brand-error"
        : "bg-brand-success";
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-1.5 w-1.5 rounded-full align-middle ${cls}`}
    />
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString();
}
