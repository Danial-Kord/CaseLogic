// Renders a list of contributing-factor chips. Used by both the result cards
// in ResultsPanel and the metadata stack in SourceViewer.

interface FactorChipsProps {
  factors: string[];
}

export default function FactorChips({ factors }: FactorChipsProps) {
  if (factors.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {factors.map((f) => (
        <span
          key={f}
          className="rounded-full bg-brand-accent/10 px-2 py-0.5 text-xs font-medium text-brand-accent"
        >
          {f}
        </span>
      ))}
    </div>
  );
}
