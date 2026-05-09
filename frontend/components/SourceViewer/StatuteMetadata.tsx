import { strings } from "@/lib/i18n/en";
import type { StatuteDetail } from "@/lib/types";

interface StatuteMetadataProps {
  statute: Pick<
    StatuteDetail,
    "jurisdiction" | "division" | "chapter" | "subdivision"
  >;
}

// Renders a thin one-line metadata row from the structured fields. Keeping
// the join logic here means the parent doesn't have to care which fields
// are present.
export default function StatuteMetadata({ statute }: StatuteMetadataProps) {
  const parts = [
    statute.jurisdiction,
    statute.division,
    statute.chapter,
    statute.subdivision
      ? strings.sourceViewer.subdivision(statute.subdivision)
      : null,
  ].filter(Boolean);

  if (parts.length === 0) return null;

  return <p className="text-xs text-brand-muted">{parts.join(" · ")}</p>;
}
