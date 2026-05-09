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
}

export interface SendMessageResponse {
  user_message: ChatMessage;
  assistant_message: ChatMessage;
  chat_title: string;
}

// Single-user demo profile. Persisted server-side; injected into the LLM
// system prompt on every chat send so responses are tailored.
export interface Profile {
  name: string;
  role: string;
  firm: string;
  about: string;
  updated_at: string | null;
}
