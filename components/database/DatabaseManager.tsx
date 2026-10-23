"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  DatabaseBackup,
  HardDrive,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Server,
  Table2,
  Trash2,
} from "lucide-react";
import Modal from "@/components/Modal";
import { formatBytes } from "@/lib/format";

type DatabaseInfo = {
  name: string;
  sizeBytes: number;
  tables: number;
  engines: string[];
  collation: string;
  system: boolean;
};

type Listing =
  | { configured: false }
  | { configured: true; error: string }
  | { configured: true; version: string; server: string; user: string; databases: DatabaseInfo[] };

type Toast = { id: number; type: "success" | "error"; message: string };

export default function DatabaseManager() {
  const [data, setData] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [showSystem, setShowSystem] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [deleting, setDeleting] = useState<DatabaseInfo | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/database", { cache: "no-store" });
      setData(await res.json());
    } catch {
      setData({ configured: true, error: "Could not reach the server" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const databases = useMemo(() => {
    if (!data || !("databases" in data)) return [];
    const q = filter.trim().toLowerCase();
    return data.databases.filter((d) => (showSystem || !d.system) && (!q || d.name.toLowerCase().includes(q)));
  }, [data, filter, showSystem]);

  const totals = useMemo(() => {
    if (!data || !("databases" in data)) return null;
    const user = data.databases.filter((d) => !d.system);
    return {
      count: user.length,
      size: user.reduce((s, d) => s + d.sizeBytes, 0),
      tables: user.reduce((s, d) => s + d.tables, 0),
    };
  }, [data]);

  const action = async (body: Record<string, string>) => {
    const res = await fetch("/api/database", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await action({ action: "create", name: newName.trim() });
      notify("success", `Database "${newName.trim()}" created`);
      setCreateOpen(false);
      setNewName("");
      load();
    } catch (err) {
      notify("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await action({ action: "delete", name: deleting.name });
      notify("success", `Database "${deleting.name}" deleted`);
      setDeleting(null);
      load();
    } catch (err) {
      notify("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const backup = async (db: DatabaseInfo) => {
    // Probe first so a mysqldump error shows as a toast instead of a broken download.
    notify("success", `Preparing backup of "${db.name}"…`);
    const url = `/api/database/backup?name=${encodeURIComponent(db.name)}`;
    try {
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download =
        res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `${db.name}.sql.gz`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      notify("error", `Backup failed: ${(err as Error).message}`);
    }
  };

  const btn =
    "flex items-center gap-2 rounded-md border border-base-border bg-base px-3 py-2 text-sm text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100 disabled:opacity-40";
  const iconBtn = "rounded p-1.5 text-slate-400 transition-colors hover:bg-base-hover hover:text-slate-100";

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <Database className="h-6 w-6 text-accent-green" />
        <h1 className="text-xl font-semibold text-slate-100">Database</h1>
        {data && "version" in data && (
          <span className="ml-auto flex items-center gap-2 rounded-md border border-base-border bg-base-panel px-3 py-1 font-mono text-xs text-slate-400">
            <span className="h-2 w-2 rounded-full bg-accent-green shadow-[0_0_6px_#22c55e]" />
            {data.version} · {data.user}@{data.server}
          </span>
        )}
      </header>

      {loading && !data && (
        <div className="flex justify-center py-24 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {data && !data.configured && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-400/5 p-6 text-sm text-slate-300">
          <h2 className="mb-2 flex items-center gap-2 font-medium text-amber-300">
            <AlertCircle className="h-4 w-4" /> Database not configured
          </h2>
          <p>Create a MySQL/MariaDB user for the panel, then add it to <code className="font-mono">.env</code> and restart:</p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-base p-3 font-mono text-xs text-slate-300">{`sudo mysql -e "CREATE USER 'clauai'@'localhost' IDENTIFIED BY 'a-strong-password';
GRANT ALL PRIVILEGES ON *.* TO 'clauai'@'localhost'; FLUSH PRIVILEGES;"

# .env
DB_HOST=localhost
DB_USER=clauai
DB_PASSWORD=a-strong-password`}</pre>
        </div>
      )}

      {data && data.configured && "error" in data && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-red-500/40 bg-red-500/5 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="text-sm text-red-300">{data.error}</p>
          <button type="button" className={btn} onClick={load}>
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      )}

      {data && "databases" in data && totals && (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: "Databases", value: String(totals.count), icon: Database, tone: "text-accent-green bg-accent-green/15" },
              { label: "Total Size", value: formatBytes(totals.size), icon: HardDrive, tone: "text-accent-blue bg-accent-blue/15" },
              { label: "Tables", value: String(totals.tables), icon: Table2, tone: "text-amber-400 bg-amber-400/15" },
            ].map(({ label, value, icon: Icon, tone }) => (
              <div key={label} className="flex items-center gap-4 rounded-xl border border-base-border bg-base-panel p-4">
                <div className={`rounded-lg p-2.5 ${tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
                  <p className="font-mono text-lg font-semibold text-slate-100">{value}</p>
                </div>
              </div>
            ))}
          </section>

          <div className="rounded-xl border border-base-border bg-base-panel">
            <div className="flex flex-wrap items-center gap-2 border-b border-base-border p-3">
              <button
                type="button"
                className={`${btn} border-accent-green/40 text-accent-green hover:border-accent-green`}
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="h-4 w-4" /> Create Database
              </button>
              <button type="button" className={btn} onClick={load} title="Refresh">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
              <label className="flex items-center gap-2 px-2 text-sm text-slate-400">
                <input
                  type="checkbox"
                  checked={showSystem}
                  onChange={(e) => setShowSystem(e.target.checked)}
                  className="accent-green-500"
                />
                Show system databases
              </label>
              <label className="relative ml-auto w-full sm:w-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter…"
                  className="w-full rounded-md border border-base-border bg-base py-2 pl-9 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-accent-green/50"
                />
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-base-border text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="w-full px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 text-right font-medium">Size</th>
                    <th className="px-4 py-2 text-right font-medium">Tables</th>
                    <th className="hidden px-4 py-2 font-medium sm:table-cell">Engine</th>
                    <th className="hidden px-4 py-2 font-medium lg:table-cell">Collation</th>
                    <th className="px-4 py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {databases.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">
                        {filter ? "No database matches the filter." : "No databases yet — create one."}
                      </td>
                    </tr>
                  )}
                  {databases.map((db) => (
                    <tr key={db.name} className="border-b border-base-border/60 last:border-0 hover:bg-base-hover/60">
                      <td className="max-w-0 px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          <Server className={`h-4 w-4 shrink-0 ${db.system ? "text-slate-500" : "text-accent-blue"}`} />
                          <span className="truncate font-mono text-slate-200">{db.name}</span>
                          {db.system && (
                            <span className="flex shrink-0 items-center gap-1 rounded bg-slate-500/15 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
                              <Lock className="h-3 w-3" /> system
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-mono text-xs text-slate-400">
                        {formatBytes(db.sizeBytes)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-400">{db.tables}</td>
                      <td className="hidden whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-400 sm:table-cell">
                        {db.engines.join(", ") || "—"}
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-2.5 font-mono text-xs text-slate-500 lg:table-cell">
                        {db.collation}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-0.5">
                          <button type="button" className={iconBtn} onClick={() => backup(db)} title="Backup (.sql.gz)">
                            <DatabaseBackup className="h-4 w-4" />
                          </button>
                          {!db.system && (
                            <button
                              type="button"
                              className={`${iconBtn} hover:!text-red-400`}
                              onClick={() => {
                                setConfirmName("");
                                setDeleting(db);
                              }}
                              title="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {createOpen && (
        <Modal
          title="Create Database"
          onClose={() => !busy && setCreateOpen(false)}
          footer={
            <>
              <button type="button" onClick={() => setCreateOpen(false)} className="rounded-md px-4 py-2 text-sm text-slate-300 hover:bg-base-hover">
                Cancel
              </button>
              <button
                type="submit"
                form="create-db"
                disabled={busy || !/^[A-Za-z0-9_]{1,64}$/.test(newName.trim())}
                className="flex items-center gap-2 rounded-md bg-accent-green px-4 py-2 text-sm font-medium text-slate-900 hover:bg-green-400 disabled:opacity-40"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Create
              </button>
            </>
          }
        >
          <form id="create-db" onSubmit={create}>
            <label className="mb-2 block text-xs uppercase tracking-wide text-slate-500">Database name</label>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="my_site_db"
              className="w-full rounded-md border border-base-border bg-base px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-accent-green/50"
            />
            <p className="mt-2 text-xs text-slate-500">Letters, numbers and _ only. Charset utf8mb4 (utf8mb4_unicode_ci).</p>
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal
          title="Delete Database"
          onClose={() => !busy && setDeleting(null)}
          footer={
            <>
              <button type="button" onClick={() => setDeleting(null)} className="rounded-md px-4 py-2 text-sm text-slate-300 hover:bg-base-hover">
                Cancel
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={busy || confirmName !== deleting.name}
                className="flex items-center gap-2 rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-400 disabled:opacity-40"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete permanently
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-300">
            This drops <b className="font-mono text-slate-100">{deleting.name}</b> with {deleting.tables} table(s) and{" "}
            {formatBytes(deleting.sizeBytes)} of data. It cannot be undone — make a backup first.
          </p>
          <label className="mb-2 mt-4 block text-xs uppercase tracking-wide text-slate-500">
            Type the database name to confirm
          </label>
          <input
            autoFocus
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            className="w-full rounded-md border border-base-border bg-base px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-red-500/50"
          />
        </Modal>
      )}

      <div className="fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-2 rounded-lg border bg-base-panel px-4 py-3 text-sm shadow-lg ${
              t.type === "success" ? "border-accent-green/40 text-slate-200" : "border-red-500/40 text-red-300"
            }`}
          >
            {t.type === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-green" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            )}
            <span className="break-words">{t.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
