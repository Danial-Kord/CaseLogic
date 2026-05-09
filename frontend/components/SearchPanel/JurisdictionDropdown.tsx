"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { strings } from "@/lib/i18n/en";
import type { JurisdictionCount } from "@/lib/types";

interface JurisdictionDropdownProps {
  value: string;
  onChange: (jurisdiction: string) => void;
}

export default function JurisdictionDropdown({
  value,
  onChange,
}: JurisdictionDropdownProps) {
  const [jurisdictions, setJurisdictions] = useState<JurisdictionCount[]>([]);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    api
      .getJurisdictions()
      .then((res) => setJurisdictions(res.jurisdictions))
      .catch(() => setHasError(true));
  }, []);

  return (
    <div>
      <label className="block text-xs font-medium text-brand-muted mb-1">
        {strings.searchPanel.jurisdictionLabel}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={hasError}
        className="w-full rounded border border-brand-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent disabled:opacity-50"
      >
        <option value="">{strings.searchPanel.jurisdictionAll}</option>
        {jurisdictions.map((j) => {
          const label =
            strings.jurisdiction.labels[j.jurisdiction] ?? j.jurisdiction;
          return (
            <option key={j.jurisdiction} value={j.jurisdiction}>
              {label} ({j.statute_count})
            </option>
          );
        })}
      </select>
      {hasError && (
        <p className="mt-1 text-xs text-brand-error">
          {strings.searchPanel.jurisdictionsError}
        </p>
      )}
    </div>
  );
}
