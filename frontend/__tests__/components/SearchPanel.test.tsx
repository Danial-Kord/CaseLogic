import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SearchPanel from "@/components/SearchPanel";
import { api } from "@/lib/api";

jest.mock("@/lib/api", () => ({
  api: {
    getFactors: jest.fn(),
  },
}));

const MOCK_FACTORS = {
  factors: [
    { factor: "DUI/DWI", count: 3 },
    { factor: "Reckless Driving", count: 2 },
  ],
};

describe("SearchPanel", () => {
  beforeEach(() => {
    jest.mocked(api.getFactors).mockResolvedValue(MOCK_FACTORS);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("renders query textarea and search button", () => {
    render(<SearchPanel onSearch={jest.fn()} isLoading={false} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /search/i })).toBeInTheDocument();
  });

  it("disables submit when query is empty", () => {
    render(<SearchPanel onSearch={jest.fn()} isLoading={false} />);
    expect(screen.getByRole("button", { name: /search/i })).toBeDisabled();
  });

  it("disables submit and shows Searching… when isLoading", async () => {
    const user = userEvent.setup();
    render(<SearchPanel onSearch={jest.fn()} isLoading={true} />);
    await user.type(screen.getByRole("textbox"), "reckless driving");
    const btn = screen.getByRole("button", { name: /searching/i });
    expect(btn).toBeDisabled();
  });

  it("calls onSearch with query and top_k on submit", async () => {
    const user = userEvent.setup();
    const onSearch = jest.fn();
    render(<SearchPanel onSearch={onSearch} isLoading={false} />);
    await user.type(screen.getByRole("textbox"), "reckless driving");
    await user.click(screen.getByRole("button", { name: /search/i }));
    expect(onSearch).toHaveBeenCalledWith({
      query: "reckless driving",
      filters: undefined,
      top_k: 10,
    });
  });

  it("submits on Enter keypress in the textarea", async () => {
    const user = userEvent.setup();
    const onSearch = jest.fn();
    render(<SearchPanel onSearch={onSearch} isLoading={false} />);
    await user.type(screen.getByRole("textbox"), "running a red light{Enter}");
    expect(onSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: "running a red light" })
    );
  });

  it("trims whitespace from query before calling onSearch", async () => {
    const user = userEvent.setup();
    const onSearch = jest.fn();
    render(<SearchPanel onSearch={onSearch} isLoading={false} />);
    await user.type(screen.getByRole("textbox"), "  reckless driving  {Enter}");
    expect(onSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: "reckless driving" })
    );
  });

  it("includes factor filter in the request when a factor is selected", async () => {
    const user = userEvent.setup();
    const onSearch = jest.fn();
    render(<SearchPanel onSearch={onSearch} isLoading={false} />);
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /DUI\/DWI/i })).toBeInTheDocument()
    );
    await user.type(screen.getByRole("textbox"), "drunk");
    await user.selectOptions(screen.getByRole("combobox"), "DUI/DWI");
    await user.click(screen.getByRole("button", { name: /search/i }));
    expect(onSearch).toHaveBeenCalledWith({
      query: "drunk",
      filters: { factor: "DUI/DWI" },
      top_k: 10,
    });
  });

  it("omits filters when no factor is selected", async () => {
    const user = userEvent.setup();
    const onSearch = jest.fn();
    render(<SearchPanel onSearch={onSearch} isLoading={false} />);
    await user.type(screen.getByRole("textbox"), "speeding{Enter}");
    expect(onSearch).toHaveBeenCalledWith(
      expect.objectContaining({ filters: undefined })
    );
  });

  it("shows citation hint when query matches citation pattern", async () => {
    const user = userEvent.setup();
    render(<SearchPanel onSearch={jest.fn()} isLoading={false} />);
    await user.type(screen.getByRole("textbox"), "23152(a)");
    expect(screen.getByText(/looks like a citation/i)).toBeInTheDocument();
  });

  it("does not show citation hint for free-text queries", async () => {
    const user = userEvent.setup();
    render(<SearchPanel onSearch={jest.fn()} isLoading={false} />);
    await user.type(screen.getByRole("textbox"), "reckless driving");
    expect(
      screen.queryByText(/looks like a citation/i)
    ).not.toBeInTheDocument();
  });

  it("populates the factor dropdown from getFactors()", async () => {
    render(<SearchPanel onSearch={jest.fn()} isLoading={false} />);
    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: "DUI/DWI (3)" })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("option", { name: "Reckless Driving (2)" })
      ).toBeInTheDocument();
    });
  });

  it("shows error message when getFactors() rejects", async () => {
    jest.mocked(api.getFactors).mockRejectedValue(new Error("Network error"));
    render(<SearchPanel onSearch={jest.fn()} isLoading={false} />);
    await waitFor(() => {
      expect(screen.getByText(/could not load factors/i)).toBeInTheDocument();
    });
  });
});
