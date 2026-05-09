"use client";

import type { Profile } from "@/lib/types";

interface ProfileCardProps {
  profile: Profile;
  onEdit: () => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]!.toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1][0]!).toUpperCase();
}

export default function ProfileCard({ profile, onEdit }: ProfileCardProps) {
  const hasName = profile.name.trim().length > 0;
  const subline = [profile.role, profile.firm].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      onClick={onEdit}
      className="flex w-full items-center gap-3 border-b border-brand-border px-3 py-3 text-left transition-colors hover:bg-brand-bg"
    >
      <span
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-accent text-sm font-semibold text-white"
        aria-hidden="true"
      >
        {hasName ? initials(profile.name) : "+"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-brand-primary">
          {hasName ? profile.name : "Set up profile"}
        </span>
        <span className="block truncate text-[11px] text-brand-muted">
          {hasName
            ? subline || "Click to edit"
            : "Personalize the LLM responses"}
        </span>
      </span>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="h-4 w-4 flex-shrink-0 text-brand-muted"
        aria-hidden="true"
      >
        <path d="M2.695 14.763l-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.886L17.5 5.5a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z" />
      </svg>
    </button>
  );
}
