import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RelatedGraph from "@/components/SourceViewer/RelatedGraph";
import { api } from "@/lib/api";
import type { RelatedStatute } from "@/lib/types";

jest.mock("@/lib/api", () => ({
  api: {
    getRelatedStatutes: jest.fn(),
  },
}));

const NEIGHBORS: RelatedStatute[] = [
  {
    statute_id: "ca-veh-23153-a",
    universal_citation: "Cal. Veh. Code § 23153(a)",
    jurisdiction: "CA",
    section_number: "23153",
    subdivision: "a",
    snippet: "DUI causing injury — felony version of § 23152.",
    mention_count: 3,
  },
  {
    statute_id: "ca-veh-22350",
    universal_citation: "Cal. Veh. Code § 22350",
    jurisdiction: "CA",
    section_number: "22350",
    subdivision: null,
    snippet: "Basic speed law.",
    mention_count: 1,
  },
];

describe("RelatedGraph", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows a loading state, then renders one node per related statute", async () => {
    jest
      .mocked(api.getRelatedStatutes)
      .mockResolvedValue({
        source_statute_id: "ca-veh-23103-a",
        related: NEIGHBORS,
      });
    render(
      <RelatedGraph
        statuteId="ca-veh-23103-a"
        centerCitation="Cal. Veh. Code § 23103(a)"
        centerJurisdiction="CA"
        onNavigate={jest.fn()}
      />
    );
    expect(screen.getByText(/mapping related/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("§ 23153(a)")).toBeInTheDocument();
      expect(screen.getByText("§ 22350")).toBeInTheDocument();
    });
  });

  it("renders the empty-state message when there are no related statutes", async () => {
    jest
      .mocked(api.getRelatedStatutes)
      .mockResolvedValue({ source_statute_id: "x", related: [] });
    render(
      <RelatedGraph
        statuteId="x"
        centerCitation="X"
        centerJurisdiction="CA"
        onNavigate={jest.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText(/no cross-referenced statutes/i)).toBeInTheDocument();
    });
  });

  it("calls onNavigate with the clicked neighbor's statute_id", async () => {
    const onNavigate = jest.fn();
    jest
      .mocked(api.getRelatedStatutes)
      .mockResolvedValue({
        source_statute_id: "ca-veh-23103-a",
        related: NEIGHBORS,
      });
    render(
      <RelatedGraph
        statuteId="ca-veh-23103-a"
        centerCitation="Cal. Veh. Code § 23103(a)"
        centerJurisdiction="CA"
        onNavigate={onNavigate}
      />
    );
    const node = await screen.findByText("§ 23153(a)");
    // The text element sits inside a clickable <g role="button">. Walk up
    // to the role=button to fire the click on the actual handler target.
    const group = node.closest('[role="button"]');
    expect(group).not.toBeNull();
    fireEvent.click(group!);
    expect(onNavigate).toHaveBeenCalledWith("ca-veh-23153-a");
  });

  it("shows an overflow link when there are more than 8 related statutes", async () => {
    const many: RelatedStatute[] = Array.from({ length: 11 }, (_, i) => ({
      statute_id: `ca-veh-${1000 + i}`,
      universal_citation: `Cal. Veh. Code § ${1000 + i}`,
      jurisdiction: "CA",
      section_number: `${1000 + i}`,
      subdivision: null,
      snippet: "",
      mention_count: 1,
    }));
    jest
      .mocked(api.getRelatedStatutes)
      .mockResolvedValue({ source_statute_id: "src", related: many });
    render(
      <RelatedGraph
        statuteId="src"
        centerCitation="Source"
        centerJurisdiction="CA"
        onNavigate={jest.fn()}
      />
    );
    // Only 8 neighbors render in the SVG ring; the overflow trigger
    // exposes the rest.
    await waitFor(() => {
      expect(screen.getByText(/show 3 more related/i)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/show 3 more related/i));
    expect(screen.getByText(/hide additional/i)).toBeInTheDocument();
  });
});
