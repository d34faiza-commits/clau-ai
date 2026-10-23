"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import type { CheckStatus, ScanReport } from "@/lib/security/types";

const BADGE: Record<CheckStatus, string> = {
  PASS: "bg-accent-green/15 text-accent-green border-accent-green/30",
  FAIL: "bg-red-500/15 text-red-400 border-red-500/30",
  WARN: "bg-amber-400/15 text-amber-400 border-amber-400/30",
  INFO: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

const ORDER: CheckStatus[] = ["FAIL", "WARN", "PASS", "INFO"];

export function StatusBadge({ status }: { status: CheckStatus }) {
  return (
    <span className={`inline-block rounded border px-2 py-0.5 font-mono text-xs font-semibold ${BADGE[status]}`}>
      {status}
    </span>
  );
}

export default function ResultsTable({ report }: { report: ScanReport }) {
  const [filter, setFilter] = useState<CheckStatus | null>(null);

  const counts = useMemo(() => {
    const c: Record<CheckStatus, number> = { PASS: 0, FAIL: 0, WARN: 0, INFO: 0 };
    for (const r of report.results) c[r.status]++;
    return c;
  }, [report]);

  const rows = filter ? report.results.filter((r) => r.status === filter) : report.results;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `clau-ai-${report.scanner}-${new Date().toISOString().slice(0, 19).replace(/:/g, "")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="mt-4 rounded-lg border border-base-border bg-base">
      <div className="flex flex-wrap items-center gap-2 border-b border-base-border px-3 py-2">
        {ORDER.filter((s) => counts[s] > 0).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(filter === s ? null : s)}
            className={`rounded border px-2 py-0.5 font-mono text-xs transition-opacity ${BADGE[s]} ${
              filter && filter !== s ? "opacity-40" : ""
            }`}
            title={`Show only ${s}`}
          >
            {s} {counts[s]}
          </button>
        ))}
        <span className="ml-auto font-mono text-xs text-slate-500">
          {report.scannedFiles !== undefined && `${report.scannedFiles.toLocaleString()} files · `}
          {(report.durationMs / 1000).toFixed(1)}s
          {report.truncated && " · limit reached"}
        </span>
        <button
          type="button"
          onClick={exportJson}
          className="rounded p-1 text-slate-400 hover:bg-base-hover hover:text-slate-100"
          title="Export JSON"
        >
          <Download className="h-4 w-4" />
        </button>
      </div>

      {report.target && (
        <p className="border-b border-base-border px-3 py-1.5 font-mono text-xs text-slate-500">target: {report.target}</p>
      )}

      <div className="max-h-[480px] overflow-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="sticky top-0 bg-base">
            <tr className="border-b border-base-border text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-medium">Check</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Detail</th>
              <th className="px-3 py-2 font-medium">Recommendation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-base-border/60 align-top last:border-0">
                <td className="max-w-[220px] break-words px-3 py-2 font-mono text-xs text-slate-200">{r.check}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={r.status} />
                </td>
                <td className="max-w-[360px] break-words px-3 py-2 text-xs text-slate-400">{r.detail}</td>
                <td className="max-w-[320px] break-words px-3 py-2 text-xs text-slate-300">{r.recommendation}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
