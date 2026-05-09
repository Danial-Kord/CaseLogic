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

export interface SearchFilters {
  factor?: string;
  jurisdiction?: string;
}

export interface SearchRequest {
  query: string;
  filters?: SearchFilters;
  top_k?: number;
}

export interface StatuteResult {
  statute_id: string;
  citation: string;
  text: string;
  official_url: string;
  factors?: string[];
  score?: number;
}

export interface SearchResponse {
  results: StatuteResult[];
  query: string;
}

export interface StatusResponse {
  indexed_count: number;
  jurisdictions: string[];
  last_ingest?: string;
  // TODO: add once Person 4 exposes it on GET /status
  eval_score?: number;
}

// GET /factors response
export interface FactorCategory {
  factor: string;
  count: number;
}

export interface FactorsResponse {
  factors: FactorCategory[];
}
