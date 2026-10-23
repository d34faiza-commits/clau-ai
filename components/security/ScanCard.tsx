"use client";

import { useState } from "react";
import { AlertCircle, Loader2, type LucideIcon } from "lucide-react";
import ResultsTable from "@/components/security/ResultsTable";
import type { ScanReport, ScannerId } from "@/lib/security/types";

export type Field =
  | { name: string; label: string; type: "text"; defaultValue: string; className?: string }
  | { name: string; label: string; type: "number"; defaultValue: number; min: number; max: number; className?: string }
  | { name: string; label: string; type: "select"; defaultValue: string; options: Record<string, string>; className?: string };

type ScanCardProps = {
  scanner: ScannerId;
  title: string;
  description: string;
  icon: LucideIcon;
  iconClass: string;
  fields: Field[];
  buttonLabel: string;
  danger?: boolean;
};

export default function ScanCard({ scanner, title, description, icon: Icon, iconClass, fields, buttonLabel, danger }: ScanCardProps) {
  const [values, setValues] = useState<Record<string, string | number>>(
    Object.fromEntries(fields.map((f) => [f.name, f.defaultValue])),
  );
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/security/${scanner}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setReport(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const input =
    "w-full rounded-md border border-base-border bg-base px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent-green/50";

  return (
    <section className="rounded-xl border border-base-border bg-base-panel p-5">
      <div className="flex items-start gap-3">
        <div className={`rounded-lg p-2 ${iconClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="font-medium text-slate-100">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{description}</p>
        </div>
      </div>

      <form onSubmit={run} className="mt-4 flex flex-wrap items-end gap-3">
        {fields.map((f) => (
          <label key={f.name} className={f.className ?? "min-w-[200px] flex-1"}>
            <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">{f.label}</span>
            {f.type === "select" ? (
              <select
                value={values[f.name]}
                onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                className={input}
              >
                {Object.entries(f.options).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={f.type}
                value={values[f.name]}
                min={f.type === "number" ? f.min : undefined}
                max={f.type === "number" ? f.max : undefined}
                onChange={(e) =>
                  setValues({ ...values, [f.name]: f.type === "number" ? Number(e.target.value) : e.target.value })
                }
                className={`${input} font-mono`}
                required
              />
            )}
          </label>
        ))}
        <button
          type="submit"
          disabled={running}
          className={[
            "flex min-w-[140px] items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-60",
            danger ? "bg-red-500 text-white hover:bg-red-400" : "bg-accent-green text-slate-900 hover:bg-green-400",
          ].join(" ")}
        >
          {running && <Loader2 className="h-4 w-4 animate-spin" />}
          {running ? "Scanning…" : buttonLabel}
        </button>
      </form>

      {error && (
        <p className="mt-3 flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {running && !report && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-dashed border-base-border p-6 text-sm text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin text-accent-green" />
          Running checks on the server…
        </div>
      )}

      {report && <ResultsTable report={report} />}
    </section>
  );
}
