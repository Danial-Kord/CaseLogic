// Citation regex + slug builder. Consolidates the duplicate CITATION_RE that
// previously lived in SearchPanel.tsx and app/page.tsx.
//
// TODO: confirm slug grammar matches backend parse_citation() once the
// FastAPI server is reachable. The spec examples we're matching:
//   "Cal. Veh. Code § 22350"     -> "ca-veh-22350"
//   "Cal. Veh. Code § 21451(a)"  -> "ca-veh-21451-a"
// Edge cases to verify with the backend author:
//   - nested subdivisions like "(a)(1)" — currently unhandled, treated as no match
//   - non-VEH codes (PEN, etc.) — Phase 1 is CA Veh only
//   - non-breaking space between "§" and the digits — \s already handles it in JS
// Mitigation for any drift: app/page.tsx falls back to POST /statutes/search
// on a 404 from GET /statutes/{slug}, so a wrong slug never dead-ends the user.

const CITATION_RE =
  /^(?:cal\.?\s*veh\.?\s*code\s*)?§?\s*(\d{4,5})(?:\(([a-z])\))?$/i;

export function looksLikeCitation(input: string): boolean {
  return CITATION_RE.test(input.trim());
}

export function parseCitationToSlug(input: string): string | null {
  const match = input.trim().match(CITATION_RE);
  if (!match) return null;
  const [, section, subdivision] = match;
  const base = `ca-veh-${section}`;
  return subdivision ? `${base}-${subdivision.toLowerCase()}` : base;
}
