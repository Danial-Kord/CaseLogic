import { looksLikeCitation, parseCitationToSlug } from "@/lib/citation";

describe("looksLikeCitation", () => {
  it.each([
    ["Cal. Veh. Code § 22350", true],
    ["Cal. Veh. Code § 23152(a)", true],
    ["§ 23152(a)", true],
    ["23152(a)", true],
    ["22350", true],
    ["  22350  ", true],
    ["reckless driving", false],
    ["", false],
    ["running a red light", false],
    ["Cal Veh § abc", false],
  ])("looksLikeCitation(%j) === %s", (input, expected) => {
    expect(looksLikeCitation(input)).toBe(expected);
  });
});

describe("parseCitationToSlug", () => {
  it.each([
    ["Cal. Veh. Code § 22350", "ca-veh-22350"],
    ["Cal. Veh. Code § 21451(a)", "ca-veh-21451-a"],
    ["Cal. Veh. Code § 23152(A)", "ca-veh-23152-a"],
    ["§ 23152(a)", "ca-veh-23152-a"],
    ["23152(a)", "ca-veh-23152-a"],
    ["22350", "ca-veh-22350"],
    ["  Cal. Veh. Code § 22350  ", "ca-veh-22350"],
    ["Cal Veh Code § 22350", "ca-veh-22350"],
  ])("parseCitationToSlug(%j) === %j", (input, expected) => {
    expect(parseCitationToSlug(input)).toBe(expected);
  });

  it.each([
    ["reckless driving"],
    [""],
    ["running a red light"],
    ["123"], // too short — the regex requires 4-5 digits
    ["Cal. Veh. Code § abc"],
  ])("parseCitationToSlug(%j) returns null for non-citation input", (input) => {
    expect(parseCitationToSlug(input)).toBeNull();
  });
});
