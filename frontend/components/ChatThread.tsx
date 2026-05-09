"use client";

import { useEffect, useRef, useState } from "react";
import { strings } from "@/lib/i18n/en";
import type {
  ChatDetail,
  ChatMessage,
  SendMessageOptions,
  StatuteHit,
  ThinkingStep,
} from "@/lib/types";
import MarkdownContent from "./MarkdownContent";
import ResultsPanel from "./ResultsPanel";
import VerificationPanel from "./VerificationPanel";

const WEB_SEARCH_PREF_KEY = "caselogic-web-search-enabled";

interface ChatThreadProps {
  chat: ChatDetail | null;
  isSending: boolean;
  thinkingSteps: ThinkingStep[];
  onSend: (content: string, options: SendMessageOptions) => void;
  onSelectStatute: (hit: StatuteHit) => void;
}

export default function ChatThread({
  chat,
  isSending,
  thinkingSteps,
  onSend,
  onSelectStatute,
}: ChatThreadProps) {
  const [input, setInput] = useState("");
  // Default ON: web search is the user's safety net when the local corpus
  // doesn't have the statute they're after. Persisted across reloads so a
  // privacy-conscious user only has to flip it off once.
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

  // Load persisted preference once on mount. Safe in SSR — guarded by the
  // `typeof window` check.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(WEB_SEARCH_PREF_KEY);
      if (stored === "false") setWebSearchEnabled(false);
      else if (stored === "true") setWebSearchEnabled(true);
    } catch {
      /* localStorage may be disabled in some contexts — fall through */
    }
  }, []);

  function toggleWebSearch() {
    setWebSearchEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(WEB_SEARCH_PREF_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.messages.length, isSending, thinkingSteps.length]);

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending || !chat) return;
    onSend(trimmed, { webSearchEnabled });
    setInput("");
  }

  if (!chat) {
    return (
      <section className="flex flex-1 items-center justify-center rounded-lg border border-brand-border bg-brand-surface">
        <div className="text-center">
          <h2 className="font-serif text-2xl text-brand-primary">
            Start a new chat
          </h2>
          <p className="mt-2 text-sm text-brand-muted">
            Pick a chat on the left, or click <em>+ New chat</em> to begin.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-1 flex-col overflow-hidden rounded-lg border border-brand-border bg-brand-surface">
      <header className="border-b border-brand-border px-6 py-3">
        <h2 className="font-serif text-lg text-brand-primary truncate">
          {chat.title}
        </h2>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {chat.messages.length === 0 && (
          <EmptyState onPick={(s) => setInput(s)} />
        )}

        <div className="space-y-6">
          {chat.messages.map((m, i) => (
            <MessageBubble
              key={`${m.id}-${i}`}
              message={m}
              userQuery={
                m.role === "assistant"
                  ? chat.messages[i - 1]?.content ?? ""
                  : ""
              }
              onSelectStatute={onSelectStatute}
            />
          ))}
          {isSending && <ThinkingTrace steps={thinkingSteps} />}
          <div ref={endRef} />
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-2 border-t border-brand-border bg-brand-bg px-6 py-4"
      >
        <div className="flex gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Ask about CA Vehicle Code statutes, citations, or fact patterns..."
            rows={1}
            disabled={isSending}
            className="flex-1 resize-none rounded-lg border border-brand-border bg-brand-surface px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={isSending || !input.trim()}
            className="rounded-full bg-brand-accent px-6 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-accent-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-brand-accent"
          >
            {isSending ? "\u2026" : "Send"}
          </button>
        </div>
        <div className="flex items-center justify-start">
          <WebSearchToggle
            enabled={webSearchEnabled}
            disabled={isSending}
            onToggle={toggleWebSearch}
          />
        </div>
      </form>
    </section>
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
  userQuery: string;
  onSelectStatute: (hit: StatuteHit) => void;
}

function MessageBubble({
  message,
  userQuery,
  onSelectStatute,
}: MessageBubbleProps) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl bg-brand-accent px-4 py-2 text-sm text-white whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="max-w-none text-brand-secondary">
        <MarkdownContent content={message.content} />
      </div>

      {message.verification && (
        <VerificationPanel report={message.verification} />
      )}

      {message.hits.length > 0 && (
        <ResultsPanel
          results={message.hits}
          isLoading={false}
          query={userQuery}
          selectedStatuteId={undefined}
          onSelect={onSelectStatute}
        />
      )}
    </div>
  );
}

// Live trace of what the agent is doing this turn — replaces the old
// static "Searching…" placeholder. Each entry corresponds to one event
// from the SSE stream in `lib/api.ts#streamChatMessage`.
function ThinkingTrace({ steps }: { steps: ThinkingStep[] }) {
  // While we haven't received any events yet (initial moment between
  // `setIsSending(true)` and the first frame), show a generic placeholder
  // so the UI doesn't flash empty.
  if (steps.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-brand-muted">
        <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-brand-accent" />
        <span>Thinking…</span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-brand-border bg-brand-bg/40 px-4 py-3">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-brand-muted">
        Thinking
      </p>
      <ul className="space-y-1.5">
        {steps.map((step, i) => (
          <ThinkingStepRow key={i} step={step} isLast={i === steps.length - 1} />
        ))}
      </ul>
    </div>
  );
}

function ThinkingStepRow({
  step,
  isLast,
}: {
  step: ThinkingStep;
  isLast: boolean;
}) {
  const indicator = renderIndicator(step, isLast);

  if (step.kind === "thought") {
    return (
      <li className="flex items-start gap-2 text-sm">
        {indicator}
        <span className="italic text-brand-muted">{step.text}</span>
      </li>
    );
  }

  if (step.kind === "tool") {
    return (
      <li className="flex items-start gap-2 text-sm">
        {indicator}
        <div className="flex-1">
          <p className="text-brand-secondary">{step.label}</p>
          {step.summary && (
            <p className="text-xs text-brand-muted">{step.summary}</p>
          )}
        </div>
      </li>
    );
  }

  if (step.kind === "drafting") {
    return (
      <li className="flex items-start gap-2 text-sm">
        {indicator}
        <span className="text-brand-secondary">Drafting answer…</span>
      </li>
    );
  }

  if (step.kind === "verifying") {
    return (
      <li className="flex items-start gap-2 text-sm">
        {indicator}
        <span className="text-brand-secondary">
          {step.done && step.summary
            ? step.summary
            : strings.verification.trace.running}
        </span>
      </li>
    );
  }

  // thinking
  return (
    <li className="flex items-start gap-2 text-sm">
      {indicator}
      <span className="text-brand-secondary">{step.label}</span>
    </li>
  );
}

function renderIndicator(step: ThinkingStep, isLast: boolean) {
  // For tool + verifying steps, indicator depends on status; for everything
  // else, the last entry shows a spinner and earlier entries show a dot.
  if (step.kind === "tool") {
    if (step.done) {
      return (
        <span
          aria-hidden="true"
          className="mt-1 inline-block h-2 w-2 flex-shrink-0 rounded-full bg-brand-accent"
        />
      );
    }
    return (
      <span
        aria-hidden="true"
        className="mt-0.5 inline-block h-3 w-3 flex-shrink-0 animate-spin rounded-full border-2 border-brand-accent border-t-transparent"
      />
    );
  }

  if (step.kind === "verifying") {
    if (!step.done) {
      return (
        <span
          aria-hidden="true"
          className="mt-0.5 inline-block h-3 w-3 flex-shrink-0 animate-spin rounded-full border-2 border-brand-accent border-t-transparent"
        />
      );
    }
    // Color the dot once we know the verdict — green for clean, amber for
    // unsupported, neutral for skipped — so the trace doubles as a stable
    // mini-summary even after the assistant message renders below.
    const color =
      step.status === "unsupported"
        ? "bg-amber-500"
        : step.status === "clean"
          ? "bg-emerald-500"
          : "bg-brand-muted";
    return (
      <span
        aria-hidden="true"
        className={`mt-1 inline-block h-2 w-2 flex-shrink-0 rounded-full ${color}`}
      />
    );
  }

  if (isLast) {
    return (
      <span
        aria-hidden="true"
        className="mt-0.5 inline-block h-3 w-3 flex-shrink-0 animate-spin rounded-full border-2 border-brand-accent border-t-transparent"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="mt-1 inline-block h-2 w-2 flex-shrink-0 rounded-full bg-brand-accent"
    />
  );
}

interface WebSearchToggleProps {
  enabled: boolean;
  disabled: boolean;
  onToggle: () => void;
}

/**
 * Pill-shaped switch for the "let the agent reach the public web this turn"
 * preference. Rendered just below the textarea. Shows a globe glyph and an
 * inline status word so the state is readable without parsing the toggle's
 * fill color (also helpful for users in light/dark mode and accessibility).
 */
function WebSearchToggle({ enabled, disabled, onToggle }: WebSearchToggleProps) {
  const label = enabled ? "Web search: on" : "Web search: off";
  const help = enabled
    ? "Agent may consult whitelisted public sources."
    : "Agent stays inside the local CA Vehicle Code corpus.";
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      title={help}
      className={`group inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        enabled
          ? "border-brand-accent/40 bg-brand-accent/10 text-brand-accent hover:bg-brand-accent/15"
          : "border-brand-border bg-brand-surface text-brand-muted hover:text-brand-secondary"
      }`}
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="8" cy="8" r="6.25" />
        <path d="M1.75 8h12.5" />
        <path d="M8 1.75c1.9 2.1 2.9 4.2 2.9 6.25S9.9 12.15 8 14.25" />
        <path d="M8 1.75c-1.9 2.1-2.9 4.2-2.9 6.25S6.1 12.15 8 14.25" />
      </svg>
      <span>{label}</span>
      <span
        aria-hidden="true"
        className={`relative inline-flex h-3.5 w-7 items-center rounded-full transition-colors ${
          enabled ? "bg-brand-accent" : "bg-brand-border"
        }`}
      >
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-transform ${
            enabled ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

function EmptyState({ onPick }: { onPick: (s: string) => void }) {
  const samples = [
    "What are the laws about reckless driving?",
    "Cal. Veh. Code § 23152(a)",
    "Improper passing on the right",
  ];
  return (
    <div className="flex h-full flex-col items-center justify-center pb-8">
      <h3 className="font-serif text-xl text-brand-primary">
        Ask a research question
      </h3>
      <p className="mt-2 max-w-md text-center text-sm text-brand-muted">
        Source-grounded answers from the California Vehicle Code. Every claim
        cites a real public statute.
      </p>
      <div className="mt-6 flex flex-col gap-2">
        {samples.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-full border border-brand-border bg-brand-surface px-4 py-2 text-sm text-brand-secondary transition-colors hover:border-brand-accent hover:text-brand-primary"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

