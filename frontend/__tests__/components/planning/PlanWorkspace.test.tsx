import { render, screen } from "@testing-library/react";
import PlanWorkspace, {
  buildInitialViews,
  type SectionView,
} from "@/components/planning/PlanWorkspace";
import { applyPlanEvent } from "@/app/plans/page";
import type {
  PlanDetail,
  PlanSectionKind,
  PlanStreamEvent,
} from "@/lib/types";

jest.mock("@/components/MarkdownContent", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => (
    <div data-testid="md">{content}</div>
  ),
}));

function emptyViews(): Record<PlanSectionKind, SectionView> {
  return buildInitialViews(null);
}

describe("PlanWorkspace presentational", () => {
  it("renders the composer when no plan is selected", () => {
    render(
      <PlanWorkspace
        plan={null}
        sectionViews={emptyViews()}
        isComposing={false}
        onComposerSubmit={() => {}}
        onOpenStatute={() => {}}
      />,
    );
    expect(screen.getByText(/Sketch a research plan/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Generate plan/i }),
    ).toBeInTheDocument();
  });

  it("renders three section cards when a plan is loaded", () => {
    const plan: PlanDetail = {
      plan_id: "p1",
      title: "Mock plan",
      status: "done",
      incident_text: "Speeding crash on I-5",
      sections: [
        {
          kind: "related_cases",
          content_md: "Cases body. [cite: ca-veh-22350]",
          cited_statute_ids: ["ca-veh-22350"],
          created_at: "2026-05-09T00:00:00Z",
        },
        {
          kind: "contacts",
          content_md: "Contacts body.",
          cited_statute_ids: [],
          created_at: "2026-05-09T00:00:01Z",
        },
        {
          kind: "brief",
          content_md: "Brief body.",
          cited_statute_ids: [],
          created_at: "2026-05-09T00:00:02Z",
        },
      ],
      created_at: "2026-05-09T00:00:00Z",
      updated_at: "2026-05-09T00:00:02Z",
    };
    render(
      <PlanWorkspace
        plan={plan}
        sectionViews={buildInitialViews(plan)}
        isComposing={false}
        onComposerSubmit={() => {}}
        onOpenStatute={() => {}}
      />,
    );
    expect(screen.getByText("Mock plan")).toBeInTheDocument();
    expect(screen.getByText(/Related cases/i)).toBeInTheDocument();
    expect(screen.getByText(/People to reach out/i)).toBeInTheDocument();
    expect(screen.getByText(/Recommended brief/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------
// SSE-flow behavior: feed a scripted stream into `applyPlanEvent` and
// confirm the section views progress in the expected order.

describe("applyPlanEvent SSE reducer", () => {
  function runScript(events: PlanStreamEvent[]): Record<
    PlanSectionKind,
    SectionView
  > {
    let state = emptyViews();
    const setState: React.Dispatch<
      React.SetStateAction<Record<PlanSectionKind, SectionView>>
    > = (updater) => {
      state =
        typeof updater === "function"
          ? (updater as (prev: typeof state) => typeof state)(state)
          : updater;
    };
    for (const e of events) applyPlanEvent(e, setState);
    return state;
  }

  it("advances each section from running -> done in order", () => {
    const final = runScript([
      { type: "started" },
      { type: "retrieving" },
      { type: "retrieved", count: 3 },

      { type: "agent_start", kind: "related_cases", label: "Drafting cases" },
      {
        type: "agent_done",
        kind: "related_cases",
        content_md: "Cases body.",
        cited_statute_ids: ["ca-veh-22350"],
      },

      { type: "agent_start", kind: "contacts", label: "Drafting contacts" },
      {
        type: "agent_done",
        kind: "contacts",
        content_md: "Contacts body.",
        cited_statute_ids: [],
      },

      { type: "agent_start", kind: "brief", label: "Drafting brief" },
      {
        type: "agent_done",
        kind: "brief",
        content_md: "Brief body.",
        cited_statute_ids: [],
      },
    ]);

    expect(final.related_cases.status).toBe("done");
    expect(final.related_cases.contentMd).toBe("Cases body.");
    expect(final.related_cases.citedStatuteIds).toEqual(["ca-veh-22350"]);

    expect(final.contacts.status).toBe("done");
    expect(final.brief.status).toBe("done");
  });

  it("flips the in-flight section to error on a stream error", () => {
    const final = runScript([
      { type: "agent_start", kind: "related_cases", label: "..." },
      {
        type: "agent_done",
        kind: "related_cases",
        content_md: "Done.",
        cited_statute_ids: [],
      },
      { type: "agent_start", kind: "contacts", label: "..." },
      { type: "error", detail: "boom" },
    ]);

    // First section completed and stays done.
    expect(final.related_cases.status).toBe("done");
    // Second section was running when the error fired -> error.
    expect(final.contacts.status).toBe("error");
    // Third section was never started -> still pending.
    expect(final.brief.status).toBe("pending");
  });
});
