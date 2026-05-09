"use client";

// Inline highlighter for statutory text. Marks legal terms-of-art with
// <mark> and cross-references with an accent-colored chip. Shared by:
//   - StatuteText.tsx     — full-text modal view, renders into paragraphs
//   - ResultsPanel snippet — truncated 2-line preview in the results table
//
// Both call into the same regex so the visual treatment of "willful or
// wanton disregard" or "Cal. Veh. Code § 23103(a)" is identical wherever
// statute text appears.

import type { ReactNode } from "react";
import { strings } from "@/lib/i18n/en";

// Legal terms-of-art a PI lawyer scans for. Order matters: longer phrases
// must come first so regex alternation prefers them over their shorter
// substrings (e.g. "willful or wanton" beats "willful"). Case-insensitive.
export const LEGAL_TERMS: string[] = [
  "willful or wanton disregard",
  "willful or wanton",
  "willful or wantonly",
  "due regard for the safety",
  "due regard",
  "reasonable care",
  "ordinary care",
  "due care",
  "no person shall",
  "no person may",
  "no driver shall",
  "is guilty of",
  "guilty of",
  "punishable by",
  "shall be liable",
  "shall not",
  "intent to",
  "willfully",
  "wantonly",
  "recklessly",
  "knowingly",
  "intentionally",
  "negligently",
  "willful",
  "wanton",
  "reckless",
  "negligence",
  "negligent",
  "prudent",
  "felony",
  "misdemeanor",
];

// Statute cross-references: jurisdiction-specific full citations and bare
// section references. The frontend doesn't currently link these (would need
// a multi-jurisdiction slug parser), but visually marking them lets a
// reader pick out the network of references at a glance.
export const CROSS_REF_PATTERN =
  "(?:Cal\\.?\\s*Veh\\.?\\s*Code|Fla\\.?\\s*Stat\\.?|N\\.?Y\\.?\\s*Veh\\.?\\s*&\\s*Traf\\.?\\s*Law|RCW)\\s*\u00a7?\\s*\\d[\\d.]*(?:\\([a-z0-9]+\\))*" +
  "|RCW\\s+\\d+\\.\\d+(?:\\.\\d+)*" +
  "|\u00a7\\s*\\d[\\d.]*(?:\\([a-z0-9]+\\))*";

let _highlightRe: RegExp | null = null;

function getHighlightRegex(): RegExp {
  if (_highlightRe) return _highlightRe;
  const escaped = LEGAL_TERMS.map((t) =>
    t.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"),
  ).join("|");
  _highlightRe = new RegExp(
    `(?<term>\\b(?:${escaped})\\b)|(?<ref>${CROSS_REF_PATTERN})`,
    "gi",
  );
  return _highlightRe;
}

/**
 * Walk `text` and return an array of ReactNodes where every legal term
 * is wrapped in <mark> and every statute cross-reference is wrapped in a
 * styled <span>. Plain text in between is returned as-is. Suitable for
 * placing inside any block container (`<p>`, `<span>`, `<td>`).
 */
export function highlightLegal(text: string): ReactNode[] {
  if (!text) return [];

  const regex = getHighlightRegex();
  // Reset state — we share one global regex instance across calls.
  regex.lastIndex = 0;

  const out: ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      out.push(text.slice(lastIdx, match.index));
    }
    const groups = match.groups ?? {};
    const key = `m${match.index}`;
    if (groups.term) {
      out.push(
        <mark
          key={key}
          className="rounded-sm bg-yellow-200/70 px-0.5 text-brand-primary decoration-yellow-500/60"
        >
          {match[0]}
        </mark>,
      );
    } else if (groups.ref) {
      out.push(
        <span
          key={key}
          title={strings.sourceViewer.crossRefTooltip}
          className="mx-0.5 inline-block rounded-md border border-brand-accent/30 bg-brand-accent/10 px-1.5 py-0 font-mono text-[12.5px] font-medium text-brand-accent"
        >
          {match[0]}
        </span>,
      );
    }
    lastIdx = match.index + match[0].length;
    // Defensive: avoid infinite loop on zero-width matches.
    if (match[0].length === 0) regex.lastIndex++;
  }

  if (lastIdx < text.length) {
    out.push(text.slice(lastIdx));
  }

  return out;
}
