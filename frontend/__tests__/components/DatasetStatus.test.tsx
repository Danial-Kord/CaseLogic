import { render, screen, waitFor } from "@testing-library/react";
import DatasetStatus from "@/components/DatasetStatus";
import { api } from "@/lib/api";

jest.mock("@/lib/api", () => ({
  api: {
    getStatus: jest.fn(),
  },
}));

describe("DatasetStatus", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it("shows a loading indicator before the first fetch resolves", () => {
    // Never resolves so we stay in loading state
    jest.mocked(api.getStatus).mockReturnValue(new Promise(() => {}));
    render(<DatasetStatus />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows indexed doc count after a successful fetch", async () => {
    jest.mocked(api.getStatus).mockResolvedValue({
      indexed_count: 1547,
      jurisdictions: ["CA"],
    });
    render(<DatasetStatus />);
    await waitFor(() => {
      expect(screen.getByText(/1,547 docs indexed/i)).toBeInTheDocument();
    });
  });

  it("shows the jurisdiction list after a successful fetch", async () => {
    jest.mocked(api.getStatus).mockResolvedValue({
      indexed_count: 100,
      jurisdictions: ["CA", "TX"],
    });
    render(<DatasetStatus />);
    await waitFor(() => {
      expect(screen.getByText(/CA, TX/i)).toBeInTheDocument();
    });
  });

  it("shows 'Backend offline' error when the fetch fails", async () => {
    jest.mocked(api.getStatus).mockRejectedValue(new Error("Network error"));
    render(<DatasetStatus />);
    await waitFor(() => {
      expect(screen.getByText(/backend offline/i)).toBeInTheDocument();
    });
  });

  it("does not show the doc count when in error state", async () => {
    jest.mocked(api.getStatus).mockRejectedValue(new Error("timeout"));
    render(<DatasetStatus />);
    await waitFor(() => screen.getByText(/backend offline/i));
    expect(screen.queryByText(/docs indexed/i)).not.toBeInTheDocument();
  });
});
