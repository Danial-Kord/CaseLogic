import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import StatuteModal from "@/components/StatuteModal";
import { api } from "@/lib/api";
import type { RelatedStatute, StatuteDetail } from "@/lib/types";

jest.mock("@/lib/api", () => ({
  api: {
    getStatute: jest.fn(),
    getRelatedStatutes: jest.fn(),
  },
}));

const SOURCE: StatuteDetail = {
  statute_id: "ca-veh-23103-a",
  universal_citation: "Cal. Veh. Code § 23103(a)",
  jurisdiction: "California",
  code_name: "Cal. Veh. Code",
  section_number: "23103",
  subdivision: "a",
  division: "Division 11",
  chapter: "Chapter 12",
  statute_text:
    "A person who drives a vehicle upon a highway in willful or wanton disregard for the safety of persons or property is guilty of reckless driving.",
  complete_statute:
    "Pursuant to Cal. Veh. Code § 23103(a), see also Cal. Veh. Code § 23153(a).",
  official_url: "https://leginfo.legislature.ca.gov/foo",
  factors: ["Reckless Driving"],
  retrieved_at: null,
};

const TARGET: StatuteDetail = {
  ...SOURCE,
  statute_id: "ca-veh-23153-a",
  universal_citation: "Cal. Veh. Code § 23153(a)",
  section_number: "23153",
  statute_text: "Aggravated DUI causing injury.",
  complete_statute: "Aggravated DUI causing injury.",
};

const RELATED_FOR_SOURCE: RelatedStatute[] = [
  {
    statute_id: "ca-veh-23153-a",
    universal_citation: "Cal. Veh. Code § 23153(a)",
    jurisdiction: "CA",
    section_number: "23153",
    subdivision: "a",
    snippet: "DUI causing injury.",
    mention_count: 1,
  },
];

describe("StatuteModal navigation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(api.getStatute).mockImplementation(async (id: string) => {
      if (id === SOURCE.statute_id) return SOURCE;
      if (id === TARGET.statute_id) return TARGET;
      throw new Error("Not found");
    });
    jest.mocked(api.getRelatedStatutes).mockImplementation(async (id: string) => {
      if (id === SOURCE.statute_id) {
        return { source_statute_id: id, related: RELATED_FOR_SOURCE };
      }
      return { source_statute_id: id, related: [] };
    });
  });

  it("clicking a graph neighbor pivots the modal to that statute and shows a Back button", async () => {
    render(
      <StatuteModal
        statuteId={SOURCE.statute_id}
        onClose={jest.fn()}
      />
    );

    // Initial render: source statute heading is visible, no Back button.
    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: SOURCE.universal_citation,
        })
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/^back$/i)).not.toBeInTheDocument();

    // Click the neighbor node in the graph.
    const neighbor = await screen.findByText("§ 23153(a)");
    const group = neighbor.closest('[role="button"]');
    fireEvent.click(group!);

    // The modal pivots: target statute heading appears, Back button shows.
    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          name: TARGET.universal_citation,
        })
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/^back$/i)).toBeInTheDocument();
  });

  it("Back button pops the navigation stack to the previous statute", async () => {
    render(
      <StatuteModal
        statuteId={SOURCE.statute_id}
        onClose={jest.fn()}
      />
    );

    const neighbor = await screen.findByText("§ 23153(a)");
    fireEvent.click(neighbor.closest('[role="button"]')!);
    await waitFor(() =>
      screen.getByRole("heading", { name: TARGET.universal_citation })
    );

    fireEvent.click(screen.getByText(/^back$/i));
    await waitFor(() =>
      screen.getByRole("heading", { name: SOURCE.universal_citation })
    );
    // Back button hides once we're at the root again.
    expect(screen.queryByText(/^back$/i)).not.toBeInTheDocument();
  });

  it("resets the navigation stack when the parent passes a new statuteId", async () => {
    const { rerender } = render(
      <StatuteModal
        statuteId={SOURCE.statute_id}
        onClose={jest.fn()}
      />
    );
    const neighbor = await screen.findByText("§ 23153(a)");
    fireEvent.click(neighbor.closest('[role="button"]')!);
    await waitFor(() =>
      screen.getByRole("heading", { name: TARGET.universal_citation })
    );
    expect(screen.getByText(/^back$/i)).toBeInTheDocument();

    // Parent closes the modal then reopens it on a fresh starting statute —
    // stack should reset to a single entry, hiding the Back button.
    rerender(<StatuteModal statuteId={null} onClose={jest.fn()} />);
    rerender(
      <StatuteModal
        statuteId={TARGET.statute_id}
        onClose={jest.fn()}
      />
    );
    await waitFor(() =>
      screen.getByRole("heading", { name: TARGET.universal_citation })
    );
    expect(screen.queryByText(/^back$/i)).not.toBeInTheDocument();
  });
});
