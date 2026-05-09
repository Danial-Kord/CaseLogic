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
  division: null,
  chapter: null,
  statute_text:
    "It is unlawful for a person who is under the influence of any alcoholic beverage to drive a vehicle.",
  complete_statute: "",
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

  it("renders citation, full text, and factor chips when loaded", async () => {
    jest.mocked(api.getStatute).mockResolvedValue(MOCK_STATUTE);
    render(<SourceViewer statuteId="ca-veh-23152-a" />);
    await waitFor(() => {
      expect(
        screen.getByText("Cal. Veh. Code § 23152(a)")
      ).toBeInTheDocument();
      expect(screen.getByText(/under the influence/i)).toBeInTheDocument();
      expect(screen.getByText("DUI/DWI")).toBeInTheDocument();
    });
  });

  it("renders 'Open on leginfo' link pointing to official_url", async () => {
    jest.mocked(api.getStatute).mockResolvedValue(MOCK_STATUTE);
    render(<SourceViewer statuteId="ca-veh-23152-a" />);
    await waitFor(() => {
      const link = screen.getByRole("link", { name: /open on leginfo/i });
      expect(link).toHaveAttribute("href", MOCK_STATUTE.official_url);
    });
  });

  it("renders source provenance panel with the official URL", async () => {
    jest.mocked(api.getStatute).mockResolvedValue(MOCK_STATUTE);
    render(<SourceViewer statuteId="ca-veh-23152-a" />);
    await waitFor(() => {
      expect(screen.getByText("Source")).toBeInTheDocument();
      expect(
        screen.getAllByText(MOCK_STATUTE.official_url).length
      ).toBeGreaterThan(0);
    });
  });

  it("calls getStatute with the provided statuteId slug", async () => {
    jest.mocked(api.getStatute).mockResolvedValue(MOCK_STATUTE);
    render(<SourceViewer statuteId="ca-veh-23152-a" />);
    await waitFor(() => screen.getByText(/under the influence/i));
    expect(jest.mocked(api.getStatute)).toHaveBeenCalledWith(
      "ca-veh-23152-a"
    );
  });

  it("refetches when the statuteId prop changes", async () => {
    const secondStatute: StatuteDetail = {
      ...MOCK_STATUTE,
      statute_id: "ca-veh-23103-a",
      universal_citation: "Cal. Veh. Code § 23103(a)",
      statute_text: "Reckless driving statute text.",
    };
    jest.mocked(api.getStatute).mockResolvedValueOnce(MOCK_STATUTE);
    const { rerender } = render(<SourceViewer statuteId="ca-veh-23152-a" />);
    await waitFor(() => screen.getByText(/under the influence/i));

    jest.mocked(api.getStatute).mockResolvedValueOnce(secondStatute);
    rerender(<SourceViewer statuteId="ca-veh-23103-a" />);
    await waitFor(() => screen.getByText("Cal. Veh. Code § 23103(a)"));
    expect(jest.mocked(api.getStatute)).toHaveBeenCalledTimes(2);
  });

  it("clears content and shows placeholder when statuteId becomes null", async () => {
    jest.mocked(api.getStatute).mockResolvedValue(MOCK_STATUTE);
    const { rerender } = render(<SourceViewer statuteId="ca-veh-23152-a" />);
    await waitFor(() => screen.getByText(/under the influence/i));

    rerender(<SourceViewer statuteId={null} />);
    expect(screen.getByText(/select a result/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/under the influence/i)
    ).not.toBeInTheDocument();
  });
});
