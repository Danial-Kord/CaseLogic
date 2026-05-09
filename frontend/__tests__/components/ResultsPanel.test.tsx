import { render, screen, fireEvent } from "@testing-library/react";
import ResultsPanel from "@/components/ResultsPanel";
import type { StatuteHit } from "@/lib/types";

function makeHit(overrides: Partial<StatuteHit> = {}): StatuteHit {
  return {
    statute_id: "ca-veh-23152-a",
    universal_citation: "Cal. Veh. Code § 23152(a)",
    jurisdiction: "California",
    code_name: "Cal. Veh. Code",
    section_number: "23152",
    subdivision: "a",
    division: "Division 11",
    chapter: "Chapter 12",
    statute_text:
      "It is unlawful for a person who is under the influence of any alcoholic beverage to drive a vehicle.",
    complete_statute: "Pursuant to Cal. Veh. Code § 23152(a)…",
    official_url:
      "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=VEH&sectionNum=23152",
    factors: ["DUI/DWI"],
    score: 0.95,
    matched_via: "hybrid",
    ...overrides,
  };
}

const MOCK_RESULTS: StatuteHit[] = [
  makeHit(),
  makeHit({
    statute_id: "ca-veh-23103-a",
    universal_citation: "Cal. Veh. Code § 23103(a)",
    section_number: "23103",
    statute_text:
      "A person who drives a vehicle upon a highway in willful or wanton disregard for the safety of persons or property is guilty of reckless driving.",
    factors: ["Reckless Driving"],
    matched_via: "vector",
    official_url:
      "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=VEH&sectionNum=23103",
  }),
];

describe("ResultsPanel", () => {
  it("shows enter-query prompt when no query has been made", () => {
    render(
      <ResultsPanel
        results={[]}
        isLoading={false}
        query=""
        onSelect={jest.fn()}
      />
    );
    expect(screen.getByText(/enter a query/i)).toBeInTheDocument();
  });

  it("shows loading indicator while isLoading is true", () => {
    render(
      <ResultsPanel
        results={[]}
        isLoading={true}
        query="reckless driving"
        onSelect={jest.fn()}
      />
    );
    expect(screen.getByText(/searching/i)).toBeInTheDocument();
  });

  it("shows no-results message when search returns empty", () => {
    render(
      <ResultsPanel
        results={[]}
        isLoading={false}
        query="zebra law"
        onSelect={jest.fn()}
      />
    );
    expect(screen.getByText(/no statutes found/i)).toBeInTheDocument();
    expect(screen.getByText(/zebra law/i)).toBeInTheDocument();
  });

  it("renders a card per result with universal_citation as the header", () => {
    render(
      <ResultsPanel
        results={MOCK_RESULTS}
        isLoading={false}
        query="driving"
        onSelect={jest.fn()}
      />
    );
    expect(
      screen.getByText("Cal. Veh. Code § 23152(a)")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Cal. Veh. Code § 23103(a)")
    ).toBeInTheDocument();
  });

  it("shows result count in the summary line", () => {
    render(
      <ResultsPanel
        results={MOCK_RESULTS}
        isLoading={false}
        query="driving"
        onSelect={jest.fn()}
      />
    );
    expect(screen.getByText(/2 results/i)).toBeInTheDocument();
  });

  it("renders factor chips on each card", () => {
    render(
      <ResultsPanel
        results={MOCK_RESULTS}
        isLoading={false}
        query="driving"
        onSelect={jest.fn()}
      />
    );
    expect(screen.getByText("DUI/DWI")).toBeInTheDocument();
    expect(screen.getByText("Reckless Driving")).toBeInTheDocument();
  });

  it("renders a matched_via badge on each card with the appropriate label", () => {
    render(
      <ResultsPanel
        results={MOCK_RESULTS}
        isLoading={false}
        query="driving"
        onSelect={jest.fn()}
      />
    );
    expect(screen.getByText("hybrid")).toBeInTheDocument();
    expect(screen.getByText("semantic")).toBeInTheDocument();
  });

  it("renders a leginfo link on each row pointing to official_url", () => {
    render(
      <ResultsPanel
        results={MOCK_RESULTS}
        isLoading={false}
        query="driving"
        onSelect={jest.fn()}
      />
    );
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute("href", MOCK_RESULTS[0].official_url);
    expect(links[1]).toHaveAttribute("href", MOCK_RESULTS[1].official_url);
  });

  it("calls onSelect with the correct result when a card is clicked", () => {
    const onSelect = jest.fn();
    render(
      <ResultsPanel
        results={MOCK_RESULTS}
        isLoading={false}
        query="driving"
        onSelect={onSelect}
      />
    );
    fireEvent.click(screen.getByText("Cal. Veh. Code § 23152(a)"));
    expect(onSelect).toHaveBeenCalledWith(MOCK_RESULTS[0]);
  });

  it("applies selected border styling using statute_id as the key", () => {
    render(
      <ResultsPanel
        results={MOCK_RESULTS}
        isLoading={false}
        query="driving"
        onSelect={jest.fn()}
        selectedStatuteId="ca-veh-23152-a"
      />
    );
    const rows = screen
      .getAllByRole("button")
      .filter((el) => el.tagName === "TR");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveClass("border-brand-accent");
    expect(rows[1]).not.toHaveClass("border-brand-accent");
  });

  it("truncates statute text longer than 280 characters with an ellipsis", () => {
    const long = makeHit({ statute_text: "a".repeat(400) });
    render(
      <ResultsPanel
        results={[long]}
        isLoading={false}
        query="a"
        onSelect={jest.fn()}
      />
    );
    expect(screen.getByText(/a+…/)).toBeInTheDocument();
  });

  it("does not truncate statute text at or under 280 characters", () => {
    const short = makeHit({ statute_text: "Short statute text." });
    render(
      <ResultsPanel
        results={[short]}
        isLoading={false}
        query="short"
        onSelect={jest.fn()}
      />
    );
    expect(screen.getByText("Short statute text.")).toBeInTheDocument();
  });
});
