"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { StatusResponse } from "@/lib/types";

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
        setError("Backend offline");
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
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
        <span className="text-brand-muted">Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 text-xs">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-brand-verified" />
        <span className="text-brand-muted">
          {status.indexed_statutes.toLocaleString()} statutes indexed
        </span>
      </div>
      {status.jurisdictions.length > 0 && (
        <span className="text-brand-muted">
          {status.jurisdictions.join(", ")}
        </span>
      )}
      {status.last_eval_recall_at_5 != null && (
        <span className="text-brand-muted">
          recall@5 {(status.last_eval_recall_at_5 * 100).toFixed(0)}%
        </span>
      )}
    </div>
  );
}
