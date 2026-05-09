import { fireEvent, render, screen } from "@testing-library/react";
import PlanSectionCard from "@/components/planning/PlanSectionCard";

// react-markdown is ESM-only and not transformed by our jest config; for
// the PlanSectionCard test we don't care about prose rendering, just
// about chrome + interactions. Stub MarkdownContent to a passthrough.
jest.mock("@/components/MarkdownContent", () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => (
    <div data-testid="md">{content}</div>
  ),
}));

describe("PlanSectionCard", () => {
  const noop = () => {};

  it("renders a pending placeholder when status is pending", () => {
    render(
      <PlanSectionCard
        kind="related_cases"
        status="pending"
        contentMd={null}
        citedStatuteIds={[]}
        onOpenStatute={noop}
      />,
    );
    expect(screen.getByText(/Waiting/i)).toBeInTheDocument();
    expect(screen.getByText(/Related cases/i)).toBeInTheDocument();
  });

  it("shows a spinner and running copy while drafting", () => {
    render(
      <PlanSectionCard
        kind="contacts"
        status="running"
        contentMd={null}
        citedStatuteIds={[]}
        onOpenStatute={noop}
      />,
    );
    expect(screen.getByText(/Drafting this section/i)).toBeInTheDocument();
  });

  it("renders the markdown body and strips [cite: ...] markers", () => {
    render(
      <PlanSectionCard
        kind="brief"
        status="done"
        contentMd={"Basic speed law applies. [cite: ca-veh-22350]"}
        citedStatuteIds={["ca-veh-22350"]}
        onOpenStatute={noop}
      />,
    );
    const md = screen.getByTestId("md");
    expect(md.textContent).toContain("Basic speed law applies");
    expect(md.textContent).not.toContain("[cite:");
  });

  it("renders cited-statute chips that fire onOpenStatute when clicked", () => {
    const onOpenStatute = jest.fn();
    render(
      <PlanSectionCard
        kind="related_cases"
        status="done"
        contentMd={"Some draft. [cite: ca-veh-21453-a]"}
        citedStatuteIds={["ca-veh-21453-a", "ca-veh-22350"]}
        onOpenStatute={onOpenStatute}
      />,
    );

    const chip = screen.getByRole("button", { name: "ca-veh-21453-a" });
    fireEvent.click(chip);
    expect(onOpenStatute).toHaveBeenCalledWith("ca-veh-21453-a");
  });

  it("renders an error message when status is error and there is no body", () => {
    render(
      <PlanSectionCard
        kind="brief"
        status="error"
        contentMd={null}
        citedStatuteIds={[]}
        onOpenStatute={noop}
      />,
    );
    expect(screen.getByText(/couldn't be generated/i)).toBeInTheDocument();
  });
});
