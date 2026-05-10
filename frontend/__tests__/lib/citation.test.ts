import {
  looksLikeCitation,
  parseCitationToSlug,
  parseCrossReferenceToSlug,
} from "@/lib/citation";

const SECTION = "\u00a7";

describe("looksLikeCitation", () => {
  it.each([
    [`Cal. Veh. Code ${SECTION} 22350`, true],
    [`Cal. Veh. Code ${SECTION} 23152(a)`, true],
    [`${SECTION} 23152(a)`, true],
    ["23152(a)", true],
    ["22350", true],
    ["  22350  ", true],
    ["reckless driving", false],
    ["", false],
    ["running a red light", false],
    [`Cal Veh ${SECTION} abc`, false],
  ])("looksLikeCitation(%j) === %s", (input, expected) => {
    expect(looksLikeCitation(input)).toBe(expected);
  });
});

describe("parseCitationToSlug", () => {
  it.each([
    [`Cal. Veh. Code ${SECTION} 22350`, "ca-veh-22350"],
    [`Cal. Veh. Code ${SECTION} 21451(a)`, "ca-veh-21451-a"],
    [`Cal. Veh. Code ${SECTION} 23152(A)`, "ca-veh-23152-a"],
    [`${SECTION} 23152(a)`, "ca-veh-23152-a"],
    ["23152(a)", "ca-veh-23152-a"],
    ["22350", "ca-veh-22350"],
    [`  Cal. Veh. Code ${SECTION} 22350  `, "ca-veh-22350"],
    [`Cal Veh Code ${SECTION} 22350`, "ca-veh-22350"],
  ])("parseCitationToSlug(%j) === %j", (input, expected) => {
    expect(parseCitationToSlug(input)).toBe(expected);
  });

  it.each([
    ["reckless driving"],
    [""],
    ["running a red light"],
    ["123"], // too short ? the regex requires 4-5 digits
    [`Cal. Veh. Code ${SECTION} abc`],
  ])("parseCitationToSlug(%j) returns null for non-citation input", (input) => {
    expect(parseCitationToSlug(input)).toBeNull();
  });
});

describe("parseCrossReferenceToSlug", () => {
  describe("explicit jurisdictions", () => {
    it.each<[string, string]>([
      ["RCW 46.61.5249", "wa-rcw-46-61-5249"],
      ["RCW 46.61.500", "wa-rcw-46-61-500"],
      [`Wash. Rev. Code ${SECTION} 46.61.500`, "wa-rcw-46-61-500"],
      [`Cal. Veh. Code ${SECTION} 22350`, "ca-veh-22350"],
      [`Cal. Veh. Code ${SECTION} 21453(a)`, "ca-veh-21453-a"],
      [`California Vehicle Code ${SECTION} 23152(A)`, "ca-veh-23152-a"],
      [`Fla. Stat. ${SECTION} 316.183`, "fl-stat-316-183"],
      [`Fla. Stat. ${SECTION} 316.183(2)`, "fl-stat-316-183-2"],
      [`N.Y. Veh. & Traf. Law ${SECTION} 1180`, "ny-vat-1180"],
      [`N.Y. Veh. & Traf. Law ${SECTION} 1180(a)`, "ny-vat-1180-a"],
    ])("%s -> %s", (input, expected) => {
      expect(parseCrossReferenceToSlug(input)).toBe(expected);
    });

    it("matches a citation embedded in surrounding prose", () => {
      const sentence =
        "Failure to comply, see RCW 46.61.5249, can result in a citation.";
      expect(parseCrossReferenceToSlug(sentence)).toBe("wa-rcw-46-61-5249");
    });
  });

  describe("bare section references", () => {
    it("returns null without a default jurisdiction", () => {
      expect(parseCrossReferenceToSlug(`${SECTION} 22350`)).toBeNull();
    });

    it.each<[string, string, string]>([
      [`${SECTION} 22350`, "California", "ca-veh-22350"],
      [`${SECTION} 22350`, "CA", "ca-veh-22350"],
      [`${SECTION} 22350(a)`, "CA", "ca-veh-22350-a"],
      [`${SECTION} 1180`, "NY", "ny-vat-1180"],
      [`${SECTION} 316.183`, "FL", "fl-stat-316-183"],
      [`${SECTION} 46.61.500`, "WA", "wa-rcw-46-61-500"],
    ])("%s with %s default -> %s", (input, defaultJurisdiction, expected) => {
      expect(parseCrossReferenceToSlug(input, defaultJurisdiction)).toBe(
        expected,
      );
    });

    it("returns null for unknown default jurisdictions", () => {
      expect(parseCrossReferenceToSlug(`${SECTION} 22350`, "TX")).toBeNull();
    });
  });

  describe("rejections", () => {
    it.each([[""], ["reckless driving"], ["running a red light"], ["RCW abc"]])(
      "%j -> null",
      (input) => {
        expect(parseCrossReferenceToSlug(input)).toBeNull();
      },
    );
  });
});
