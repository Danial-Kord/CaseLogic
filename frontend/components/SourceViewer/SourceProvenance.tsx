import { strings } from "@/lib/i18n/en";

interface SourceProvenanceProps {
  url: string;
}

// TODO: surface retrieved_at (e.g. "fetched 3 days ago") once design lands.
export default function SourceProvenance({ url }: SourceProvenanceProps) {
  return (
    <div className="rounded-lg bg-brand-bg px-3 py-2 text-xs text-brand-muted border border-brand-border">
      <p className="font-medium mb-0.5">{strings.sourceViewer.source}</p>
      <p className="break-all">{url}</p>
    </div>
  );
}
