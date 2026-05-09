import { fireEvent, render, screen } from "@testing-library/react";
import VerificationPanel from "@/components/VerificationPanel";
import type { VerificationReport } from "@/lib/types";

describe("VerificationPanel", () => {
  function clean(): VerificationReport {
    return {
      status: "clean",
      citations_total: 2,
      citations_supported: 2,
      quotes_total: 1,
      quotes_supported: 1,
      unsupported_citations: [],
      unsupported_quotes: [],
    };
  }

  function unsupported(): VerificationReport {
    return {
      status: "unsupported",
      citations_total: 2,
      citations_supported: 1,
      quotes_total: 1,
      quotes_supported: 0,
      unsupported_citations: [
        {
          text: "Cal. Veh. Code \u00a7 99999",
          offset: 14,
          section_number: "99999",
          jurisdiction: "CA",
          reason: "Citation does not match any statute the agent retrieved this turn.",
        },
      ],
      unsupported_quotes: [
        {
          text: "every driver must yield to penguins on the highway",
          offset: 50,
          kind: "double",
          reason: "Quoted text does not appear verbatim in any retrieved source.",
        },
      ],
    };
  }

  it("renders nothing when no report is provided", () => {
    const { container } = render(<VerificationPanel report={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows a green chip with no expand button when status is clean", () => {
    render(<VerificationPanel report={clean()} />);

    const panel = screen.getByTestId("verification-panel");
    expect(panel.dataset.status).toBe("clean");
    expect(screen.getByText(/Sources verified/)).toBeInTheDocument();
    expect(screen.getByText(/2\/2 citations/)).toBeInTheDocument();
    // No findings → no Show details button.
    expect(screen.queryByRole("button", { name: /Show details/ })).toBeNull();
  });

  it("expands to reveal unsupported citations and quotes", () => {
    render(<VerificationPanel report={unsupported()} />);

    expect(screen.getByText(/Needs review/)).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /Show details/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText("Unsupported citations"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Cal. Veh. Code \u00a7 99999"),
    ).toBeInTheDocument();
    expect(screen.getByText("Unverified quotes")).toBeInTheDocument();
    expect(
      screen.getByText(/every driver must yield to penguins/),
    ).toBeInTheDocument();
  });

  it("renders the skipped state without expand affordance", () => {
    const skipped: VerificationReport = {
      status: "skipped",
      citations_total: 0,
      citations_supported: 0,
      quotes_total: 0,
      quotes_supported: 0,
      unsupported_citations: [],
      unsupported_quotes: [],
    };
    render(<VerificationPanel report={skipped} />);

    const panel = screen.getByTestId("verification-panel");
    expect(panel.dataset.status).toBe("skipped");
    expect(screen.getByText(/No claims to verify/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Show details/ })).toBeNull();
  });
});
