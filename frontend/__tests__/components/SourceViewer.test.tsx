import { render, screen, waitFor } from "@testing-library/react";
import SourceViewer from "@/components/SourceViewer";
import { api } from "@/lib/api";
import type { StatuteDetail } from "@/lib/types";

jest.mock("@/lib/api", () => ({
  api: {
    getStatute: jest.fn(),
  },
}));

const MOCK_STATUTE: StatuteDetail = {
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
  complete_statute:
    'Pursuant to Cal. Veh. Code § 23152(a), "It is unlawful for a person who is under the influence of any alcoholic beverage to drive a vehicle."',
  official_url:
    "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=VEH&sectionNum=23152",
  factors: ["DUI/DWI"],
  retrieved_at: null,
};

describe("SourceViewer", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it("renders placeholder text when statuteId prop is null", () => {
    render(<SourceViewer statuteId={null} />);
    expect(screen.getByText(/select a result/i)).toBeInTheDocument();
  });

  it("shows loading indicator while fetching the statute", () => {
    jest.mocked(api.getStatute).mockReturnValue(new Promise(() => {}));
    render(<SourceViewer statuteId="ca-veh-23152-a" />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows error message when the statute is not found", async () => {
    jest.mocked(api.getStatute).mockRejectedValue(new Error("Not found"));
    render(<SourceViewer statuteId="ca-veh-99999" />);
    await waitFor(() => {
      expect(screen.getByText(/statute not found/i)).toBeInTheDocument();
    });
  });

  it("renders citation, statute_text, factors, and metadata when loaded", async () => {
    jest.mocked(api.getStatute).mockResolvedValue(MOCK_STATUTE);
    render(<SourceViewer statuteId="ca-veh-23152-a" />);
    await waitFor(() => {
      // The citation is rendered as the <h2> heading. The same string can
      // also appear as an inline cross-reference chip inside the full-context
      // disclosure, so query by role to disambiguate.
      expect(
        screen.getByRole("heading", { name: "Cal. Veh. Code § 23152(a)" })
      ).toBeInTheDocument();
      expect(screen.getByText(MOCK_STATUTE.statute_text)).toBeInTheDocument();
      expect(screen.getByText("DUI/DWI")).toBeInTheDocument();
    });
    // Metadata row contains jurisdiction · division · chapter · subd. (a)
    expect(screen.getByText(/California · Division 11/)).toBeInTheDocument();
  });

  it("renders 'Open on leginfo' link pointing to official_url", async () => {
    jest.mocked(api.getStatute).mockResolvedValue(MOCK_STATUTE);
    render(<SourceViewer statuteId="ca-veh-23152-a" />);
    await waitFor(() => {
      const link = screen.getByRole("link", { name: /open on leginfo/i });
      expect(link).toHaveAttribute("href", MOCK_STATUTE.official_url);
    });
  });

  it("renders the source provenance panel with the official URL", async () => {
    jest.mocked(api.getStatute).mockResolvedValue(MOCK_STATUTE);
    render(<SourceViewer statuteId="ca-veh-23152-a" />);
    await waitFor(() => {
      expect(screen.getByText("Source")).toBeInTheDocument();
      expect(
        screen.getAllByText(MOCK_STATUTE.official_url).length
      ).toBeGreaterThan(0);
    });
  });

  it("offers a 'Show full context' disclosure when complete_statute differs from statute_text", async () => {
    jest.mocked(api.getStatute).mockResolvedValue(MOCK_STATUTE);
    render(<SourceViewer statuteId="ca-veh-23152-a" />);
    await waitFor(() => {
      expect(screen.getByText(/show full context/i)).toBeInTheDocument();
    });
  });

  it("hides the disclosure when complete_statute equals statute_text", async () => {
    jest.mocked(api.getStatute).mockResolvedValue({
      ...MOCK_STATUTE,
      complete_statute: MOCK_STATUTE.statute_text,
    });
    render(<SourceViewer statuteId="ca-veh-23152-a" />);
    await waitFor(() => screen.getByText(MOCK_STATUTE.statute_text));
    expect(
      screen.queryByText(/show full context/i)
    ).not.toBeInTheDocument();
  });

  it("calls getStatute with the provided statuteId slug", async () => {
    jest.mocked(api.getStatute).mockResolvedValue(MOCK_STATUTE);
    render(<SourceViewer statuteId="ca-veh-23152-a" />);
    await waitFor(() => screen.getByText(MOCK_STATUTE.statute_text));
    expect(jest.mocked(api.getStatute)).toHaveBeenCalledWith(
      "ca-veh-23152-a"
    );
  });

  it("refetches when the statuteId prop changes", async () => {
    const second: StatuteDetail = {
      ...MOCK_STATUTE,
      statute_id: "ca-veh-23103-a",
      universal_citation: "Cal. Veh. Code § 23103(a)",
      statute_text: "Reckless driving statute text.",
    };
    jest.mocked(api.getStatute).mockResolvedValueOnce(MOCK_STATUTE);
    const { rerender } = render(
      <SourceViewer statuteId="ca-veh-23152-a" />
    );
    await waitFor(() => screen.getByText(MOCK_STATUTE.statute_text));

    jest.mocked(api.getStatute).mockResolvedValueOnce(second);
    rerender(<SourceViewer statuteId="ca-veh-23103-a" />);
    await waitFor(() =>
      screen.getByRole("heading", { name: "Cal. Veh. Code § 23103(a)" })
    );
    expect(jest.mocked(api.getStatute)).toHaveBeenCalledTimes(2);
  });

  it("clears content and shows placeholder when statuteId becomes null", async () => {
    jest.mocked(api.getStatute).mockResolvedValue(MOCK_STATUTE);
    const { rerender } = render(
      <SourceViewer statuteId="ca-veh-23152-a" />
    );
    await waitFor(() => screen.getByText(MOCK_STATUTE.statute_text));

    rerender(<SourceViewer statuteId={null} />);
    expect(screen.getByText(/select a result/i)).toBeInTheDocument();
    expect(
      screen.queryByText(MOCK_STATUTE.statute_text)
    ).not.toBeInTheDocument();
  });
});
