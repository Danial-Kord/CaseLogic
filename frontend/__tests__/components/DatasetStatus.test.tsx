import { render, screen, waitFor } from "@testing-library/react";
import DatasetStatus from "@/components/DatasetStatus";
import { api } from "@/lib/api";
import type { StatusResponse } from "@/lib/types";

jest.mock("@/lib/api", () => ({
  api: {
    getStatus: jest.fn(),
  },
}));

function makeStatus(overrides: Partial<StatusResponse> = {}): StatusResponse {
  return {
    indexed_documents: 0,
    sample_urls: [],
    indexed_statutes: 0,
    jurisdictions: [],
    last_eval_run_at: null,
    last_eval_recall_at_5: null,
    last_eval_citation_recall_at_1: null,
    ...overrides,
  };
}

describe("DatasetStatus", () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  it("shows a loading indicator before the first fetch resolves", () => {
    jest.mocked(api.getStatus).mockReturnValue(new Promise(() => {}));
    render(<DatasetStatus />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("shows indexed statute count after a successful fetch", async () => {
    jest.mocked(api.getStatus).mockResolvedValue(
      makeStatus({ indexed_statutes: 1547, jurisdictions: ["California"] })
    );
    render(<DatasetStatus />);
    await waitFor(() => {
      expect(screen.getByText(/1,547 statutes indexed/i)).toBeInTheDocument();
    });
  });

  it("shows the jurisdiction list after a successful fetch", async () => {
    jest.mocked(api.getStatus).mockResolvedValue(
      makeStatus({ indexed_statutes: 100, jurisdictions: ["California", "Texas"] })
    );
    render(<DatasetStatus />);
    await waitFor(() => {
      expect(screen.getByText(/California, Texas/i)).toBeInTheDocument();
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
    expect(screen.queryByText(/statutes indexed/i)).not.toBeInTheDocument();
  });

  it("renders recall@5 when present in the status payload", async () => {
    jest.mocked(api.getStatus).mockResolvedValue(
      makeStatus({
        indexed_statutes: 41,
        jurisdictions: ["California"],
        last_eval_recall_at_5: 0.87,
      })
    );
    render(<DatasetStatus />);
    await waitFor(() => {
      expect(screen.getByText(/recall@5 87%/i)).toBeInTheDocument();
    });
  });
});
