"use client";

import { useBookmarks } from "@/contexts/BookmarksContext";
import { strings } from "@/lib/i18n/en";
import type { ChatSummary, Profile } from "@/lib/types";
import ProfileCard from "./ProfileCard";

interface ChatSidebarProps {
  chats: ChatSummary[];
  activeChatId: string | null;
  onSelect: (chatId: string) => void;
  onNew: () => void;
  onDelete: (chatId: string) => void;
  profile: Profile;
  onEditProfile: () => void;
  /** Open statute detail modal for a bookmarked statute id. */
  onOpenStatute: (statuteId: string) => void;
}

export default function ChatSidebar({
  chats,
  activeChatId,
  onSelect,
  onNew,
  onDelete,
  profile,
  onEditProfile,
  onOpenStatute,
}: ChatSidebarProps) {
  const { bookmarks, removeBookmark } = useBookmarks();
  return (
    <aside className="flex flex-col h-full overflow-hidden rounded-lg border border-brand-border bg-brand-surface">
      <ProfileCard profile={profile} onEdit={onEditProfile} />
      <div className="border-b border-brand-border p-3">
        <button
          type="button"
          onClick={onNew}
          className="w-full rounded-full bg-brand-accent px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-accent-hover"
        >
          + New chat
        </button>
      </div>

      {bookmarks.length > 0 && (
        <div className="border-b border-brand-border px-2 py-3">
          <p className="px-2 text-[11px] font-medium uppercase tracking-wide text-brand-muted">
            {strings.bookmarks.sectionTitle}
          </p>
          <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto">
            {bookmarks.map((b) => (
              <li key={b.statute_id}>
                <div className="group flex items-start gap-1 rounded-md px-1 py-1 hover:bg-brand-bg">
                  <button
                    type="button"
                    onClick={() => onOpenStatute(b.statute_id)}
                    className="min-w-0 flex-1 rounded px-1 text-left"
                  >
                    <span className="truncate font-mono text-xs text-brand-secondary hover:text-brand-primary">
                      {b.universal_citation}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={strings.bookmarks.removeLabel(
                      b.universal_citation,
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeBookmark(b.statute_id);
                    }}
                    className="shrink-0 rounded p-1 text-brand-muted opacity-0 transition-opacity hover:text-brand-error group-hover:opacity-100"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-3.5 w-3.5"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4.28 3.22a.75.75 0 0 0-1.06 1.06L8.94 10l-5.72 5.72a.75.75 0 1 0 1.06 1.06L10 11.06l5.72 5.72a.75.75 0 1 0 1.06-1.06L11.06 10l5.72-5.72a.75.75 0 0 0-1.06-1.06L10 8.94 4.28 3.22Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {chats.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-brand-muted">
            No chats yet. Start one above.
          </p>
        )}
        <ul className="space-y-1">
          {chats.map((c) => {
            const isActive = c.chat_id === activeChatId;
            return (
              <li key={c.chat_id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(c.chat_id)}
                  onKeyDown={(e) => e.key === "Enter" && onSelect(c.chat_id)}
                  className={`group flex cursor-pointer items-start justify-between gap-2 rounded-md px-2 py-2 transition-colors ${
                    isActive
                      ? "bg-brand-accent/10"
                      : "hover:bg-brand-bg"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm ${
                        isActive
                          ? "font-medium text-brand-primary"
                          : "text-brand-secondary"
                      }`}
                    >
                      {c.title}
                    </p>
                    <p className="text-[11px] text-brand-muted">
                      {formatRelative(c.updated_at)} · {c.message_count} msg
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Delete chat"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete "${c.title}"?`)) onDelete(c.chat_id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-brand-muted hover:text-brand-error transition-opacity"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="h-4 w-4"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4.28 3.22a.75.75 0 0 0-1.06 1.06L8.94 10l-5.72 5.72a.75.75 0 1 0 1.06 1.06L10 11.06l5.72 5.72a.75.75 0 1 0 1.06-1.06L11.06 10l5.72-5.72a.75.75 0 0 0-1.06-1.06L10 8.94 4.28 3.22Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}

// Lightweight relative-time without pulling in date-fns.
function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString();
}
