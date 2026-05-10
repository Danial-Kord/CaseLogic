"use client";

import { strings } from "@/lib/i18n/en";
import { highlightLegal } from "./highlightLegal";

// "(1)" / "(a)" / "(iv)" prefix at the start of a paragraph — pulled out
// and rendered as a sidebar label.
const SUBSECTION_PREFIX_RE = /^\s*\(\s*([a-z0-9]{1,4}|[ivx]{1,4})\s*\)\s+/i;

// Inline subsection break: "... text. (2) Next subsection..." — split on it
// so each subsection becomes its own paragraph. We require an uppercase or
// "[" right after the marker to avoid splitting on inline references like
// "as defined in (a)".
const SUBSECTION_SPLIT_RE = /(?=\s\(\s*[a-z0-9]{1,4}\s*\)\s+(?:[A-Z\[\u201C"]))/g;

// Trailing legislative-history footer like "[ 1965 ex.s. c 155 s 12 .]"
// followed by optional notes. We anchor on the LAST bracketed group that
// contains a 4-digit year — anything from there to EOF is the footer.
const HISTORY_FOOTER_RE = /(\[[^\[\]]*\b(?:18|19|20)\d{2}\b[^\[\]]*\][\s\S]*)$/;

interface StatuteTextProps {
  text: string;
  className?: string;
  /**
   * If provided, cross-references inside the rendered paragraphs become
   * clickable — the callback receives the resolved statute_id slug.
   * Self-references (slug === currentStatuteId) stay non-clickable.
   */
  onCiteClick?: (statuteId: string) => void;
  /**
   * Used to resolve bare "§ N" references when `onCiteClick` is set.
   * Pass the surrounding statute's jurisdiction.
   */
  jurisdiction?: string | null;
  /** Slug of the statute being rendered — drops self-reference chips. */
  currentStatuteId?: string | null;
}

export default function StatuteText({
  text,
  className = "",
  onCiteClick,
  jurisdiction,
  currentStatuteId,
}: StatuteTextProps) {
  const { body, history } = stripHistoryFooter(normalize(text));
  const paragraphs = splitParagraphs(body);

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {paragraphs.map((para, i) => (
        <Paragraph
          key={i}
          text={para}
          onCiteClick={onCiteClick}
          jurisdiction={jurisdiction}
          currentStatuteId={currentStatuteId}
        />
      ))}
      {history && <HistoryFooter text={history} />}
    </div>
  );
}

interface ParagraphProps {
  text: string;
  onCiteClick?: (statuteId: string) => void;
  jurisdiction?: string | null;
  currentStatuteId?: string | null;
}

function Paragraph({
  text,
  onCiteClick,
  jurisdiction,
  currentStatuteId,
}: ParagraphProps) {
  const sub = text.match(SUBSECTION_PREFIX_RE);
  const label = sub?.[1];
  const body = sub ? text.slice(sub[0].length) : text;

  return (
    <p className="flex gap-3 text-[15px] leading-relaxed text-brand-secondary">
      {label ? (
        <span
          aria-hidden="true"
          className="mt-0.5 inline-block min-w-[1.75rem] flex-shrink-0 font-mono text-[13px] font-semibold uppercase text-brand-accent"
        >
          ({label})
        </span>
      ) : (
        <span aria-hidden="true" className="min-w-[1.75rem] flex-shrink-0" />
      )}
      <span className="flex-1">
        {highlightLegal(body, {
          onCiteClick,
          defaultJurisdiction: jurisdiction ?? null,
          currentStatuteId: currentStatuteId ?? null,
        })}
      </span>
    </p>
  );
}

function HistoryFooter({ text }: { text: string }) {
  return (
    <div className="mt-3 rounded-lg border border-brand-border bg-brand-bg/60 px-3 py-2 text-[11px] text-brand-muted">
      <p className="mb-1 font-medium uppercase tracking-wide">
        {strings.sourceViewer.legislativeHistory}
      </p>
      <p className="whitespace-pre-wrap break-words font-mono leading-relaxed">
        {text}
      </p>
    </div>
  );
}

// ---------------------------------------------------------- text utilities

function normalize(text: string): string {
  // Some adapters pull leginfo with weird non-breaking spaces and stray
  // \r characters. Normalize so the splitting regex behaves predictably.
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();
}

function splitParagraphs(text: string): string[] {
  // Step 1: split on hard paragraph breaks first.
  const blocks = text.split(/\n{2,}/g).map((s) => s.trim()).filter(Boolean);

  // Step 2: within each block, split before inline subsection markers like
  // " (1) " so each subsection becomes its own line.
  const out: string[] = [];
  for (const block of blocks) {
    const parts = block.split(SUBSECTION_SPLIT_RE);
    for (const p of parts) {
      const t = p.trim();
      if (t) out.push(t);
    }
  }
  return out.length ? out : [text];
}

function stripHistoryFooter(
  text: string,
): { body: string; history: string | null } {
  const match = text.match(HISTORY_FOOTER_RE);
  if (!match || match.index === undefined || match.index <= 0) {
    return { body: text, history: null };
  }
  return {
    body: text.slice(0, match.index).trim(),
    history: match[1].trim(),
  };
}

