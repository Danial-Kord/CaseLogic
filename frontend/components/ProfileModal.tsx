"use client";

import { useEffect, useState } from "react";
import type { Profile } from "@/lib/types";

interface ProfileModalProps {
  open: boolean;
  profile: Profile;
  onClose: () => void;
  onSave: (next: Omit<Profile, "updated_at">) => Promise<void>;
}

export default function ProfileModal({
  open,
  profile,
  onClose,
  onSave,
}: ProfileModalProps) {
  const [draft, setDraft] = useState<Omit<Profile, "updated_at">>({
    name: profile.name,
    role: profile.role,
    firm: profile.firm,
    about: profile.about,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset draft whenever the modal opens with a (possibly different) profile.
  useEffect(() => {
    if (open) {
      setDraft({
        name: profile.name,
        role: profile.role,
        firm: profile.firm,
        about: profile.about,
      });
      setError(null);
    }
  }, [open, profile]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await onSave(draft);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setIsSaving(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-brand-border bg-brand-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent";
  const labelCls = "block text-xs font-medium text-brand-muted mb-1";

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-brand-primary/40 p-4 backdrop-blur-sm animate-fade-in md:p-8"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSave}
        className="relative mt-4 w-full max-w-xl rounded-xl border border-brand-border bg-brand-surface p-8 shadow-2xl animate-modal-in md:mt-12"
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

        <h2 className="font-serif text-2xl text-brand-primary">Your profile</h2>
        <p className="mt-1 text-sm text-brand-muted">
          Used to personalize how the LLM frames its answers. Demo only — no
          login.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label className={labelCls} htmlFor="profile-name">
              Name
            </label>
            <input
              id="profile-name"
              className={inputCls}
              value={draft.name}
              onChange={(e) =>
                setDraft({ ...draft, name: e.target.value })
              }
              placeholder="e.g. Sarah Chen"
              maxLength={128}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="profile-role">
                Role
              </label>
              <input
                id="profile-role"
                className={inputCls}
                value={draft.role}
                onChange={(e) =>
                  setDraft({ ...draft, role: e.target.value })
                }
                placeholder="Plaintiff's Attorney"
                maxLength={128}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="profile-firm">
                Firm / org
              </label>
              <input
                id="profile-firm"
                className={inputCls}
                value={draft.firm}
                onChange={(e) =>
                  setDraft({ ...draft, firm: e.target.value })
                }
                placeholder="Chen & Lopez"
                maxLength={256}
              />
            </div>
          </div>

          <div>
            <label className={labelCls} htmlFor="profile-about">
              About / preferences
            </label>
            <textarea
              id="profile-about"
              className={`${inputCls} min-h-[7rem] resize-y`}
              value={draft.about}
              onChange={(e) =>
                setDraft({ ...draft, about: e.target.value })
              }
              placeholder="Practice area, jurisdiction focus, response preferences (e.g. concise vs. detailed). The chatbot reads this to tailor its answers."
              maxLength={2048}
            />
            <p className="mt-1 text-[11px] text-brand-muted">
              The chatbot sees this verbatim. Keep it short and concrete.
            </p>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded border border-brand-error/30 bg-brand-error/5 px-3 py-2 text-sm text-brand-error">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-5 py-2 text-sm text-brand-secondary transition-colors hover:bg-brand-bg"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="rounded-full bg-brand-accent px-6 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-accent-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-brand-accent"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
