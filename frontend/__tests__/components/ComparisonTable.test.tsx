import { render } from "@testing-library/react";
import ComparisonTable from "@/components/ComparisonTable";

describe("ComparisonTable (Phase 2 stub)", () => {
  it("renders nothing", () => {
    const { container } = render(<ComparisonTable />);
    expect(container.firstChild).toBeNull();
  });
});
