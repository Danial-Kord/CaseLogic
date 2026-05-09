// Phase-1 API contract. Mirrors backend/api/schemas.py — see docs/api.md
// for the human-readable version. Field names are byte-exact.

export interface SearchRequest {
  query: string;
  factor?: string;
  jurisdiction?: string;
  top_k?: number;
}

export type MatchedVia = "citation" | "vector" | "keyword" | "hybrid";

export interface StatuteHit {
  statute_id: string;
  universal_citation: string;
  jurisdiction: string;
  code_name: string;
  section_number: string;
  subdivision: string | null;
  division: string | null;
  chapter: string | null;
  statute_text: string;
  complete_statute: string;
  official_url: string;
  score: number;
  factors: string[];
  matched_via: MatchedVia;
}

export interface SearchResponse {
  query: string;
  factor: string | null;
  jurisdiction: string | null;
  top_k: number;
  results: StatuteHit[];
}

export interface StatuteDetail {
  statute_id: string;
  universal_citation: string;
  jurisdiction: string;
  code_name: string;
  section_number: string;
  subdivision: string | null;
  division: string | null;
  chapter: string | null;
  statute_text: string;
  complete_statute: string;
  official_url: string;
  factors: string[];
  retrieved_at: string | null;
}

// One outgoing edge from a statute. Returned by GET /statutes/{slug}/related.
// The graph visualization (components/SourceViewer/RelatedGraph) consumes
// these directly.
export interface RelatedStatute {
  statute_id: string;
  universal_citation: string;
  jurisdiction: string;
  section_number: string;
  subdivision: string | null;
  snippet: string;
  mention_count: number;
}

export interface RelatedStatutesResponse {
  source_statute_id: string;
  related: RelatedStatute[];
}

export interface FactorCount {
  factor: string;
  statute_count: number;
}

export interface FactorsResponse {
  factors: FactorCount[];
}

export interface JurisdictionCount {
  jurisdiction: string;
  statute_count: number;
}

export interface JurisdictionsResponse {
  jurisdictions: JurisdictionCount[];
}

export interface StatusResponse {
  indexed_documents: number;
  sample_urls: string[];
  indexed_statutes: number;
  jurisdictions: string[];
  last_eval_run_at: string | null;
  last_eval_recall_at_5: number | null;
  last_eval_citation_recall_at_1: number | null;
}

// Phase-2 chat surface (ChatPanel). Kept here so the component compiles;
// not yet wired into app/page.tsx.

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

// Multi-chat sessions. Mirrors backend/api/schemas.py — see
// backend/api/routes_chats.py for the contract.

export interface ChatMessage {
  id: number;
  role: MessageRole;
  content: string;
  hits: StatuteHit[];
  created_at: string;
}

export interface ChatSummary {
  chat_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface ChatDetail {
  chat_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
}

export interface ChatListResponse {
  chats: ChatSummary[];
}

export interface SendMessageRequest {
  content: string;
  factor?: string;
  top_k?: number;
  // When explicitly false, the backend won't expose the web_search tool
  // to Claude this turn — the agent stays inside the local statute corpus.
  // Omit (or undefined) to let the server use its default.
  web_search_enabled?: boolean;
}

/**
 * Options surfaced to the page-level `handleSend` from the chat composer.
 * Keep this UI-flavored (camelCase, booleans) — `lib/api.ts` translates it
 * into the on-the-wire `SendMessageRequest` shape.
 */
export interface SendMessageOptions {
  webSearchEnabled: boolean;
}

export interface SendMessageResponse {
  user_message: ChatMessage;
  assistant_message: ChatMessage;
  chat_title: string;
}

// SSE events emitted by `POST /chats/{id}/messages/stream`. Each event
// represents one observable moment of the agent's tool-use loop so the
// frontend can render a live "thinking" trace instead of a static
// "Searching…" placeholder.
//
// The terminal event is always `final` or `error`.
export type ChatStreamEvent =
  | { type: "started" }
  | { type: "thinking"; step: number; label: string }
  | { type: "thought"; text: string }
  | {
      type: "tool_start";
      name: string;
      label: string;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_done";
      name: string;
      summary: string;
      count: number | null;
    }
  | { type: "drafting" }
  | {
      type: "final";
      user_message: ChatMessage;
      assistant_message: ChatMessage;
      chat_title: string;
    }
  | { type: "error"; detail: string; status?: number };

// Frontend-side representation of one entry in the live thinking trace.
// Built up from the SSE stream and rendered by `ThinkingTrace`.
export type ThinkingStep =
  | { kind: "thinking"; label: string }
  | { kind: "thought"; text: string }
  | { kind: "tool"; name: string; label: string; summary?: string; done: boolean }
  | { kind: "drafting" };

// Single-user demo profile. Persisted server-side; injected into the LLM
// system prompt on every chat send so responses are tailored.
export interface Profile {
  name: string;
  role: string;
  firm: string;
  about: string;
  updated_at: string | null;
}
