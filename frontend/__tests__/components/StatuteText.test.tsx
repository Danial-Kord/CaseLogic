import { render, screen } from "@testing-library/react";
import StatuteText from "@/components/SourceViewer/StatuteText";

describe("StatuteText", () => {
  it("highlights legal terms-of-art with <mark>", () => {
    render(
      <StatuteText text="A person who drives in willful or wanton disregard for the safety of persons is guilty of reckless driving." />,
    );
    // "willful or wanton disregard" should be wrapped in a single <mark>.
    const marks = document.querySelectorAll("mark");
    const texts = Array.from(marks).map((m) => m.textContent);
    expect(texts).toContain("willful or wanton disregard");
    // The matcher is greedy / longest-first, so the phrase "is guilty of"
    // (which appears in our term list before the shorter "guilty of") wins.
    expect(texts).toContain("is guilty of");
    expect(texts).toContain("reckless");
  });

  it("renders cross-references with a tooltip and accent styling", () => {
    render(
      <StatuteText text='Pursuant to Cal. Veh. Code § 23152(a), "It is unlawful to drive."' />,
    );
    const refs = document.querySelectorAll(
      'span[title="Cross-reference to another statute"]',
    );
    expect(refs.length).toBe(1);
    expect(refs[0].textContent).toBe("Cal. Veh. Code § 23152(a)");
  });

  it("splits inline subsection markers like (1), (2), (3) into separate paragraphs", () => {
    const wa =
      "Every person operating a vehicle shall drive it (1) at a careful and prudent rate of speed. (2) The driver of every vehicle shall, consistent with this requirement, drive at an appropriate reduced speed when approaching an intersection. (3) The fact alone of a speed in excess of these limits shall not constitute negligence.";
    const { container } = render(<StatuteText text={wa} />);
    // One paragraph for the lead-in sentence + one per numbered subsection.
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs.length).toBeGreaterThanOrEqual(3);
  });

  it("pulls trailing legislative-history footer into its own dim section", () => {
    const text =
      "(1) A driver shall yield. [ 2009 c 274 § 1; 1991 c 319 § 408. Prior: 1965 ex.s. c 155 § 12.]";
    render(<StatuteText text={text} />);
    expect(screen.getByText(/legislative history/i)).toBeInTheDocument();
    // The bracketed history should not appear inside any <mark>.
    const marks = document.querySelectorAll("mark");
    const markText = Array.from(marks).map((m) => m.textContent).join(" ");
    expect(markText).not.toContain("2009");
  });

  it("renders subsection prefix labels in the margin", () => {
    render(<StatuteText text="(a) A person who drives recklessly is guilty." />);
    // The "(a)" label should appear once in the margin span.
    const labels = Array.from(document.querySelectorAll("span")).filter(
      (s) => s.textContent === "(a)",
    );
    expect(labels.length).toBe(1);
  });

  it("does not double-highlight when terms overlap (longest match wins)", () => {
    render(<StatuteText text="The defendant acted with willful or wanton disregard." />);
    // Should render exactly one <mark> for the long phrase, not three for
    // each of "willful" / "wanton" / "willful or wanton".
    const marks = document.querySelectorAll("mark");
    expect(marks.length).toBe(1);
    expect(marks[0].textContent).toBe("willful or wanton disregard");
  });
});
