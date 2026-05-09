import { render, screen, waitFor } from "@testing-library/react";
import DatasetStatus from "@/components/DatasetStatus";
import { api } from "@/lib/api";
import type { StatusResponse } from "@/lib/types";

jest.mock("@/lib/api", () => ({
  api: {
    getStatus: jest.fn(),
  },
}));

const BASE_STATUS: StatusResponse = {
  indexed_documents: 0,
  sample_urls: [],
  indexed_statutes: 1543,
  jurisdictions: ["California"],
  last_eval_run_at: null,
  last_eval_recall_at_5: null,
  last_eval_citation_recall_at_1: null,
};

describe("DatasetStatus", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it("shows a loading indicator before the first fetch resolves", () => {
    jest.mocked(api.getStatus).mockReturnValue(new Promise(() => {}));
    render(<DatasetStatus />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows the indexed_statutes count after a successful fetch", async () => {
    jest.mocked(api.getStatus).mockResolvedValue(BASE_STATUS);
    render(<DatasetStatus />);
    await waitFor(() => {
      expect(
        screen.getByText(/1,543 statutes indexed/i)
      ).toBeInTheDocument();
    });
  });

  it("shows the jurisdiction list after a successful fetch", async () => {
    jest.mocked(api.getStatus).mockResolvedValue({
      ...BASE_STATUS,
      jurisdictions: ["California", "Texas"],
    });
    render(<DatasetStatus />);
    await waitFor(() => {
      expect(screen.getByText(/California, Texas/)).toBeInTheDocument();
    });
  });

  it("renders an eval recall@5 badge when last_eval_recall_at_5 is set", async () => {
    jest.mocked(api.getStatus).mockResolvedValue({
      ...BASE_STATUS,
      last_eval_recall_at_5: 0.87,
      last_eval_run_at: "2026-05-09T13:30:00.000Z",
    });
    render(<DatasetStatus />);
    await waitFor(() => {
      expect(screen.getByText(/eval r@5: 0\.87/i)).toBeInTheDocument();
    });
  });

  it("hides the eval badge when last_eval_recall_at_5 is null", async () => {
    jest.mocked(api.getStatus).mockResolvedValue(BASE_STATUS);
    render(<DatasetStatus />);
    await waitFor(() => screen.getByText(/statutes indexed/i));
    expect(screen.queryByText(/eval r@5/i)).not.toBeInTheDocument();
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
    expect(screen.queryByText(/statutes indexed/i)).not.toBeInTheDocument();
  });
});
