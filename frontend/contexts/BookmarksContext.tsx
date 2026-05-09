"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  BOOKMARKS_STORAGE_KEY,
  loadBookmarksFromStorage,
  saveBookmarksToStorage,
} from "@/lib/bookmarksStorage";
import type { StatuteHit } from "@/lib/types";

export interface BookmarksContextValue {
  bookmarks: StatuteHit[];
  isBookmarked: (statuteId: string) => boolean;
  toggleBookmark: (hit: StatuteHit) => void;
  removeBookmark: (statuteId: string) => void;
}

const noop: BookmarksContextValue = {
  bookmarks: [],
  isBookmarked: () => false,
  toggleBookmark: () => {},
  removeBookmark: () => {},
};

const BookmarksContext = createContext<BookmarksContextValue>(noop);

export function BookmarksProvider({ children }: { children: React.ReactNode }) {
  const [bookmarks, setBookmarks] = useState<StatuteHit[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setBookmarks(loadBookmarksFromStorage());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveBookmarksToStorage(bookmarks);
  }, [bookmarks, hydrated]);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== null && e.key !== BOOKMARKS_STORAGE_KEY) return;
      setBookmarks(loadBookmarksFromStorage());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const isBookmarked = useCallback(
    (statuteId: string) => bookmarks.some((b) => b.statute_id === statuteId),
    [bookmarks],
  );

  const toggleBookmark = useCallback((hit: StatuteHit) => {
    setBookmarks((prev) => {
      const exists = prev.some((b) => b.statute_id === hit.statute_id);
      if (exists) {
        return prev.filter((b) => b.statute_id !== hit.statute_id);
      }
      const next = prev.filter((b) => b.statute_id !== hit.statute_id);
      return [hit, ...next];
    });
  }, []);

  const removeBookmark = useCallback((statuteId: string) => {
    setBookmarks((prev) => prev.filter((b) => b.statute_id !== statuteId));
  }, []);

  const value = useMemo(
    () => ({
      bookmarks,
      isBookmarked,
      toggleBookmark,
      removeBookmark,
    }),
    [bookmarks, isBookmarked, toggleBookmark, removeBookmark],
  );

  return (
    <BookmarksContext.Provider value={value}>{children}</BookmarksContext.Provider>
  );
}

export function useBookmarks(): BookmarksContextValue {
  return useContext(BookmarksContext);
}
