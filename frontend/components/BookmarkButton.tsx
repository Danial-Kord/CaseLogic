"use client";

import { useBookmarks } from "@/contexts/BookmarksContext";
import { strings } from "@/lib/i18n/en";
import type { StatuteHit } from "@/lib/types";

interface BookmarkButtonProps {
  hit: StatuteHit;
  size?: "sm" | "md";
  className?: string;
}

export default function BookmarkButton({
  hit,
  size = "sm",
  className = "",
}: BookmarkButtonProps) {
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const saved = isBookmarked(hit.statute_id);
  const label = saved
    ? strings.bookmarks.removeLabel(hit.universal_citation)
    : strings.bookmarks.addLabel(hit.universal_citation);
  const iconClass = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={saved}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleBookmark(hit);
      }}
      className={`shrink-0 rounded-md p-1 text-brand-muted transition-colors hover:bg-brand-bg hover:text-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent ${
        saved ? "text-brand-accent" : ""
      } ${className}`}
    >
      {saved ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={iconClass}
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M4.25 3.75C4.25 2.783 5.034 2 6 2h8c.966 0 1.75.783 1.75 1.75v15.5a.75.75 0 0 1-1.218.586L12 16.56l-3.532 2.776A.75.75 0 0 1 7.25 19.25V3.75Z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className={iconClass}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
          />
        </svg>
      )}
    </button>
  );
}
