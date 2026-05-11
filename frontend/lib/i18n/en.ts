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
      "Source-grounded personal-injury legal research. Answers backed by public case law.",
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
    partnership: "CaseLogic",
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
    // Surfaced when the cross-ref is clickable (we resolved it to a known
    // slug). We swap the static tooltip out for an action-flavored one so
    // the cursor change is reinforced verbally for screen-reader users.
    crossRefClickable: "Open this statute",
    crossRefAria: (citation: string) => `Open ${citation}`,
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

  planning: {
    nav: {
      research: "Research",
      plans: "Plans",
    },
    statusLabel: {
      running: "Running",
      done: "Done",
      error: "Error",
    } as Record<"running" | "done" | "error", string>,
    sectionKind: {
      related_cases: "Step 1",
      contacts: "Step 2",
      brief: "Step 3",
    } as Record<"related_cases" | "contacts" | "brief", string>,
    sectionTitle: {
      related_cases: "Related cases & statutes",
      contacts: "People to reach out to",
      brief: "Recommended brief outline",
    } as Record<"related_cases" | "contacts" | "brief", string>,
    sidebar: {
      title: "Planning workspace",
      subtitle: "Generate a starter plan from an incident description.",
      newCta: "+ New plan",
      historyTitle: "History",
      empty: "No plans yet. Click \u201cNew plan\u201d to start.",
      deleteAria: (title: string) => `Delete plan \u201c${title}\u201d`,
      deleteConfirm: (title: string) => `Delete \u201c${title}\u201d?`,
    },
    composer: {
      headline: "Sketch a research plan",
      subhead:
        "Describe the incident in plain language. The planner retrieves CA Vehicle Code statutes, then drafts related cases, role-based contacts, and a brief outline you can adapt.",
      label: "Incident description",
      placeholder:
        "e.g. Hit-and-run at intersection \u2014 client (pedestrian) suffered fractured tibia after opposing driver ran a red light at high speed.",
      submit: "Generate plan",
      submitting: "Generating\u2026",
      disclaimer: "Research prototype \u2014 not legal advice.",
      samplesTitle: "Try a sample",
    },
    workspace: {
      incidentLabel: "Incident",
      disclaimer:
        "Generated content is a research draft. Verify every citation against the linked source before relying on it.",
    },
    section: {
      waiting: "Waiting for the previous step to complete\u2026",
      running: "Drafting this section\u2026",
      errored: "This section couldn't be generated. Try a new plan.",
      citedTitle: "Cited statutes",
      statusPending: "Pending",
      statusRunning: "Running",
      statusDone: "Done",
      statusError: "Error",
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
