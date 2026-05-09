import type { StatuteDetail, StatuteHit } from "./types";

export const BOOKMARKS_STORAGE_KEY = "caselogic-bookmarks-v1";

/** Build a StatuteHit from API detail for saving (retrieval metadata is unknown). */
export function statuteDetailToHit(d: StatuteDetail): StatuteHit {
  return {
    statute_id: d.statute_id,
    universal_citation: d.universal_citation,
    jurisdiction: d.jurisdiction,
    code_name: d.code_name,
    section_number: d.section_number,
    subdivision: d.subdivision,
    division: d.division,
    chapter: d.chapter,
    statute_text: d.statute_text,
    complete_statute: d.complete_statute,
    official_url: d.official_url,
    factors: d.factors,
    score: 0,
    matched_via: "keyword",
  };
}

export function loadBookmarksFromStorage(): StatuteHit[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(BOOKMARKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is StatuteHit =>
        row != null &&
        typeof row === "object" &&
        typeof (row as StatuteHit).statute_id === "string" &&
        typeof (row as StatuteHit).universal_citation === "string",
    );
  } catch {
    return [];
  }
}

export function saveBookmarksToStorage(bookmarks: StatuteHit[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks));
  } catch {
    /* quota or privacy mode — ignore */
  }
}
