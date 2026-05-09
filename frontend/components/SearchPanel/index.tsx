"use client";

import { useState } from "react";
import { strings } from "@/lib/i18n/en";
import type { SearchRequest } from "@/lib/types";
import QueryTextarea from "./QueryTextarea";
import FactorDropdown from "./FactorDropdown";

interface SearchPanelProps {
  onSearch: (request: SearchRequest) => void;
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
        className="rounded-full bg-brand-accent px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-accent-hover disabled:opacity-50 disabled:hover:bg-brand-accent"
      >
        {isLoading ? strings.searchPanel.submitting : strings.searchPanel.submit}
      </button>
    </form>
  );
}
