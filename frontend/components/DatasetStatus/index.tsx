"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { strings } from "@/lib/i18n/en";
import type { StatusResponse } from "@/lib/types";
import EvalRecallBadge from "./EvalRecallBadge";

const POLL_INTERVAL_MS = 30_000;

export default function DatasetStatus() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const data = await api.getStatus();
        setStatus(data);
        setError(null);
      } catch {
        setError(strings.datasetStatus.backendOffline);
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="w-2 h-2 rounded-full bg-brand-error" />
        <span className="text-brand-muted">{error}</span>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="w-2 h-2 rounded-full bg-brand-muted animate-pulse" />
        <span className="text-brand-muted">{strings.datasetStatus.loading}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 text-xs">
      <div
        className="flex items-center gap-2"
        title={
          status.last_eval_run_at
            ? strings.datasetStatus.lastEvalTooltip(status.last_eval_run_at)
            : undefined
        }
      >
        <span className="w-2 h-2 rounded-full bg-brand-verified" />
        <span className="text-brand-muted">
          {strings.datasetStatus.statutesIndexed(status.indexed_statutes)}
        </span>
      </div>
      {status.jurisdictions.length > 0 && (
        <span className="text-brand-muted">
          {status.jurisdictions.join(", ")}
        </span>
      )}
      {status.last_eval_recall_at_5 !== null && (
        <EvalRecallBadge recall={status.last_eval_recall_at_5} />
      )}
    </div>
  );
}
