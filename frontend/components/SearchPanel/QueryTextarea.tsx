"use client";

import { strings } from "@/lib/i18n/en";
import { looksLikeCitation } from "@/lib/citation";

interface QueryTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export default function QueryTextarea({
  value,
  onChange,
  onSubmit,
}: QueryTextareaProps) {
  const showCitationHint = looksLikeCitation(value);

  return (
    <div>
      <label className="block text-xs font-medium text-brand-muted mb-1">
        {strings.searchPanel.queryLabel}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={strings.searchPanel.queryPlaceholder}
        rows={4}
        className="w-full rounded border border-brand-border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-accent"
      />
      {showCitationHint && (
        <p className="mt-1 text-xs text-brand-accent">
          {strings.searchPanel.citationHint}
        </p>
      )}
    </div>
  );
}
