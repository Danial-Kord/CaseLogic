"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { strings } from "@/lib/i18n/en";
import DatasetStatus from "@/components/DatasetStatus";
import ChatSidebar from "@/components/ChatSidebar";
import ChatThread from "@/components/ChatThread";
import StatuteModal from "@/components/StatuteModal";
import type {
  ChatDetail,
  ChatMessage,
  ChatSummary,
  StatuteHit,
} from "@/lib/types";

export default function HomePage() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChat, setActiveChat] = useState<ChatDetail | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalStatuteId, setModalStatuteId] = useState<string | null>(null);

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
  }, [refreshChats]);

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

  async function handleSend(content: string) {
    if (!activeChat) return;
    setError(null);

    // Optimistic user-message echo so the UI reacts instantly.
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
    setIsSending(true);

    try {
      const res = await api.sendChatMessage(activeChat.chat_id, { content });
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
      // Roll back the optimistic message.
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
    }
  }

  function handleSelectStatute(hit: StatuteHit) {
    setModalStatuteId(hit.statute_id);
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-brand-border bg-brand-surface px-6 py-4">
        <div className="flex items-baseline gap-3">
          <span className="font-serif text-xl text-brand-primary">
            {strings.app.name}
          </span>
          <span className="text-xs text-brand-muted">
            {strings.app.tagline}
          </span>
        </div>
        <DatasetStatus />
      </header>

      <main className="grid flex-1 grid-cols-[18rem_1fr] gap-4 overflow-hidden p-4">
        <ChatSidebar
          chats={chats}
          activeChatId={activeChat?.chat_id ?? null}
          onSelect={handleSelectChat}
          onNew={handleNewChat}
          onDelete={handleDeleteChat}
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
    </div>
  );
}
