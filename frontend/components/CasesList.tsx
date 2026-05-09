"use client";

import { useState } from "react";

interface Case {
  id: string;
  number: string;
  description: string;
}

export default function CasesList() {
  const [cases, setCases] = useState<Case[]>([
    { id: "1", number: "Case #1", description: "" },
  ]);
  const [selectedId, setSelectedId] = useState<string>("1");

  function addCase() {
    const next = String(cases.length + 1);
    const newCase: Case = {
      id: next,
      number: `Case #${next}`,
      description: "",
    };
    setCases([...cases, newCase]);
    setSelectedId(next);
  }

  function updateCase(id: string, field: keyof Case, value: string) {
    setCases(cases.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  }

  function deleteCase(c: Case) {
    const ok = window.confirm(
      `Delete ${c.number}${c.description ? ` — ${c.description}` : ""}? This can't be undone.`,
    );
    if (!ok) return;
    const remaining = cases.filter((x) => x.id !== c.id);
    setCases(remaining);
    if (selectedId === c.id && remaining.length > 0) {
      setSelectedId(remaining[0].id);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Cases</h2>
        <button
          type="button"
          onClick={addCase}
          className="rounded bg-brand-accent text-white w-6 h-6 text-sm leading-none hover:bg-blue-700"
          aria-label="Add case"
        >
          +
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {cases.map((c) => {
          const selected = c.id === selectedId;
          return (
            <div
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`group relative rounded border p-2 cursor-pointer transition-colors ${
                selected
                  ? "border-brand-accent bg-blue-50"
                  : "border-brand-border hover:bg-gray-50"
              }`}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteCase(c);
                }}
                aria-label="Delete case"
                className="absolute top-1 right-1 text-xs text-brand-muted hover:text-brand-error opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ✕
              </button>
              <input
                value={c.number}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => updateCase(c.id, "number", e.target.value)}
                className="w-full bg-transparent text-sm font-medium focus:outline-none mb-1 pr-5"
              />
              <input
                value={c.description}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => updateCase(c.id, "description", e.target.value)}
                placeholder="Short description"
                className="w-full bg-transparent text-xs text-brand-muted focus:outline-none"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
