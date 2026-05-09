"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { strings } from "@/lib/i18n/en";
import type { FactorCategory } from "@/lib/types";

interface FactorDropdownProps {
  value: string;
  onChange: (factor: string) => void;
}

export default function FactorDropdown({
  value,
  onChange,
}: FactorDropdownProps) {
  const [factors, setFactors] = useState<FactorCategory[]>([]);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    api
      .getFactors()
      .then((res) => setFactors(res.factors))
      .catch(() => setHasError(true));
  }, []);

  return (
    <div>
      <label className="block text-xs font-medium text-brand-muted mb-1">
        {strings.searchPanel.factorLabel}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={hasError}
        className="w-full rounded border border-brand-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-accent disabled:opacity-50"
      >
        <option value="">{strings.searchPanel.factorAll}</option>
        {factors.map((f) => (
          <option key={f.factor} value={f.factor}>
            {f.factor} ({f.statute_count})
          </option>
        ))}
      </select>
      {hasError && (
        <p className="mt-1 text-xs text-brand-error">
          {strings.searchPanel.factorsError}
        </p>
      )}
    </div>
  );
}
