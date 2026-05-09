"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatDetail, ChatMessage, StatuteHit } from "@/lib/types";
import ResultsPanel from "./ResultsPanel";

interface ChatThreadProps {
  chat: ChatDetail | null;
  isSending: boolean;
  onSend: (content: string) => void;
  onSelectStatute: (hit: StatuteHit) => void;
}

export default function ChatThread({
  chat,
  isSending,
  onSend,
  onSelectStatute,
}: ChatThreadProps) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.messages.length, isSending]);

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isSending || !chat) return;
    onSend(trimmed);
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
          {isSending && <PendingAssistant />}
          <div ref={endRef} />
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex gap-3 border-t border-brand-border bg-brand-bg px-6 py-4"
      >
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
          {isSending ? "…" : "Send"}
        </button>
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
      <div className="max-w-none text-sm leading-relaxed text-brand-secondary">
        <FormattedContent content={message.content} />
      </div>

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

function PendingAssistant() {
  return (
    <div className="flex items-center gap-2 text-sm text-brand-muted">
      <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-brand-accent" />
      <span>Searching statutes & drafting answer…</span>
    </div>
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

// Light markdown-ish renderer for assistant prose: bold, links, paragraphs.
function FormattedContent({ content }: { content: string }) {
  const blocks = content.split(/\n\n+/);
  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        return (
          <p key={bi} className="mb-3 last:mb-0">
            {lines.map((line, li) => (
              <span key={li}>
                <FormatInline text={line} />
                {li < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}

function FormatInline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-brand-primary">
              {part.slice(2, -2)}
            </strong>
          );
        }
        const linkMatch = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
        if (linkMatch) {
          const [, label, url] = linkMatch;
          return (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-accent hover:underline"
            >
              {label}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
