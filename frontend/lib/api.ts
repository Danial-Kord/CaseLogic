import type {
  StatuteOut,
  StatuteHit,
  StatuteSearchRequest,
  StatuteSearchResponse,
  StatusResponse,
  FactorsResponse,
  MatchedVia,
} from "./types";
import { looksLikeCitation } from "./citation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
// Default OFF. Flip ON via .env.local while the backend is unreachable.
const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK_MODE === "true";

// Mock statutes shaped like the real StatuteOut payload so components don't
// need to special-case mock vs live data. Slugs follow the contract grammar
// (e.g. "ca-veh-23152-a", subdivision separated by a hyphen).
const MOCK_STATUTES: StatuteOut[] = [
  {
    statute_id: "ca-veh-23152-a",
    universal_citation: "Cal. Veh. Code § 23152(a)",
    jurisdiction: "California",
    code_name: "Cal. Veh. Code",
    section_number: "23152",
    subdivision: "a",
    division: "Division 11.5",
    chapter: "Chapter 12",
    statute_text:
      "It is unlawful for a person who is under the influence of any alcoholic beverage to drive a vehicle.",
    complete_statute:
      "Pursuant to Cal. Veh. Code § 23152(a), it is unlawful for a person who is under the influence of any alcoholic beverage to drive a vehicle.",
    official_url:
      "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=VEH&sectionNum=23152",
    factors: ["DUI/DWI"],
    retrieved_at: "2026-05-09T13:55:01.000Z",
  },
  {
    statute_id: "ca-veh-23103-a",
    universal_citation: "Cal. Veh. Code § 23103(a)",
    jurisdiction: "California",
    code_name: "Cal. Veh. Code",
    section_number: "23103",
    subdivision: "a",
    division: "Division 11.5",
    chapter: "Chapter 12",
    statute_text:
      "A person who drives a vehicle upon a highway in willful or wanton disregard for the safety of persons or property is guilty of reckless driving.",
    complete_statute:
      "Pursuant to Cal. Veh. Code § 23103(a), a person who drives a vehicle upon a highway in willful or wanton disregard for the safety of persons or property is guilty of reckless driving.",
    official_url:
      "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=VEH&sectionNum=23103",
    factors: ["Reckless Driving"],
    retrieved_at: "2026-05-09T13:55:01.000Z",
  },
  {
    statute_id: "ca-veh-21750-a",
    universal_citation: "Cal. Veh. Code § 21750(a)",
    jurisdiction: "California",
    code_name: "Cal. Veh. Code",
    section_number: "21750",
    subdivision: "a",
    division: "Division 11",
    chapter: "Chapter 5",
    statute_text:
      "The driver of a vehicle overtaking another vehicle proceeding in the same direction shall pass to the left at a safe distance without interfering with the safe operation of the overtaken vehicle.",
    complete_statute:
      "Pursuant to Cal. Veh. Code § 21750(a), the driver of a vehicle overtaking another vehicle proceeding in the same direction shall pass to the left at a safe distance without interfering with the safe operation of the overtaken vehicle.",
    official_url:
      "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=VEH&sectionNum=21750",
    factors: ["Improper Passing"],
    retrieved_at: "2026-05-09T13:55:01.000Z",
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
      "Pursuant to Cal. Veh. Code § 22350, no person shall drive a vehicle upon a highway at a speed greater than is reasonable or prudent having due regard for weather, visibility, the traffic on, and the surface and width of, the highway.",
    official_url:
      "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=VEH&sectionNum=22350",
    factors: ["Driving Too Fast For Conditions"],
    retrieved_at: "2026-05-09T13:55:01.000Z",
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
      "Pursuant to Cal. Veh. Code § 21453(a), a driver facing a steady circular red signal alone shall stop at a marked limit line, but if none, before entering the crosswalk on the near side of the intersection.",
    official_url:
      "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=VEH&sectionNum=21453",
    factors: ["Failure to Obey Traffic Control Device"],
    retrieved_at: "2026-05-09T13:55:01.000Z",
  },
];

// 17 locked categories, byte-exact, statute_count from the released CSV.
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

function mockSearch(req: StatuteSearchRequest): StatuteSearchResponse {
  const q = req.query.toLowerCase();
  // Pick a plausible matched_via per query so the badge demo is visible.
  const inferMatchedVia = (s: StatuteOut): MatchedVia => {
    if (looksLikeCitation(req.query)) return "citation";
    if (s.factors.some((f) => f.toLowerCase().includes(q))) return "keyword";
    if (s.statute_text.toLowerCase().includes(q)) return "hybrid";
    return "vector";
  };

  const filtered = MOCK_STATUTES.filter((s) => {
    if (req.factor && !s.factors.includes(req.factor)) return false;
    return (
      s.universal_citation.toLowerCase().includes(q) ||
      s.statute_text.toLowerCase().includes(q) ||
      s.factors.some((f) => f.toLowerCase().includes(q))
    );
  });

  const results: StatuteHit[] = filtered.map((s, i) => ({
    ...s,
    score: 1 / (60 + i + 1),
    matched_via: inferMatchedVia(s),
  }));

  return {
    query: req.query,
    factor: req.factor ?? null,
    top_k: req.top_k ?? 10,
    results: results.slice(0, req.top_k ?? 10),
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

  async search(
    request: StatuteSearchRequest
  ): Promise<StatuteSearchResponse> {
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

  // GET /statutes/{slug}. The slug must match ^[a-z0-9-]+$ — caller's
  // responsibility (use lib/citation.parseCitationToSlug).
  // Throws Error("Not found") on 404 so the caller can branch on UX.
  async getStatute(slug: string): Promise<StatuteOut> {
    if (this.mockMode) {
      await this.simulateLatency(200);
      const found = MOCK_STATUTES.find((s) => s.statute_id === slug);
      if (!found) throw new Error("Not found");
      return found;
    }

    const res = await fetch(`${this.baseUrl}/statutes/${slug}`);
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

  async chat(query: string): Promise<string> {
    // Phase 1: wrap search. Phase 2 will hit the OpenClaw agent endpoint.
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
