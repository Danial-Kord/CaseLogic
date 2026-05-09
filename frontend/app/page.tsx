import SearchPanel from "@/components/SearchPanel";
import ResultsPanel from "@/components/ResultsPanel";
import ComparisonTable from "@/components/ComparisonTable";
import VerificationPanel from "@/components/VerificationPanel";
import SourceViewer from "@/components/SourceViewer";
import DatasetStatus from "@/components/DatasetStatus";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between border-b border-brand-border bg-brand-surface px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-lg">CaseLogic</span>
          <span className="text-xs text-brand-muted">
            Source-grounded PI legal research
          </span>
        </div>
        <DatasetStatus />
      </header>

      <main className="flex-1 grid grid-cols-1 md:grid-cols-[20rem_1fr_22rem] gap-4 p-4">
        <aside className="space-y-4">
          <SearchPanel />
        </aside>

        <section className="space-y-4">
          <ResultsPanel />
          <ComparisonTable />
          <SourceViewer />
        </section>

        <aside className="space-y-4">
          <VerificationPanel />
        </aside>
      </main>

      <footer className="border-t border-brand-border bg-brand-surface px-6 py-2 text-xs text-brand-muted">
        Research prototype. Not legal advice. Results limited to indexed public sources.
      </footer>
    </div>
  );
}
