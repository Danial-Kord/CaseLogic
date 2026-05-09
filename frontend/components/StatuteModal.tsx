"use client";

import { useEffect, useState } from "react";
import SourceViewer from "./SourceViewer";
import { strings } from "@/lib/i18n/en";

interface StatuteModalProps {
  statuteId: string | null;
  onClose: () => void;
}

/**
 * Wrapper around SourceViewer that lets the user navigate from one statute
 * to another via the related-statutes graph without leaving the modal.
 *
 * Maintains a small history stack so the back button can pop the user back
 * to the statute they came from. When the modal is opened with a fresh
 * `statuteId` from the parent, the stack resets — closing/reopening the
 * modal from a search result is always a clean state.
 */
export default function StatuteModal({ statuteId, onClose }: StatuteModalProps) {
  const [stack, setStack] = useState<string[]>(() =>
    statuteId ? [statuteId] : [],
  );

  // Reset history whenever the parent passes a new starting statute
  // (e.g. user clicked a different result row).
  useEffect(() => {
    if (statuteId) {
      setStack([statuteId]);
    } else {
      setStack([]);
    }
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

  const currentId = stack[stack.length - 1] ?? statuteId;

  function handleNavigate(nextId: string) {
    setStack((prev) => [...prev, nextId]);
    // Snap the modal back to the top so the user lands on the new statute's
    // header instead of mid-page. Guarded for environments (jsdom) where
    // Element.scrollTo isn't implemented.
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        const el = document.querySelector(
          '[data-statute-modal-scroll="true"]',
        );
        if (el && typeof (el as HTMLElement).scrollTo === "function") {
          (el as HTMLElement).scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    }
  }

  function handleBack() {
    setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-brand-primary/40 p-4 backdrop-blur-sm animate-fade-in md:p-8"
      data-statute-modal-scroll="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative mt-4 w-full max-w-4xl rounded-xl border border-brand-border bg-brand-surface p-10 shadow-2xl animate-modal-in md:mt-12"
      >
        {stack.length > 1 && (
          <button
            type="button"
            onClick={handleBack}
            className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-brand-border bg-brand-bg px-2.5 py-1 text-[11px] font-medium text-brand-muted transition-colors hover:border-brand-accent hover:text-brand-accent"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10 12L6 8l4-4" />
            </svg>
            {strings.sourceViewer.back}
          </button>
        )}

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
        <SourceViewer statuteId={currentId} onNavigate={handleNavigate} />
      </div>
    </div>
  );
}
