import { strings } from "@/lib/i18n/en";

interface EvalRecallBadgeProps {
  recall: number;
}

export default function EvalRecallBadge({ recall }: EvalRecallBadgeProps) {
  return (
    <span
      title={strings.datasetStatus.evalTooltip}
      className="rounded bg-brand-accent/10 text-brand-accent px-1.5 py-0.5 font-medium"
    >
      {strings.datasetStatus.evalBadge(recall)}
    </span>
  );
}
