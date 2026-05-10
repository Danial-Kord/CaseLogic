// Citation regex + slug builder. Two surfaces live here:
//
//   - parseCitationToSlug(input)        — strict, anchored CA-Veh-only parse
//                                         used by the search box / SearchPanel.
//                                         Stays narrow because the search input
//                                         is short and we want a confident match.
//
//   - parseCrossReferenceToSlug(input,
//       defaultJurisdiction?)           — multi-jurisdiction extractor for
//                                         citation chips embedded inside
//                                         statute text (RCW, Fla., N.Y., CA,
//                                         and bare "§ N" against a default).
//                                         Mirrors backend/retrieval/__init__.py
//                                         parse_citation so the slug we hand
//                                         to GET /statutes/{slug} matches
//                                         what the indexer wrote.
//
// Slug grammar (matches backend.retrieval.make_statute_id):
//   "Cal. Veh. Code § 22350"     -> "ca-veh-22350"
//   "Cal. Veh. Code § 21451(a)"  -> "ca-veh-21451-a"
//   "RCW 46.61.5249"             -> "wa-rcw-46-61-5249"
//   "Fla. Stat. § 316.183(2)"    -> "fl-stat-316-183-2"
//   "N.Y. Veh. & Traf. Law § 1180(a)" -> "ny-vat-1180-a"
//
// Edge cases worth knowing:
//   - nested subdivisions like "(a)(1)" — only the FIRST subdivision is kept
//     (matches backend behavior; the slug grammar is one subdivision deep)
//   - non-breaking space between "§" and the digits — \s handles it in JS
// Mitigation for any drift: SourceViewer falls back to "Statute not found." on
// a 404, so a wrong slug shows a clear empty state rather than dead-ending.

// ---------------------------------------------------- strict CA-only (legacy)
//
// Kept for backwards compatibility with SearchPanel.tsx and the search-box
// citation fast-path. The cross-ref parser below is what new callers should
// reach for.

const CITATION_RE =
  /^(?:cal\.?\s*veh\.?\s*code\s*)?\u00a7?\s*(\d{4,5})(?:\(([a-z])\))?$/i;

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

// ----------------------------------------- multi-jurisdiction cross-references

// Per-jurisdiction patterns. These are NOT anchored — they're meant to match
// inside arbitrary prose (statute body, chat answers, snippets). Order matters:
// patterns with an explicit code prefix come first so a leading "RCW" or
// "Fla. Stat." steals the match before the bare-section fallback.
//
// Each pattern exposes two named groups:
//   section      — the section number, possibly dotted (e.g. 46.61.5249)
//   subdivision  — single subdivision (a, 1, iv) or undefined
//
// The patterns intentionally only capture ONE level of subdivision; nested
// "(a)(1)" gets truncated to "(a)". The backend has the same shape.

interface Pattern {
  re: RegExp;
  jurisdiction: "ca" | "fl" | "ny" | "wa";
  code: "veh" | "stat" | "vat" | "rcw";
}

// Cal. Veh. Code: prefix is required. Bare 4-5 digit section is handled by the
// "default jurisdiction" branch when defaultJurisdiction === "CA"/"California".
const _CA: Pattern = {
  re: /(?:cal(?:ifornia)?\.?\s*veh(?:icle)?\.?\s*code\s*)\u00a7?\s*(?<section>\d{4,5}(?:\.\d+)?)(?:\s*\(\s*(?<subdivision>[a-z0-9]+)\s*\))?/i,
  jurisdiction: "ca",
  code: "veh",
};

// Florida Statutes: prefix optional, but bare-only matches require the section
// to look like a chapter-316 reference (3NN.NNN). Keeps us from yanking random
// dotted numbers out of statute text.
const _FL: Pattern = {
  re: /(?:fla?\.?\s*stat(?:utes?)?\.?\s*)\u00a7?\s*(?<section>3(?:0[0-9]|1[0-9]|2[0-9])\.\d{1,4})(?:\s*\(\s*(?<subdivision>[a-z0-9]+)\s*\))?/i,
  jurisdiction: "fl",
  code: "stat",
};

const _NY: Pattern = {
  re: /(?:n\.?\s*y\.?\s*veh(?:icle)?\.?\s*(?:&|and)\s*traf(?:fic)?\.?\s*(?:law)?\s*)\u00a7?\s*(?<section>1[0-9]{3})(?:\s*\(\s*(?<subdivision>[a-z0-9]+)\s*\))?/i,
  jurisdiction: "ny",
  code: "vat",
};

// RCW: "RCW 46.61.5249" or "Wash. Rev. Code § 46.61.5249". The backend only
// indexes Title 46.61, so we restrict the pattern to that title — anything
// outside it would just 404 anyway.
const _WA: Pattern = {
  re: /(?:(?:wash(?:ington)?\.?\s*)?rev(?:ised)?\.?\s*code\.?\s*(?:wash\.?)?\s*\u00a7?\s*|rcw\s+)(?<section>46\.61\.\d{1,4})(?:\s*\(\s*(?<subdivision>[a-z0-9]+)\s*\))?/i,
  jurisdiction: "wa",
  code: "rcw",
};

// Bare "§ NNN" reference. Resolves only when the caller passes a
// defaultJurisdiction (e.g. the surrounding row's jurisdiction). The section
// shape is intentionally permissive — we let the per-jurisdiction default
// builder shape the slug below.
const _BARE_RE =
  /\u00a7\s*(?<section>\d+(?:\.\d+)*)(?:\s*\(\s*(?<subdivision>[a-z0-9]+)\s*\))?/i;

const _PATTERNS: Pattern[] = [_WA, _FL, _NY, _CA];

export type Jurisdiction = "CA" | "FL" | "NY" | "WA" | string;

/**
 * Parse a free-form cross-reference like "RCW 46.61.5249" or "§ 22350(a)"
 * into the canonical statute_id slug used by GET /statutes/{slug}.
 *
 * If `defaultJurisdiction` is provided, bare "§ N" references resolve
 * against it (e.g. "§ 22350" inside a CA row → "ca-veh-22350"). When the
 * default is unknown or the pattern doesn't fit, returns null and the
 * caller should leave the visual chip non-clickable.
 */
export function parseCrossReferenceToSlug(
  input: string,
  defaultJurisdiction?: Jurisdiction | null,
): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  for (const p of _PATTERNS) {
    const m = trimmed.match(p.re);
    if (m && m.groups?.section) {
      return _buildSlug(
        p.jurisdiction,
        p.code,
        m.groups.section,
        m.groups.subdivision,
      );
    }
  }

  // Bare "§ N" — only resolvable if we know which jurisdiction this lived in.
  const bare = trimmed.match(_BARE_RE);
  if (bare && bare.groups?.section && defaultJurisdiction) {
    const j = _normalizeJurisdiction(defaultJurisdiction);
    if (!j) return null;
    return _buildSlug(
      j.jurisdiction,
      j.code,
      bare.groups.section,
      bare.groups.subdivision,
    );
  }

  return null;
}

// ----------------------------------------------------------------- internals

function _normalizeJurisdiction(
  raw: Jurisdiction,
): { jurisdiction: Pattern["jurisdiction"]; code: Pattern["code"] } | null {
  const k = raw.trim().toLowerCase();
  if (k === "ca" || k === "california") return { jurisdiction: "ca", code: "veh" };
  if (k === "fl" || k === "florida") return { jurisdiction: "fl", code: "stat" };
  if (k === "ny" || k === "new york") return { jurisdiction: "ny", code: "vat" };
  if (k === "wa" || k === "washington") return { jurisdiction: "wa", code: "rcw" };
  return null;
}

function _buildSlug(
  jurisdiction: Pattern["jurisdiction"],
  code: Pattern["code"],
  section: string,
  subdivision: string | undefined,
): string {
  // Section: lowercase, replace any non-alnum (incl. "." in 46.61.5249) with
  // "-" to satisfy the backend's ^[a-z0-9-]+$ slug constraint.
  const sectionSlug = section
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = `${jurisdiction}-${code}-${sectionSlug}`;
  if (!subdivision) return base;
  const sub = subdivision.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return sub ? `${base}-${sub}` : base;
}
