import type { SearchRequest, SearchResponse, StatusResponse, StatuteResult } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK_MODE === "true";

// Mock data for frontend-only development
const MOCK_STATUTES: StatuteResult[] = [
  {
    statute_id: "ca-veh-23152a",
    citation: "Cal. Veh. Code § 23152(a)",
    text: "It is unlawful for a person who is under the influence of any alcoholic beverage to drive a vehicle.",
    official_url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=VEH&sectionNum=23152",
    factors: ["DUI/DWI"],
    score: 0.95,
  },
  {
    statute_id: "ca-veh-23103a",
    citation: "Cal. Veh. Code § 23103(a)",
    text: "A person who drives a vehicle upon a highway in willful or wanton disregard for the safety of persons or property is guilty of reckless driving.",
    official_url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=VEH&sectionNum=23103",
    factors: ["Reckless Driving"],
    score: 0.92,
  },
  {
    statute_id: "ca-veh-21750a",
    citation: "Cal. Veh. Code § 21750(a)",
    text: "The driver of a vehicle overtaking another vehicle proceeding in the same direction shall pass to the left at a safe distance without interfering with the safe operation of the overtaken vehicle.",
    official_url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=VEH&sectionNum=21750",
    factors: ["Improper Passing"],
    score: 0.88,
  },
  {
    statute_id: "ca-veh-22350",
    citation: "Cal. Veh. Code § 22350",
    text: "No person shall drive a vehicle upon a highway at a speed greater than is reasonable or prudent having due regard for weather, visibility, the traffic on, and the surface and width of, the highway.",
    official_url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=VEH&sectionNum=22350",
    factors: ["Driving Too Fast For Conditions"],
    score: 0.85,
  },
  {
    statute_id: "ca-veh-21453a",
    citation: "Cal. Veh. Code § 21453(a)",
    text: "A driver facing a steady circular red signal alone shall stop at a marked limit line, but if none, before entering the crosswalk on the near side of the intersection.",
    official_url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=VEH&sectionNum=21453",
    factors: ["Failure to Obey Traffic Control Device"],
    score: 0.82,
  },
];

function mockSearch(query: string): SearchResponse {
  const q = query.toLowerCase();
  const results = MOCK_STATUTES.filter(
    (s) =>
      s.citation.toLowerCase().includes(q) ||
      s.text.toLowerCase().includes(q) ||
      s.factors?.some((f) => f.toLowerCase().includes(q))
  );
  return { results, query };
}

function mockStatus(): StatusResponse {
  return {
    indexed_count: 1547,
    jurisdictions: ["CA"],
    last_ingest: new Date().toISOString(),
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
      return mockSearch(request.query);
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

  async chat(query: string): Promise<string> {
    // In Phase 1 this wraps search
    // In Phase 2 this will hit the OpenClaw agent endpoint
    const searchRes = await this.search({ query, top_k: 5 });

    if (searchRes.results.length === 0) {
      return "No matching statutes found for your query. Try searching by citation (e.g., \"Cal. Veh. Code § 23152\") or by topic (e.g., \"reckless driving\").";
    }

    // Format results as a readable response
    const formatted = searchRes.results
      .map(
        (r, i) =>
          `**${i + 1}. ${r.citation}**\n${r.text}\n[View source](${r.official_url})${r.factors?.length ? `\nFactors: ${r.factors.join(", ")}` : ""}`
      )
      .join("\n\n---\n\n");

    return `Found ${searchRes.results.length} relevant statute(s):\n\n${formatted}`;
  }

  private simulateLatency(ms: number = 500): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const api = new ApiClient();
