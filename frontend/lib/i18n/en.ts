// Single English locale file. All user-facing strings live here so copy can
// be reviewed independently of code, and so a real i18n layer can be dropped
// in later without touching components.
//
// Keys are grouped by feature/component. Parameterized strings are exposed
// as small functions returning the formatted string.

export const strings = {
  app: {
    name: "CaseLogic",
    tagline: "Source-grounded legal research",
    metaTitle: "CaseLogic — Source-grounded PI legal research",
    metaDescription:
      "Hackathon prototype for personal-injury legal research. Source-grounded answers from public case law.",
    disclaimer:
      "Research prototype. Not legal advice. Results limited to indexed public sources.",
  },

  searchPanel: {
    queryLabel: "Search statutes",
    queryPlaceholder:
      '"reckless driving"\n"Cal. Veh. Code § 23152(a)"\n"running a red light"',
    citationHint: "Looks like a citation — will look up directly.",
    factorLabel: "Contributing factor",
    factorAll: "All factors",
    factorsError: "Could not load factors from backend.",
    jurisdictionLabel: "Jurisdiction",
    jurisdictionAll: "All states",
    jurisdictionsError: "Could not load jurisdictions from backend.",
    submit: "Search",
    submitting: "Searching…",
  },

  jurisdiction: {
    // Display labels for the two-letter codes the API returns. Unknown codes
    // fall back to the code itself.
    labels: {
      CA: "California",
      FL: "Florida",
      WA: "Washington",
      NY: "New York",
    } as Record<string, string>,
  },

  sidebar: {
    chatsTitle: "Chats",
    bookmarksEmpty:
      "No saved statutes yet. Save from results or the statute viewer.",
    partnership: "EvenUp × OpenClaw hackathon",
  },

  bookmarks: {
    sectionTitle: "Saved statutes",
    addLabel: (citation: string) => `Save ${citation}`,
    removeLabel: (citation: string) => `Remove ${citation} from saved`,
  },

  resultsPanel: {
    enterQuery: "Enter a query on the left to search statutes.",
    searching: "Searching…",
    noResults: (query: string) => `No statutes found for "${query}".`,
    resultCount: (n: number, query: string) =>
      `${n} result${n !== 1 ? "s" : ""} for "${query}"`,
    leginfoLink: "Open on leginfo →",
    col: {
      state: "State",
      citation: "Citation",
      section: "Section",
      division: "Division",
      score: "Score",
      matchedVia: "Match",
      factors: "Factors",
      snippet: "Snippet",
      bookmark: "Save",
    },
  },

  matchedVia: {
    labels: {
      citation: "exact",
      hybrid: "hybrid",
      vector: "semantic",
      keyword: "keyword",
    },
    title: (via: string) => `matched via ${via}`,
  },

  sourceViewer: {
    placeholder: "Select a result to view the full section text.",
    loading: "Loading…",
    notFound: "Statute not found.",
    subdivision: (s: string) => `subd. (${s})`,
    showFullContext: "Show full context",
    contributingFactors: "Contributing factors",
    leginfoLink: "Open on leginfo →",
    source: "Source",
    statutoryText: "Statutory text",
    legislativeHistory: "Legislative history",
    copyCitation: "Copy citation",
    copied: "Copied!",
    crossRefTooltip: "Cross-reference to another statute",
  },

  verification: {
    // Headline labels rendered in the chip under each assistant message.
    statusLabel: {
      clean: "Sources verified",
      unsupported: "Needs review",
      skipped: "No claims to verify",
    } as Record<"clean" | "unsupported" | "skipped", string>,
    // One-line summary line when the chip is collapsed.
    summary: (
      citationsSupported: number,
      citationsTotal: number,
      quotesSupported: number,
      quotesTotal: number,
    ) =>
      `${citationsSupported}/${citationsTotal} citations and ` +
      `${quotesSupported}/${quotesTotal} quotes traced to retrieved sources.`,
    skippedHint:
      "The verifier audits direct citations and quoted text. Nothing in this answer required checking.",
    // Section headers in the expanded panel.
    unsupportedCitationsTitle: "Unsupported citations",
    unsupportedQuotesTitle: "Unverified quotes",
    showDetails: "Show details",
    hideDetails: "Hide details",
    // Tooltips for the badge itself.
    tooltipClean: "Every citation and quoted span maps to retrieved evidence.",
    tooltipUnsupported:
      "At least one citation or quote couldn't be traced to a retrieved source. Review before relying on this answer.",
    tooltipSkipped: "Nothing to verify in this answer.",
    // Live trace strings (SSE).
    trace: {
      running: "Auditing citations and quotes\u2026",
      cleanSummary: "All citations and quotes verified",
      unsupportedSummary: (n: number) =>
        `${n} unsupported claim${n === 1 ? "" : "s"}`,
      skippedSummary: "Nothing to verify",
    },
  },

  themeToggle: {
    ariaLabel: "Color theme",
    optionLabel: {
      light: "Light theme",
      system: "Match system theme",
      dark: "Dark theme",
    } as Record<"light" | "system" | "dark", string>,
  },

  datasetStatus: {
    backendOffline: "Backend offline",
    loading: "Loading...",
    statutesIndexed: (n: number) => `${n.toLocaleString()} statutes indexed`,
    evalBadge: (recall: number) => `recall@5 ${(recall * 100).toFixed(0)}%`,
    evalTooltip: "recall@5 on the released eval set",
    lastEvalTooltip: (date: string) => `last eval ${date}`,
  },
};
