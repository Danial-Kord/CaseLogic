// Mirrors the Phase-1 FastAPI contract documented in
// /Users/liyuxiao/Downloads/api (2).md (kept under docs/ in repo TBD).
// Do not add back-compat aliases for the pre-contract names — they would let
// stale shapes survive in tests and mask backend drift.

export type MessageRole = "user" | "assistant";

export interface Source {
  url: string;
  title: string;
  snippet?: string;
  paragraph?: string;
}

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  sources?: Source[];
  timestamp: Date;
  isLoading?: boolean;
}

// GET /statutes/{statute_id} response
export interface StatuteOut {
  statute_id: string; // slug, e.g. "ca-veh-23152-a"
  universal_citation: string; // human form, e.g. "Cal. Veh. Code § 23152(a)"
  jurisdiction: string;
  code_name: string;
  section_number: string;
  subdivision: string | null;
  division: string;
  chapter: string;
  statute_text: string;
  complete_statute: string;
  official_url: string;
  factors: string[];
  retrieved_at: string;
}

// How a hit was surfaced by the retriever — tagged on POST /statutes/search
// results so the frontend can badge "exact text", "semantic", etc.
export type MatchedVia = "citation" | "vector" | "keyword" | "hybrid";

// One row in StatuteSearchResponse.results — StatuteOut + retrieval metadata.
export interface StatuteHit extends StatuteOut {
  score: number;
  matched_via: MatchedVia;
}

// POST /statutes/search request — flat shape (no `filters` wrapper).
export interface StatuteSearchRequest {
  query: string;
  factor?: string;
  top_k?: number;
}

// POST /statutes/search response.
export interface StatuteSearchResponse {
  query: string;
  factor: string | null;
  top_k: number;
  results: StatuteHit[];
}

// GET /factors response.
export interface FactorCategory {
  factor: string;
  statute_count: number;
}

export interface FactorsResponse {
  factors: FactorCategory[];
}

// GET /status response.
export interface StatusResponse {
  indexed_documents: number;
  sample_urls: string[];
  indexed_statutes: number;
  jurisdictions: string[];
  last_eval_run_at: string | null;
  last_eval_recall_at_5: number | null;
  last_eval_citation_recall_at_1: number | null;
}
