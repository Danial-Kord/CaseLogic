import type {
  ChatDetail,
  ChatListResponse,
  FactorsResponse,
  JurisdictionsResponse,
  MatchedVia,
  SearchRequest,
  SearchResponse,
  SendMessageRequest,
  SendMessageResponse,
  StatusResponse,
  StatuteDetail,
  StatuteHit,
} from "./types";
import { looksLikeCitation } from "./citation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
// Default OFF. Flip ON via .env.local while the backend is unreachable.
const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK_MODE === "true";

const MOCK_STATUTES: StatuteDetail[] = [
  {
    statute_id: "ca-veh-23152-a",
    universal_citation: "Cal. Veh. Code § 23152(a)",
    jurisdiction: "California",
    code_name: "Cal. Veh. Code",
    section_number: "23152",
    subdivision: "a",
    division: "Division 11",
    chapter: "Chapter 12",
    statute_text:
      "It is unlawful for a person who is under the influence of any alcoholic beverage to drive a vehicle.",
    complete_statute:
      'Pursuant to Cal. Veh. Code § 23152(a), "It is unlawful for a person who is under the influence of any alcoholic beverage to drive a vehicle."',
    official_url:
      "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=VEH&sectionNum=23152",
    factors: ["DUI/DWI"],
    retrieved_at: null,
  },
  {
    statute_id: "ca-veh-23103-a",
    universal_citation: "Cal. Veh. Code § 23103(a)",
    jurisdiction: "California",
    code_name: "Cal. Veh. Code",
    section_number: "23103",
    subdivision: "a",
    division: "Division 11",
    chapter: "Chapter 12",
    statute_text:
      "A person who drives a vehicle upon a highway in willful or wanton disregard for the safety of persons or property is guilty of reckless driving.",
    complete_statute:
      'Pursuant to Cal. Veh. Code § 23103(a), "A person who drives a vehicle upon a highway in willful or wanton disregard for the safety of persons or property is guilty of reckless driving."',
    official_url:
      "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=VEH&sectionNum=23103",
    factors: ["Reckless Driving"],
    retrieved_at: null,
  },
  {
    statute_id: "ca-veh-22350",
    universal_citation: "Cal. Veh. Code § 22350",
    jurisdiction: "California",
    code_name: "Cal. Veh. Code",
    section_number: "22350",
    subdivision: null,
    division: "Division 11",
    chapter: "Chapter 7",
    statute_text:
      "No person shall drive a vehicle upon a highway at a speed greater than is reasonable or prudent having due regard for weather, visibility, the traffic on, and the surface and width of, the highway.",
    complete_statute:
      'Pursuant to Cal. Veh. Code § 22350, "No person shall drive a vehicle upon a highway at a speed greater than is reasonable or prudent…"',
    official_url:
      "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=VEH&sectionNum=22350",
    factors: ["Driving Too Fast For Conditions"],
    retrieved_at: null,
  },
  {
    statute_id: "ca-veh-21453-a",
    universal_citation: "Cal. Veh. Code § 21453(a)",
    jurisdiction: "California",
    code_name: "Cal. Veh. Code",
    section_number: "21453",
    subdivision: "a",
    division: "Division 11",
    chapter: "Chapter 2",
    statute_text:
      "A driver facing a steady circular red signal alone shall stop at a marked limit line, but if none, before entering the crosswalk on the near side of the intersection.",
    complete_statute:
      'Pursuant to Cal. Veh. Code § 21453(a), "A driver facing a steady circular red signal alone shall stop…"',
    official_url:
      "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=VEH&sectionNum=21453",
    factors: ["Failure to Obey Traffic Control Device"],
    retrieved_at: null,
  },
];

const MOCK_FACTORS: FactorsResponse = {
  factors: [
    { factor: "DUI/DWI", statute_count: 3 },
    { factor: "Driving Too Fast For Conditions", statute_count: 2 },
    { factor: "Failure to Maintain Lane", statute_count: 2 },
    { factor: "Failure to Obey Traffic Control Device", statute_count: 1 },
    { factor: "Failure to Use/Activate Horn", statute_count: 1 },
    { factor: "Failure to Yield at a Yield Sign", statute_count: 1 },
    { factor: "Failure to Yield the Right-of-Way", statute_count: 5 },
    { factor: "Fleeing a Police Officer", statute_count: 1 },
    { factor: "Fleeing the Scene of a Collision", statute_count: 2 },
    { factor: "Following Too Closely", statute_count: 1 },
    { factor: "Improper Lane of Travel", statute_count: 3 },
    { factor: "Improper Passing", statute_count: 6 },
    { factor: "Improper Starting", statute_count: 1 },
    { factor: "Improper Stopping", statute_count: 3 },
    { factor: "Improper Turning", statute_count: 5 },
    { factor: "Reckless Driving", statute_count: 1 },
    {
      factor: "Using a Wireless Telephone/Texting While Driving",
      statute_count: 2,
    },
  ],
};

// Pick a plausible matched_via per query so the badge palette is visible
// in mock mode. Live data carries this from the backend.
function inferMatchedVia(s: StatuteDetail, query: string): MatchedVia {
  if (looksLikeCitation(query)) return "citation";
  const q = query.toLowerCase();
  if (s.factors.some((f) => f.toLowerCase().includes(q))) return "keyword";
  if (s.statute_text.toLowerCase().includes(q)) return "hybrid";
  return "vector";
}

function detailToHit(
  detail: StatuteDetail,
  score: number,
  matchedVia: MatchedVia
): StatuteHit {
  return {
    statute_id: detail.statute_id,
    universal_citation: detail.universal_citation,
    jurisdiction: detail.jurisdiction,
    code_name: detail.code_name,
    section_number: detail.section_number,
    subdivision: detail.subdivision,
    division: detail.division,
    chapter: detail.chapter,
    statute_text: detail.statute_text,
    complete_statute: detail.complete_statute,
    official_url: detail.official_url,
    score,
    factors: detail.factors,
    matched_via: matchedVia,
  };
}

function mockSearch(request: SearchRequest): SearchResponse {
  const q = request.query.toLowerCase();
  const top_k = request.top_k ?? 10;
  const filtered = MOCK_STATUTES.filter((s) => {
    const matchesText =
      s.universal_citation.toLowerCase().includes(q) ||
      s.statute_text.toLowerCase().includes(q) ||
      s.factors.some((f) => f.toLowerCase().includes(q));
    const matchesFactor = !request.factor || s.factors.includes(request.factor);
    const matchesJurisdiction =
      !request.jurisdiction || s.jurisdiction === request.jurisdiction;
    return matchesText && matchesFactor && matchesJurisdiction;
  });
  return {
    query: request.query,
    factor: request.factor ?? null,
    jurisdiction: request.jurisdiction ?? null,
    top_k,
    results: filtered
      .slice(0, top_k)
      .map((s, i) =>
        detailToHit(s, 1 / (60 + i), inferMatchedVia(s, request.query))
      ),
  };
}

function mockStatus(): StatusResponse {
  return {
    indexed_documents: 0,
    sample_urls: [],
    indexed_statutes: 1543,
    jurisdictions: ["California"],
    last_eval_run_at: "2026-05-09T13:30:00.000Z",
    last_eval_recall_at_5: 0.87,
    last_eval_citation_recall_at_1: 1.0,
  };
}

class ApiClient {
  private baseUrl: string;
  private mockMode: boolean;

  constructor(baseUrl: string = API_BASE, mockMode: boolean = MOCK_MODE) {
    this.baseUrl = baseUrl;
    this.mockMode = mockMode;
  }

  async search(request: SearchRequest): Promise<SearchResponse> {
    if (this.mockMode) {
      await this.simulateLatency();
      return mockSearch(request);
    }

    const res = await fetch(`${this.baseUrl}/statutes/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      throw new Error(`Search failed: ${res.status}`);
    }
    return res.json();
  }

  // GET /statutes/{statute_id}. Slug must match ^[a-z0-9-]+$ — caller's
  // responsibility (use lib/citation.parseCitationToSlug). Throws Error("Not
  // found") on 404 so the caller can branch on UX.
  async getStatute(statuteId: string): Promise<StatuteDetail> {
    if (this.mockMode) {
      await this.simulateLatency(200);
      const found = MOCK_STATUTES.find((s) => s.statute_id === statuteId);
      if (!found) throw new Error("Not found");
      return found;
    }

    const encoded = encodeURIComponent(statuteId);
    const res = await fetch(`${this.baseUrl}/statutes/${encoded}`);
    if (res.status === 404) throw new Error("Not found");
    if (!res.ok) throw new Error(`Statute lookup failed: ${res.status}`);
    return res.json();
  }

  async getFactors(): Promise<FactorsResponse> {
    if (this.mockMode) {
      await this.simulateLatency(100);
      return MOCK_FACTORS;
    }

    const res = await fetch(`${this.baseUrl}/factors`);
    if (!res.ok) throw new Error(`Factors fetch failed: ${res.status}`);
    return res.json();
  }

  async getJurisdictions(): Promise<JurisdictionsResponse> {
    if (this.mockMode) {
      await this.simulateLatency(100);
      return {
        jurisdictions: [{ jurisdiction: "CA", statute_count: 41 }],
      };
    }

    const res = await fetch(`${this.baseUrl}/jurisdictions`);
    if (!res.ok) {
      throw new Error(`Jurisdictions fetch failed: ${res.status}`);
    }
    return res.json();
  }

  async getStatus(): Promise<StatusResponse> {
    if (this.mockMode) {
      await this.simulateLatency(200);
      return mockStatus();
    }

    const res = await fetch(`${this.baseUrl}/status`);
    if (!res.ok) {
      throw new Error(`Status check failed: ${res.status}`);
    }
    return res.json();
  }

  // ----- Chat sessions (multi-chat) ---------------------------------------

  async listChats(): Promise<ChatListResponse> {
    if (this.mockMode) {
      await this.simulateLatency(100);
      return { chats: [] };
    }
    const res = await fetch(`${this.baseUrl}/chats`);
    if (!res.ok) throw new Error(`List chats failed: ${res.status}`);
    return res.json();
  }

  async createChat(title?: string): Promise<ChatDetail> {
    if (this.mockMode) {
      await this.simulateLatency(100);
      const now = new Date().toISOString();
      return {
        chat_id: Math.random().toString(36).slice(2, 14),
        title: title ?? "New chat",
        created_at: now,
        updated_at: now,
        messages: [],
      };
    }
    const res = await fetch(`${this.baseUrl}/chats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(title ? { title } : {}),
    });
    if (!res.ok) throw new Error(`Create chat failed: ${res.status}`);
    return res.json();
  }

  async getChat(chatId: string): Promise<ChatDetail> {
    if (this.mockMode) throw new Error("Mock mode: getChat not supported");
    const res = await fetch(
      `${this.baseUrl}/chats/${encodeURIComponent(chatId)}`,
    );
    if (res.status === 404) throw new Error("Chat not found");
    if (!res.ok) throw new Error(`Get chat failed: ${res.status}`);
    return res.json();
  }

  async deleteChat(chatId: string): Promise<void> {
    if (this.mockMode) return;
    const res = await fetch(
      `${this.baseUrl}/chats/${encodeURIComponent(chatId)}`,
      { method: "DELETE" },
    );
    if (!res.ok && res.status !== 404) {
      throw new Error(`Delete chat failed: ${res.status}`);
    }
  }

  async sendChatMessage(
    chatId: string,
    request: SendMessageRequest,
  ): Promise<SendMessageResponse> {
    if (this.mockMode) {
      await this.simulateLatency(800);
      const search = await this.search({
        query: request.content,
        factor: request.factor,
        top_k: request.top_k ?? 10,
      });
      const now = new Date().toISOString();
      return {
        user_message: {
          id: -1,
          role: "user",
          content: request.content,
          hits: [],
          created_at: now,
        },
        assistant_message: {
          id: -2,
          role: "assistant",
          content: await this.chat(request.content),
          hits: search.results,
          created_at: now,
        },
        chat_title: request.content.slice(0, 60),
      };
    }
    const res = await fetch(
      `${this.baseUrl}/chats/${encodeURIComponent(chatId)}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      },
    );
    if (!res.ok) throw new Error(`Send message failed: ${res.status}`);
    return res.json();
  }

  // Phase-2 helper: ChatPanel collapses search results into a prose answer.
  // Not wired in Phase 1; kept here so the existing ChatPanel still compiles.
  async chat(query: string): Promise<string> {
    const searchRes = await this.search({ query, top_k: 5 });

    if (searchRes.results.length === 0) {
      return 'No matching statutes found for your query. Try searching by citation (e.g., "Cal. Veh. Code § 23152") or by topic (e.g., "reckless driving").';
    }

    const formatted = searchRes.results
      .map(
        (r, i) =>
          `**${i + 1}. ${r.universal_citation}**\n${r.statute_text}\n[View source](${r.official_url})${r.factors.length ? `\nFactors: ${r.factors.join(", ")}` : ""}`
      )
      .join("\n\n---\n\n");

    return `Found ${searchRes.results.length} relevant statute(s):\n\n${formatted}`;
  }

  private simulateLatency(ms: number = 500): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const api = new ApiClient();
