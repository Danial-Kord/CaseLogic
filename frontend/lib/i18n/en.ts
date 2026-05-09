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
    submit: "Search",
    submitting: "Searching…",
  },

  resultsPanel: {
    enterQuery: "Enter a query on the left to search statutes.",
    searching: "Searching…",
    noResults: (query: string) => `No statutes found for "${query}".`,
    resultCount: (n: number, query: string) =>
      `${n} result${n !== 1 ? "s" : ""} for "${query}"`,
    leginfoLink: "Open on leginfo →",
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
  },

  datasetStatus: {
    backendOffline: "Backend offline",
    loading: "Loading...",
    statutesIndexed: (n: number) => `${n.toLocaleString()} statutes indexed`,
    evalBadge: (recall: number) => `eval r@5: ${recall.toFixed(2)}`,
    evalTooltip: "recall@5 on the released eval set",
    lastEvalTooltip: (date: string) => `last eval ${date}`,
  },
};
