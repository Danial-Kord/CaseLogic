"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { strings } from "@/lib/i18n/en";
import DatasetStatus from "@/components/DatasetStatus";
import ChatSidebar from "@/components/ChatSidebar";
import ChatThread from "@/components/ChatThread";
import { BookmarksProvider } from "@/contexts/BookmarksContext";
import ProfileModal from "@/components/ProfileModal";
import StatuteModal from "@/components/StatuteModal";
import ThemeToggle from "@/components/ThemeToggle";
import type {
  ChatDetail,
  ChatMessage,
  ChatSummary,
  Profile,
  SendMessageOptions,
  StatuteHit,
  ThinkingStep,
} from "@/lib/types";

const EMPTY_PROFILE: Profile = {
  name: "",
  role: "",
  firm: "",
  about: "",
  updated_at: null,
};

export default function ResearchPage() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChat, setActiveChat] = useState<ChatDetail | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modalStatuteId, setModalStatuteId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [profileOpen, setProfileOpen] = useState(false);

  const refreshChats = useCallback(async () => {
    try {
      const res = await api.listChats();
      setChats(res.chats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load chats");
    }
  }, []);

  useEffect(() => {
    refreshChats();
    api.getProfile().then(setProfile).catch(() => {
      /* keep EMPTY_PROFILE if backend isn't reachable */
    });
  }, [refreshChats]);

  async function handleSaveProfile(next: Omit<Profile, "updated_at">) {
    const saved = await api.updateProfile(next);
    setProfile(saved);
  }

  async function handleNewChat() {
    setError(null);
    try {
      const created = await api.createChat();
      setActiveChat(created);
      await refreshChats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create chat");
    }
  }

  async function handleSelectChat(chatId: string) {
    setError(null);
    try {
      const detail = await api.getChat(chatId);
      setActiveChat(detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open chat");
    }
  }

  async function handleDeleteChat(chatId: string) {
    setError(null);
    try {
      await api.deleteChat(chatId);
      if (activeChat?.chat_id === chatId) setActiveChat(null);
      await refreshChats();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete chat");
    }
  }

  async function handleSend(content: string, options: SendMessageOptions) {
    if (!activeChat) return;
    setError(null);

    const optimistic: ChatMessage = {
      id: -Date.now(),
      role: "user",
      content,
      hits: [],
      created_at: new Date().toISOString(),
    };
    setActiveChat((prev) =>
      prev ? { ...prev, messages: [...prev.messages, optimistic] } : prev,
    );
    setThinkingSteps([{ kind: "thinking", label: "Reading your question\u2026" }]);
    setIsSending(true);

    try {
      const res = await api.streamChatMessage(
        activeChat.chat_id,
        { content, web_search_enabled: options.webSearchEnabled },
        (event) => {
          // Translate raw SSE events into ThinkingStep entries the UI
          // can stack. Each tool_start opens a new step; the matching
          // tool_done patches the same step with a summary + done flag.
          setThinkingSteps((prev) => {
            switch (event.type) {
              case "started":
                return prev;
              case "thinking":
                if (event.step === 0) return prev; // already seeded
                return [...prev, { kind: "thinking", label: event.label }];
              case "thought":
                return [...prev, { kind: "thought", text: event.text }];
              case "tool_start":
                return [
                  ...prev,
                  {
                    kind: "tool",
                    name: event.name,
                    label: event.label,
                    done: false,
                  },
                ];
              case "tool_done": {
                // Patch the most recent matching tool_start.
                const idx = [...prev]
                  .reverse()
                  .findIndex(
                    (s) =>
                      s.kind === "tool" && s.name === event.name && !s.done,
                  );
                if (idx === -1) return prev;
                const realIdx = prev.length - 1 - idx;
                const next = prev.slice();
                const target = next[realIdx];
                if (target.kind !== "tool") return prev;
                next[realIdx] = {
                  ...target,
                  summary: event.summary,
                  done: true,
                };
                return next;
              }
              case "drafting":
                return [...prev, { kind: "drafting" }];
              case "verifying":
                return [...prev, { kind: "verifying", done: false }];
              case "verified": {
                // Patch the most recent unfinished verifying step with the
                // verdict + a short summary the trace can render. Falls
                // back to appending a fresh row in the unlikely case the
                // server emitted "verified" without "verifying".
                const idx = [...prev]
                  .reverse()
                  .findIndex((s) => s.kind === "verifying" && !s.done);
                const summary =
                  event.status === "unsupported"
                    ? strings.verification.trace.unsupportedSummary(
                        event.unsupported,
                      )
                    : event.status === "clean"
                      ? strings.verification.trace.cleanSummary
                      : strings.verification.trace.skippedSummary;
                if (idx === -1) {
                  return [
                    ...prev,
                    {
                      kind: "verifying",
                      done: true,
                      status: event.status,
                      summary,
                    },
                  ];
                }
                const realIdx = prev.length - 1 - idx;
                const next = prev.slice();
                const target = next[realIdx];
                if (target.kind !== "verifying") return prev;
                next[realIdx] = {
                  ...target,
                  done: true,
                  status: event.status,
                  summary,
                };
                return next;
              }
              case "final":
              case "error":
                return prev;
            }
          });
        },
      );

      setActiveChat((prev) => {
        if (!prev) return prev;
        const withoutOptimistic = prev.messages.filter(
          (m) => m.id !== optimistic.id,
        );
        return {
          ...prev,
          title: res.chat_title,
          messages: [
            ...withoutOptimistic,
            res.user_message,
            res.assistant_message,
          ],
        };
      });
      await refreshChats();
    } catch (e) {
      setActiveChat((prev) =>
        prev
          ? {
              ...prev,
              messages: prev.messages.filter((m) => m.id !== optimistic.id),
            }
          : prev,
      );
      setError(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setIsSending(false);
      setThinkingSteps([]);
    }
  }

  function handleSelectStatute(hit: StatuteHit) {
    setModalStatuteId(hit.statute_id);
  }

  return (
    <BookmarksProvider>
      <div className="flex h-screen flex-col">
        <header className="flex items-center justify-between border-b border-brand-border bg-brand-surface px-6 py-4">
          <Link href="/" className="flex items-baseline gap-3 group">
            <span className="font-serif text-xl text-brand-primary transition-colors group-hover:text-brand-accent">
              {strings.app.name}
            </span>
            <span className="text-xs text-brand-muted">
              {strings.app.tagline}
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <DatasetStatus />
            <ThemeToggle />
          </div>
        </header>

        <main className="grid flex-1 grid-cols-[18rem_1fr] gap-4 overflow-hidden p-4">
          <ChatSidebar
            chats={chats}
            activeChatId={activeChat?.chat_id ?? null}
            onSelect={handleSelectChat}
            onNew={handleNewChat}
            onDelete={handleDeleteChat}
            profile={profile}
            onEditProfile={() => setProfileOpen(true)}
            onOpenStatute={(id) => setModalStatuteId(id)}
          />
          <div className="flex flex-col gap-2 overflow-hidden">
            {error && (
              <p className="rounded border border-brand-error/30 bg-brand-error/5 px-3 py-2 text-sm text-brand-error">
                {error}
              </p>
            )}
            <ChatThread
              chat={activeChat}
              isSending={isSending}
              thinkingSteps={thinkingSteps}
              onSend={handleSend}
              onSelectStatute={handleSelectStatute}
            />
          </div>
        </main>

        <footer className="border-t border-brand-border bg-brand-surface px-6 py-2 text-center text-xs text-brand-muted">
          {strings.app.disclaimer}
        </footer>

        <StatuteModal
          statuteId={modalStatuteId}
          onClose={() => setModalStatuteId(null)}
        />

        <ProfileModal
          open={profileOpen}
          profile={profile}
          onClose={() => setProfileOpen(false)}
          onSave={handleSaveProfile}
        />
      </div>
    </BookmarksProvider>
  );
}
