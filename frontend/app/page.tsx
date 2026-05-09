"use client";

import { api } from "@/lib/api";
import ChatPanel from "@/components/ChatPanel";
import DatasetStatus from "@/components/DatasetStatus";

async function handleSendMessage(query: string): Promise<string> {
  return api.chat(query);
}

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between border-b border-brand-border bg-brand-surface px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-lg">CaseLogic</span>
          <span className="text-xs text-brand-muted">
            Source-grounded legal research
          </span>
        </div>
        <DatasetStatus />
      </header>

      <main className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
        <ChatPanel onSendMessage={handleSendMessage} />
      </main>

      <footer className="border-t border-brand-border bg-brand-surface px-6 py-2 text-xs text-brand-muted text-center">
        Research prototype. Not legal advice. Results limited to indexed public
        sources.
      </footer>
    </div>
  );
}
