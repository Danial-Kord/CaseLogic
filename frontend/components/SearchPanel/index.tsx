"use client";

import { useState } from "react";
import { strings } from "@/lib/i18n/en";
import type { StatuteSearchRequest } from "@/lib/types";
import QueryTextarea from "./QueryTextarea";
import FactorDropdown from "./FactorDropdown";

interface SearchPanelProps {
  onSearch: (request: StatuteSearchRequest) => void;
  isLoading: boolean;
}

export default function SearchPanel({ onSearch, isLoading }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [factor, setFactor] = useState("");

  function submit() {
    const trimmed = query.trim();
    if (!trimmed) return;
    onSearch({
      query: trimmed,
      factor: factor || undefined,
      top_k: 10,
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col gap-4"
    >
      <QueryTextarea value={query} onChange={setQuery} onSubmit={submit} />
      <FactorDropdown value={factor} onChange={setFactor} />
      <button
        type="submit"
        disabled={isLoading || !query.trim()}
        className="rounded bg-brand-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-blue-700 transition-colors"
      >
        {isLoading ? strings.searchPanel.submitting : strings.searchPanel.submit}
      </button>
    </form>
  );
}
