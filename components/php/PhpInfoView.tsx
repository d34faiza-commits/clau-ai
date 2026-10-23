"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Code2,
  Cpu,
  Download,
  FileCog,
  Info,
  Loader2,
  Puzzle,
  RefreshCw,
  Search,
  Settings2,
} from "lucide-react";
import type { PhpBinary, PhpInfo } from "@/lib/phpinfo";

// Directives most admins look for first
const KEY_SETTINGS = [
  "memory_limit",
  "max_execution_time",
  "max_input_time",
  "max_input_vars",
  "upload_max_filesize",
  "post_max_size",
  "display_errors",
  "error_reporting",
  "date.timezone",
  "opcache.enable",
  "allow_url_fopen",
  "short_open_tag",
];

function accessLabel(access: number): string {
  // PHP_INI_USER = 1, PHP_INI_PERDIR = 2, PHP_INI_SYSTEM = 4, PHP_INI_ALL = 7
  if (access === 7) return "ALL";
  return [access & 1 && "USER", access & 2 && "PERDIR", access & 4 && "SYSTEM"].filter(Boolean).join("|") || "—";
}

function display(value: string): string {
  if (value === "") return "(empty)";
  return value;
}

export default function PhpInfoView() {
  const [binaries, setBinaries] = useState<PhpBinary[]>([]);
  const [binary, setBinary] = useState<string>("");
  const [info, setInfo] = useState<PhpInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [extFilter, setExtFilter] = useState("");
  const [iniFilter, setIniFilter] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);

  const load = useCallback(async (bin: string, refresh = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (bin) params.set("binary", bin);
      if (refresh) params.set("refresh", "1");
      const res = await fetch(`/api/php-info?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (data.binaries) setBinaries(data.binaries);
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setInfo(data.info);
      setBinary(data.info.binary);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load("");
  }, [load]);

  const iniMap = useMemo(() => new Map(info?.ini.map((e) => [e.name, e]) ?? []), [info]);

  const extensions = useMemo(() => {
    const q = extFilter.trim().toLowerCase();
    return (info?.extensions ?? []).filter((e) => !q || e.name.toLowerCase().includes(q));
  }, [info, extFilter]);

  const directives = useMemo(() => {
    const q = iniFilter.trim().toLowerCase();
    return (info?.ini ?? []).filter(
      (e) =>
        (!onlyChanged || e.local !== e.global) &&
        (!q || e.name.toLowerCase().includes(q) || e.local.toLowerCase().includes(q)),
    );
  }, [info, iniFilter, onlyChanged]);

  const disabledFunctions = (iniMap.get("disable_functions")?.local ?? "").split(",").filter((f) => f.trim()).length;

  const card = "rounded-xl border border-base-border bg-base-panel";
  const filterInput =
    "w-full rounded-md border border-base-border bg-base py-2 pl-9 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-accent-green/50";

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <Info className="h-6 w-6 text-accent-green" />
        <h1 className="text-xl font-semibold text-slate-100">PHP Info</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {binaries.length > 0 && (
            <select
              value={binary}
              onChange={(e) => load(e.target.value)}
              className="rounded-md border border-base-border bg-base-panel px-3 py-2 font-mono text-xs text-slate-200 outline-none focus:border-accent-green/50"
              aria-label="PHP version"
            >
              {binaries.map((b) => (
                <option key={b.path} value={b.path}>
                  PHP {b.version} — {b.path}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => load(binary, true)}
            className="rounded-md border border-base-border bg-base-panel p-2 text-slate-300 hover:border-slate-600"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          {info && (
            <a
              href={`/api/php-info/raw?binary=${encodeURIComponent(info.binary)}`}
              className="flex items-center gap-2 rounded-md border border-base-border bg-base-panel px-3 py-2 text-sm text-slate-300 hover:border-slate-600"
            >
              <Download className="h-4 w-4" /> php -i
            </a>
          )}
        </div>
      </header>

      {loading && !info && (
        <div className="flex justify-center py-24 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/5 p-4 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {info && (
        <>
          <p className="flex items-start gap-2 rounded-lg border border-accent-blue/30 bg-accent-blue/5 px-4 py-2.5 text-xs text-slate-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-blue" />
            <span>
              Values come from the PHP <b className="text-slate-300">CLI</b> binary. Websites run PHP through LiteSpeed
              (lsphp) or PHP-FPM, which can load a different php.ini. Pick the matching binary above, or check the
              site&apos;s own phpinfo() when values differ.
            </span>
          </p>

          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: "PHP Version", value: info.version, icon: Code2, tone: "bg-accent-blue/15 text-accent-blue" },
              { label: "Server API", value: info.sapi, icon: Cpu, tone: "bg-accent-green/15 text-accent-green" },
              { label: "Zend Engine", value: info.zend, icon: Settings2, tone: "bg-amber-400/15 text-amber-400" },
              { label: "Extensions", value: String(info.extensions.length), icon: Puzzle, tone: "bg-fuchsia-400/15 text-fuchsia-400" },
            ].map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className={`${card} p-4`}>
                <div className={`mb-3 inline-flex rounded-lg p-2 ${tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-1 truncate font-mono text-lg font-semibold text-slate-100" title={value}>
                  {value}
                </p>
              </div>
            ))}
          </section>

          <section className={`${card} p-5`}>
            <h2 className="mb-3 flex items-center gap-2 font-medium text-slate-100">
              <FileCog className="h-4 w-4 text-accent-green" /> Configuration Files
            </h2>
            <dl className="grid gap-2 text-sm sm:grid-cols-[180px_1fr]">
              <dt className="text-slate-500">PHP binary</dt>
              <dd className="break-all font-mono text-xs text-slate-200">{info.binary}</dd>
              <dt className="text-slate-500">Loaded php.ini</dt>
              <dd className="break-all font-mono text-xs text-slate-200">{info.iniFile || "(none — using defaults)"}</dd>
              <dt className="text-slate-500">Additional .ini files</dt>
              <dd className="font-mono text-xs text-slate-400">
                {info.scannedIni.length ? (
                  <details>
                    <summary className="cursor-pointer text-slate-300">{info.scannedIni.length} files</summary>
                    <ul className="mt-1 space-y-0.5">
                      {info.scannedIni.map((f) => (
                        <li key={f} className="break-all">
                          {f}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  "(none)"
                )}
              </dd>
              <dt className="text-slate-500">System</dt>
              <dd className="break-all font-mono text-xs text-slate-400">{info.uname}</dd>
            </dl>
          </section>

          <section className={`${card} p-5`}>
            <h2 className="mb-3 flex items-center gap-2 font-medium text-slate-100">
              <Settings2 className="h-4 w-4 text-accent-green" /> Key Settings
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {KEY_SETTINGS.map((name) => {
                const entry = iniMap.get(name);
                return (
                  <div key={name} className="rounded-lg bg-base px-3 py-2">
                    <p className="truncate font-mono text-[11px] text-slate-500">{name}</p>
                    <p className="truncate font-mono text-sm text-slate-100" title={entry?.local}>
                      {entry ? display(entry.local) : "n/a"}
                    </p>
                  </div>
                );
              })}
              <div className="rounded-lg bg-base px-3 py-2">
                <p className="font-mono text-[11px] text-slate-500">disable_functions</p>
                <p className="font-mono text-sm text-slate-100">{disabledFunctions} disabled</p>
              </div>
              <div className="rounded-lg bg-base px-3 py-2 sm:col-span-1 lg:col-span-3">
                <p className="font-mono text-[11px] text-slate-500">open_basedir</p>
                <p className="truncate font-mono text-sm text-slate-100" title={iniMap.get("open_basedir")?.local}>
                  {display(iniMap.get("open_basedir")?.local ?? "")}
                </p>
              </div>
            </div>
          </section>

          <section className={`${card} p-5`}>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="flex items-center gap-2 font-medium text-slate-100">
                <Puzzle className="h-4 w-4 text-accent-green" /> Extensions
                <span className="font-mono text-xs text-slate-500">({info.extensions.length})</span>
              </h2>
              <label className="relative ml-auto w-full sm:w-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input value={extFilter} onChange={(e) => setExtFilter(e.target.value)} placeholder="Filter extensions…" className={filterInput} />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {extensions.map((e) => (
                <span
                  key={e.name}
                  className={`rounded-md border px-2 py-1 font-mono text-xs ${
                    info.zendExtensions.includes(e.name)
                      ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                      : "border-base-border bg-base text-slate-300"
                  }`}
                  title={info.zendExtensions.includes(e.name) ? "Zend extension" : undefined}
                >
                  {e.name}
                  {e.version && e.version !== info.version && <span className="ml-1 text-slate-500">{e.version}</span>}
                </span>
              ))}
              {extensions.length === 0 && <p className="text-sm text-slate-500">No extension matches.</p>}
            </div>
          </section>

          <section className={card}>
            <div className="flex flex-wrap items-center gap-3 border-b border-base-border p-4">
              <h2 className="flex items-center gap-2 font-medium text-slate-100">
                <Settings2 className="h-4 w-4 text-accent-green" /> INI Directives
                <span className="font-mono text-xs text-slate-500">({directives.length})</span>
              </h2>
              <label className="flex items-center gap-2 text-sm text-slate-400">
                <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} className="accent-green-500" />
                Only local ≠ master
              </label>
              <label className="relative ml-auto w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input value={iniFilter} onChange={(e) => setIniFilter(e.target.value)} placeholder="Filter directives…" className={filterInput} />
              </label>
            </div>
            <div className="max-h-[560px] overflow-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="sticky top-0 bg-base-panel">
                  <tr className="border-b border-base-border text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-2 font-medium">Directive</th>
                    <th className="px-4 py-2 font-medium">Local Value</th>
                    <th className="px-4 py-2 font-medium">Master Value</th>
                    <th className="px-4 py-2 font-medium">Changeable</th>
                  </tr>
                </thead>
                <tbody>
                  {directives.map((d) => (
                    <tr key={d.name} className="border-b border-base-border/60 align-top last:border-0 hover:bg-base-hover/60">
                      <td className="px-4 py-1.5 font-mono text-xs text-slate-200">{d.name}</td>
                      <td
                        className={`max-w-[320px] break-all px-4 py-1.5 font-mono text-xs ${
                          d.local !== d.global ? "text-amber-300" : "text-slate-300"
                        }`}
                      >
                        {display(d.local)}
                      </td>
                      <td className="max-w-[320px] break-all px-4 py-1.5 font-mono text-xs text-slate-500">{display(d.global)}</td>
                      <td className="px-4 py-1.5 font-mono text-[11px] text-slate-500">{accessLabel(d.access)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
