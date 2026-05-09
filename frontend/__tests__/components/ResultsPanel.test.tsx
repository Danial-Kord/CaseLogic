import { render, screen, fireEvent } from "@testing-library/react";
import ResultsPanel from "@/components/ResultsPanel";
import type { StatuteResult } from "@/lib/types";

const MOCK_RESULTS: StatuteResult[] = [
  {
    statute_id: "ca-veh-23152a",
    citation: "Cal. Veh. Code § 23152(a)",
    text: "It is unlawful for a person who is under the influence of any alcoholic beverage to drive a vehicle.",
    official_url:
      "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=VEH&sectionNum=23152",
    factors: ["DUI/DWI"],
    score: 0.95,
  },
  {
    statute_id: "ca-veh-23103a",
    citation: "Cal. Veh. Code § 23103(a)",
    text: "A person who drives a vehicle upon a highway in willful or wanton disregard for the safety of persons or property is guilty of reckless driving.",
    official_url:
      "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=VEH&sectionNum=23103",
    factors: ["Reckless Driving"],
    score: 0.92,
  },
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

  it("renders a card per result with its citation", () => {
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

  it("renders an 'Open on leginfo' link on each card pointing to official_url", () => {
    render(
      <ResultsPanel
        results={MOCK_RESULTS}
        isLoading={false}
        query="driving"
        onSelect={jest.fn()}
      />
    );
    const links = screen.getAllByRole("link", { name: /open on leginfo/i });
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

  it("applies selected border styling to the active card only", () => {
    render(
      <ResultsPanel
        results={MOCK_RESULTS}
        isLoading={false}
        query="driving"
        onSelect={jest.fn()}
        selectedCitation="Cal. Veh. Code § 23152(a)"
      />
    );
    const cards = screen.getAllByRole("button");
    expect(cards[0]).toHaveClass("border-brand-accent");
    expect(cards[1]).not.toHaveClass("border-brand-accent");
  });

  it("truncates statute text longer than 280 characters with an ellipsis", () => {
    const longText = "a".repeat(400);
    const result: StatuteResult = { ...MOCK_RESULTS[0], text: longText };
    render(
      <ResultsPanel
        results={[result]}
        isLoading={false}
        query="a"
        onSelect={jest.fn()}
      />
    );
    // Truncated text ends with ellipsis character
    expect(screen.getByText(/a+…/)).toBeInTheDocument();
  });

  it("does not truncate statute text at or under 280 characters", () => {
    const shortText = "Short statute text.";
    const result: StatuteResult = { ...MOCK_RESULTS[0], text: shortText };
    render(
      <ResultsPanel
        results={[result]}
        isLoading={false}
        query="short"
        onSelect={jest.fn()}
      />
    );
    expect(screen.getByText("Short statute text.")).toBeInTheDocument();
  });
});
