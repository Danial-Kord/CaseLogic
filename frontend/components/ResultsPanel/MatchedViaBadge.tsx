import { strings } from "@/lib/i18n/en";
import type { MatchedVia } from "@/lib/types";

// Tailwind backgrounds per matched_via, paired with the human-readable label
// from the i18n file. Keeping the styles co-located with the badge component
// (and the labels in i18n) is the cleanest split.
const BG_BY_MATCHED_VIA: Record<MatchedVia, string> = {
  citation: "bg-brand-verified text-white",
  hybrid: "bg-brand-accent text-white",
  vector: "bg-purple-600 text-white",
  keyword: "bg-brand-muted text-white",
};

interface MatchedViaBadgeProps {
  matchedVia: MatchedVia;
}

export default function MatchedViaBadge({ matchedVia }: MatchedViaBadgeProps) {
  const bg = BG_BY_MATCHED_VIA[matchedVia];
  const label = strings.matchedVia.labels[matchedVia];
  return (
    <span
      title={strings.matchedVia.title(matchedVia)}
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${bg}`}
    >
      {label}
    </span>
  );
}
