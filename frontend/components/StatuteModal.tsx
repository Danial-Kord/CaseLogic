"use client";

import { useEffect, useState } from "react";
import SourceViewer from "./SourceViewer";

interface StatuteModalProps {
  statuteId: string | null;
  onClose: () => void;
}

/**
 * Lightweight modal wrapper around SourceViewer.
 *
 * Handles only the modal chrome — Esc-to-close, body scroll lock, click-out
 * dismissal, close button. The viewer itself owns all statute rendering.
 *
 * In-modal navigation: when the user clicks a cross-reference chip inside
 * the displayed statute (e.g. "RCW 46.61.5249" inside the statutory text),
 * we keep the modal open and swap `currentId` to the cited slug. Closing
 * the modal resets state so the next open starts fresh.
 */
export default function StatuteModal({ statuteId, onClose }: StatuteModalProps) {
  const [currentId, setCurrentId] = useState<string | null>(statuteId);

  // Mirror the prop into local state so the parent's "open this slug" call
  // wins over any internal navigation. Resets to null on close.
  useEffect(() => {
    setCurrentId(statuteId);
  }, [statuteId]);

  useEffect(() => {
    if (!statuteId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [statuteId, onClose]);

  if (!statuteId) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-brand-primary/40 p-4 backdrop-blur-sm animate-fade-in md:p-8"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative mt-4 w-full max-w-4xl rounded-xl border border-brand-border bg-brand-surface p-10 shadow-2xl animate-modal-in md:mt-12"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-full p-2 text-brand-muted transition-colors hover:bg-brand-bg hover:text-brand-primary"
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
        <SourceViewer
          statuteId={currentId}
          onCiteClick={(slug) => setCurrentId(slug)}
        />
      </div>
    </div>
  );
}
