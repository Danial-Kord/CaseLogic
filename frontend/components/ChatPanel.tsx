"use client";

import { useState, useRef, useEffect, FormEvent, KeyboardEvent } from "react";
import type { Message } from "@/lib/types";

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

interface ChatPanelProps {
  onSendMessage: (query: string) => Promise<string>;
}

export default function ChatPanel({ onSendMessage }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();
    const query = input.trim();
    if (!query || isLoading) return;

    const userMessage: Message = {
      id: generateId(),
      role: "user",
      content: query,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Add placeholder assistant message
    const assistantId = generateId();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isLoading: true,
      },
    ]);

    try {
      const response = await onSendMessage(query);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: response, isLoading: false }
            : m
        )
      );
    } catch (error) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content:
                  "Sorry, something went wrong. Please check if the backend is running.",
                isLoading: false,
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-brand-muted">
            <div className="text-4xl mb-4">?</div>
            <p className="text-lg font-medium">Ask a legal research question</p>
            <p className="text-sm mt-2">
              Search California Vehicle Code statutes by citation or topic
            </p>
            <div className="mt-6 space-y-2 text-sm">
              <p className="text-brand-secondary">Try asking:</p>
              <button
                onClick={() => setInput("Cal. Veh. Code § 23152(a)")}
                className="block w-full text-left px-3 py-2 rounded-lg bg-brand-bg hover:bg-brand-border transition-colors"
              >
                "Cal. Veh. Code § 23152(a)"
              </button>
              <button
                onClick={() => setInput("What are the laws about reckless driving?")}
                className="block w-full text-left px-3 py-2 rounded-lg bg-brand-bg hover:bg-brand-border transition-colors"
              >
                "What are the laws about reckless driving?"
              </button>
              <button
                onClick={() => setInput("improper passing statutes")}
                className="block w-full text-left px-3 py-2 rounded-lg bg-brand-bg hover:bg-brand-border transition-colors"
              >
                "improper passing statutes"
              </button>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-brand-border bg-brand-surface p-4">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about statutes, citations, or contributing factors..."
            className="flex-1 resize-none rounded-lg border border-brand-border bg-brand-bg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent focus:border-transparent"
            rows={1}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 rounded-lg bg-brand-accent text-white font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              "Send"
            )}
          </button>
        </form>
        <p className="text-xs text-brand-muted mt-2 text-center">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? "bg-brand-accent text-white"
            : "bg-brand-bg border border-brand-border"
        }`}
      >
        {message.isLoading ? (
          <div className="flex items-center gap-2 text-brand-muted">
            <span className="inline-block w-4 h-4 border-2 border-brand-muted border-t-transparent rounded-full animate-spin" />
            <span>Searching...</span>
          </div>
        ) : (
          <div className="text-sm whitespace-pre-wrap">
            <FormattedContent content={message.content} />
          </div>
        )}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 pt-3 border-t border-brand-border">
            <p className="text-xs font-medium text-brand-muted mb-2">Sources:</p>
            <div className="space-y-1">
              {message.sources.map((source, i) => (
                <a
                  key={i}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-brand-accent hover:underline"
                >
                  {source.title}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FormattedContent({ content }: { content: string }) {
  // Basic markdown-like formatting
  const lines = content.split("\n");

  return (
    <>
      {lines.map((line, i) => {
        // Horizontal rule: ---
        if (line.trim() === "---") {
          return <hr key={i} className="my-3 border-brand-border" />;
        }

        // Bold text: **text** and links: [text](url)
        const parts = line.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
        const formatted = parts.map((part, j) => {
          if (part.startsWith("**") && part.endsWith("**")) {
            return (
              <strong key={j} className="font-semibold">
                {part.slice(2, -2)}
              </strong>
            );
          }
          const linkMatch = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
          if (linkMatch) {
            const [, text, url] = linkMatch;
            return (
              <a
                key={j}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-accent hover:underline"
              >
                {text}
              </a>
            );
          }
          return part;
        });

        return (
          <span key={i}>
            {formatted}
            {i < lines.length - 1 && <br />}
          </span>
        );
      })}
    </>
  );
}
