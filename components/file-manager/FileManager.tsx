"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  Download,
  FilePlus,
  FolderOpen,
  FolderPlus,
  Home,
  KeyRound,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  SquarePen,
  Trash2,
  Upload,
} from "lucide-react";
import Modal from "@/components/Modal";
import FileEditor from "@/components/file-manager/FileEditor";
import FileIcon, { isBinaryName } from "@/components/file-manager/FileIcon";
import type { DirectoryListing, FileEntry } from "@/lib/file-types";
import { formatBytes } from "@/lib/format";

type Toast = { id: number; type: "success" | "error"; message: string };

type Dialog =
  | {
      kind: "prompt";
      title: string;
      label: string;
      initial: string;
      confirmText: string;
      onSubmit: (value: string) => Promise<void>;
    }
  | {
      kind: "confirm";
      title: string;
      message: React.ReactNode;
      confirmText: string;
      danger?: boolean;
      onConfirm: () => Promise<void>;
    };

async function postAction(body: Record<string, unknown>) {
  const res = await fetch("/api/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
}

function parentOf(path: string): string {
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return "/" + parts.join("/");
}

function joinPath(dir: string, name: string): string {
  return (dir === "/" ? "" : dir) + "/" + name;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function FileManager() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPath = searchParams.get("path") || "/";

  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [dialogValue, setDialogValue] = useState("");
  const [dialogBusy, setDialogBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ loaded: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const notify = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  const notifyError = useCallback((message: string) => notify("error", message), [notify]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(currentPath)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setListing(data);
      setLoadError(null);
    } catch (err) {
      setLoadError((err as Error).message);
      setListing(null);
    } finally {
      setLoading(false);
    }
  }, [currentPath]);

  useEffect(() => {
    setSelected(new Set());
    setFilter("");
    load();
  }, [load]);

  const navigate = useCallback(
    (path: string) => {
      router.push(path === "/" ? pathname : `${pathname}?path=${encodeURIComponent(path)}`);
    },
    [router, pathname],
  );

  const entries = useMemo(() => {
    const all = listing?.entries ?? [];
    const q = filter.trim().toLowerCase();
    return q ? all.filter((e) => e.name.toLowerCase().includes(q)) : all;
  }, [listing, filter]);

  const breadcrumbs = useMemo(() => {
    const parts = currentPath.split("/").filter(Boolean);
    return parts.map((name, i) => ({ name, path: "/" + parts.slice(0, i + 1).join("/") }));
  }, [currentPath]);

  const allSelected = entries.length > 0 && entries.every((e) => selected.has(e.path));

  const toggleSelect = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(entries.map((e) => e.path)));
  };

  // ---- dialogs ---------------------------------------------------------------

  const openPrompt = (d: Omit<Extract<Dialog, { kind: "prompt" }>, "kind">) => {
    setDialogValue(d.initial);
    setDialog({ kind: "prompt", ...d });
  };

  const runDialog = async () => {
    if (!dialog || dialogBusy) return;
    setDialogBusy(true);
    try {
      if (dialog.kind === "prompt") await dialog.onSubmit(dialogValue.trim());
      else await dialog.onConfirm();
      setDialog(null);
    } catch (err) {
      notifyError((err as Error).message);
    } finally {
      setDialogBusy(false);
    }
  };

  // ---- actions ---------------------------------------------------------------

  const newFolder = () =>
    openPrompt({
      title: "New Folder",
      label: "Folder name",
      initial: "",
      confirmText: "Create",
      onSubmit: async (name) => {
        await postAction({ action: "mkdir", path: currentPath, name });
        notify("success", `Folder "${name}" created`);
        load();
      },
    });

  const newFile = () =>
    openPrompt({
      title: "New File",
      label: "File name",
      initial: "",
      confirmText: "Create",
      onSubmit: async (name) => {
        await postAction({ action: "touch", path: currentPath, name });
        notify("success", `File "${name}" created`);
        await load();
        setEditing(joinPath(currentPath, name));
      },
    });

  const rename = (entry: FileEntry) =>
    openPrompt({
      title: "Rename",
      label: "New name",
      initial: entry.name,
      confirmText: "Rename",
      onSubmit: async (name) => {
        if (name === entry.name) return;
        await postAction({ action: "rename", path: entry.path, name });
        notify("success", `Renamed to "${name}"`);
        load();
      },
    });

  const chmod = (entry: FileEntry) =>
    openPrompt({
      title: `Permissions — ${entry.name}`,
      label: "Octal mode (e.g. 644, 755)",
      initial: entry.mode.replace(/^0(?=\d{3}$)/, ""),
      confirmText: "Apply",
      onSubmit: async (mode) => {
        await postAction({ action: "chmod", path: entry.path, mode });
        notify("success", `Permissions set to ${mode}`);
        load();
      },
    });

  const remove = (paths: string[]) =>
    setDialog({
      kind: "confirm",
      title: "Delete",
      danger: true,
      confirmText: "Delete",
      message: (
        <>
          <p>
            Hapus <b className="text-slate-100">{paths.length === 1 ? paths[0] : `${paths.length} item`}</b>{" "}
            secara permanen?
          </p>
          <p className="mt-2 text-xs text-red-400">Folder akan dihapus beserta seluruh isinya. Tidak bisa dibatalkan.</p>
        </>
      ),
      onConfirm: async () => {
        try {
          await postAction({ action: "delete", paths });
          notify("success", paths.length === 1 ? "Deleted" : `${paths.length} items deleted`);
        } finally {
          setSelected(new Set());
          load();
        }
      },
    });

  const download = (entry: FileEntry) => {
    window.location.href = `/api/files/download?path=${encodeURIComponent(entry.path)}`;
  };

  const open = (entry: FileEntry) => {
    if (entry.type === "dir") navigate(entry.path);
    else if (isBinaryName(entry.name)) download(entry);
    else setEditing(entry.path);
  };

  // ---- upload ----------------------------------------------------------------

  const sendUpload = (files: File[], overwrite: boolean) =>
    new Promise<void>((resolve, reject) => {
      const form = new FormData();
      form.append("path", currentPath);
      if (overwrite) form.append("overwrite", "1");
      files.forEach((f) => form.append("files", f));

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/files/upload");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUpload({ loaded: e.loaded, total: e.total });
      };
      xhr.onload = () => {
        let data: { error?: string } = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          // non-JSON (e.g. proxy error page)
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(data.error || (xhr.status === 413 ? "File too large" : `HTTP ${xhr.status}`)));
      };
      xhr.onerror = () => reject(new Error("Upload failed (network error)"));
      setUpload({ loaded: 0, total: files.reduce((s, f) => s + f.size, 0) });
      xhr.send(form);
    });

  const doUpload = async (files: File[], overwrite: boolean) => {
    try {
      await sendUpload(files, overwrite);
      notify("success", `${files.length} file uploaded`);
    } catch (err) {
      notifyError((err as Error).message);
    } finally {
      setUpload(null);
      load();
    }
  };

  const startUpload = (files: File[]) => {
    if (files.length === 0 || upload) return;
    const existing = new Set(listing?.entries.map((e) => e.name));
    const conflicts = files.filter((f) => existing.has(f.name));
    if (conflicts.length === 0) {
      doUpload(files, false);
      return;
    }
    setDialog({
      kind: "confirm",
      title: "Overwrite files?",
      confirmText: "Overwrite",
      danger: true,
      message: (
        <>
          <p>File berikut sudah ada dan akan ditimpa:</p>
          <ul className="mt-2 max-h-40 list-inside list-disc overflow-auto font-mono text-xs text-slate-300">
            {conflicts.map((f) => (
              <li key={f.name}>{f.name}</li>
            ))}
          </ul>
        </>
      ),
      onConfirm: async () => {
        doUpload(files, true);
      },
    });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    startUpload(Array.from(e.dataTransfer.files));
  };

  // ---- render ----------------------------------------------------------------

  const btn =
    "flex items-center gap-2 rounded-md border border-base-border bg-base px-3 py-2 text-sm text-slate-300 transition-colors hover:border-slate-600 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40";
  const iconBtn = "rounded p-1.5 text-slate-400 transition-colors hover:bg-base-hover hover:text-slate-100";

  return (
    <div
      className="relative mx-auto max-w-7xl space-y-4"
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        dragDepth.current++;
        setDragging(true);
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3">
        <FolderOpen className="h-6 w-6 text-accent-green" />
        <h1 className="text-xl font-semibold text-slate-100">File Manager</h1>
        {listing && (
          <span
            className="ml-auto max-w-full truncate rounded-md border border-base-border bg-base-panel px-3 py-1 font-mono text-xs text-slate-400"
            title="File manager root"
          >
            root: {listing.root}
          </span>
        )}
      </header>

      <div className="rounded-xl border border-base-border bg-base-panel">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 border-b border-base-border p-3">
          <button type="button" className={btn} onClick={() => navigate(parentOf(currentPath))} disabled={currentPath === "/"}>
            <ArrowUp className="h-4 w-4" />
            <span className="hidden sm:inline">Up</span>
          </button>
          <button type="button" className={btn} onClick={load} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button type="button" className={btn} onClick={newFolder} disabled={!listing}>
            <FolderPlus className="h-4 w-4" />
            <span className="hidden sm:inline">New Folder</span>
          </button>
          <button type="button" className={btn} onClick={newFile} disabled={!listing}>
            <FilePlus className="h-4 w-4" />
            <span className="hidden sm:inline">New File</span>
          </button>
          <button
            type="button"
            className={`${btn} border-accent-green/40 text-accent-green hover:border-accent-green`}
            onClick={() => fileInputRef.current?.click()}
            disabled={!listing || upload !== null}
          >
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Upload</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              startUpload(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          {selected.size > 0 && (
            <button
              type="button"
              className={`${btn} border-red-500/40 text-red-400 hover:border-red-500 hover:text-red-300`}
              onClick={() => remove(Array.from(selected))}
            >
              <Trash2 className="h-4 w-4" />
              Delete ({selected.size})
            </button>
          )}

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

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 overflow-x-auto border-b border-base-border px-3 py-2 font-mono text-sm">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-accent-green hover:bg-base-hover"
          >
            <Home className="h-4 w-4" />
          </button>
          {breadcrumbs.map((b, i) => (
            <span key={b.path} className="flex shrink-0 items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
              <button
                type="button"
                onClick={() => navigate(b.path)}
                className={[
                  "rounded px-1.5 py-0.5 hover:bg-base-hover",
                  i === breadcrumbs.length - 1 ? "text-slate-100" : "text-slate-400",
                ].join(" ")}
              >
                {b.name}
              </button>
            </span>
          ))}
        </nav>

        {/* Upload progress */}
        {upload && (
          <div className="border-b border-base-border px-3 py-2">
            <div className="mb-1 flex justify-between font-mono text-xs text-slate-400">
              <span>Uploading…</span>
              <span>
                {formatBytes(upload.loaded)} / {formatBytes(upload.total)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-accent-green transition-all"
                style={{ width: `${upload.total ? (upload.loaded / upload.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* File table */}
        <div className="overflow-x-auto">
          {loadError ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <AlertCircle className="h-8 w-8 text-red-400" />
              <p className="text-sm text-red-300">{loadError}</p>
              <button type="button" className={btn} onClick={() => navigate("/")}>
                <Home className="h-4 w-4" /> Back to root
              </button>
            </div>
          ) : !listing ? (
            <div className="flex justify-center py-16 text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base-border text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="accent-green-500"
                      aria-label="Select all"
                    />
                  </th>
                  <th className="w-full px-3 py-2 font-medium">Name</th>
                  <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Size</th>
                  <th className="hidden px-3 py-2 font-medium md:table-cell">Permissions</th>
                  <th className="hidden px-3 py-2 font-medium lg:table-cell">Owner</th>
                  <th className="hidden px-3 py-2 font-medium md:table-cell">Modified</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-slate-500">
                      {filter ? "Tidak ada yang cocok dengan filter." : "Folder kosong — seret file ke sini untuk upload."}
                    </td>
                  </tr>
                )}
                {entries.map((entry) => {
                  const isSelected = selected.has(entry.path);
                  return (
                    <tr
                      key={entry.path}
                      className={[
                        "border-b border-base-border/60 transition-colors last:border-0",
                        isSelected ? "bg-accent-green/5" : "hover:bg-base-hover/60",
                      ].join(" ")}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(entry.path)}
                          className="accent-green-500"
                          aria-label={`Select ${entry.name}`}
                        />
                      </td>
                      <td className="max-w-0 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => open(entry)}
                          className="flex max-w-full items-center gap-2 text-left text-slate-200 hover:text-accent-green"
                          title={entry.name}
                        >
                          <FileIcon entry={entry} />
                          <span className="truncate">{entry.name}</span>
                        </button>
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-2 text-right font-mono text-xs text-slate-400 sm:table-cell">
                        {entry.type === "dir" ? "—" : formatBytes(entry.size)}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-2 md:table-cell">
                        <button
                          type="button"
                          onClick={() => chmod(entry)}
                          className="rounded px-1 font-mono text-xs text-slate-400 hover:bg-base-hover hover:text-accent-blue"
                          title="Change permissions"
                        >
                          {entry.permissions} <span className="text-slate-600">{entry.mode}</span>
                        </button>
                      </td>
                      <td className="hidden px-3 py-2 font-mono text-xs text-slate-400 lg:table-cell">{entry.owner}</td>
                      <td className="hidden whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-400 md:table-cell">
                        {formatDate(entry.modified)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-0.5">
                          {entry.type !== "dir" && (
                            <>
                              <button
                                type="button"
                                className={`${iconBtn} hidden sm:block`}
                                onClick={() => setEditing(entry.path)}
                                title="Edit"
                              >
                                <SquarePen className="h-4 w-4" />
                              </button>
                              <button type="button" className={iconBtn} onClick={() => download(entry)} title="Download">
                                <Download className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          <button type="button" className={iconBtn} onClick={() => rename(entry)} title="Rename">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className={`${iconBtn} md:hidden`}
                            onClick={() => chmod(entry)}
                            title="Permissions"
                          >
                            <KeyRound className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className={`${iconBtn} hover:!text-red-400`}
                            onClick={() => remove([entry.path])}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {listing && (
          <div className="border-t border-base-border px-3 py-2 font-mono text-xs text-slate-500">
            {listing.entries.filter((e) => e.type === "dir").length} folders ·{" "}
            {listing.entries.filter((e) => e.type !== "dir").length} files
            {selected.size > 0 && ` · ${selected.size} selected`}
          </div>
        )}
      </div>

      {/* Drag & drop overlay */}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-base/80 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-accent-green px-12 py-10 text-center">
            <Upload className="mx-auto mb-3 h-10 w-10 text-accent-green" />
            <p className="text-slate-200">Lepaskan untuk upload ke</p>
            <p className="mt-1 font-mono text-sm text-accent-green">{currentPath}</p>
          </div>
        </div>
      )}

      {/* Prompt / confirm dialog */}
      {dialog && (
        <Modal
          title={dialog.title}
          onClose={() => !dialogBusy && setDialog(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setDialog(null)}
                disabled={dialogBusy}
                className="rounded-md px-4 py-2 text-sm text-slate-300 hover:bg-base-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runDialog}
                disabled={dialogBusy || (dialog.kind === "prompt" && !dialogValue.trim())}
                className={[
                  "flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-40",
                  dialog.kind === "confirm" && dialog.danger
                    ? "bg-red-500 text-white hover:bg-red-400"
                    : "bg-accent-green text-slate-900 hover:bg-green-400",
                ].join(" ")}
              >
                {dialogBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                {dialog.confirmText}
              </button>
            </>
          }
        >
          {dialog.kind === "prompt" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runDialog();
              }}
            >
              <label className="mb-2 block text-xs uppercase tracking-wide text-slate-500">{dialog.label}</label>
              <input
                autoFocus
                value={dialogValue}
                onChange={(e) => setDialogValue(e.target.value)}
                onFocus={(e) => {
                  // select the name without its extension, like desktop file managers
                  const dot = e.target.value.lastIndexOf(".");
                  e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
                }}
                className="w-full rounded-md border border-base-border bg-base px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-accent-green/50"
              />
            </form>
          ) : (
            <div className="text-sm text-slate-300">{dialog.message}</div>
          )}
        </Modal>
      )}

      {editing && (
        <FileEditor
          path={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            notify("success", "Saved");
            load();
          }}
          onError={notifyError}
        />
      )}

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={[
              "flex items-start gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg",
              t.type === "success"
                ? "border-accent-green/40 bg-base-panel text-slate-200"
                : "border-red-500/40 bg-base-panel text-red-300",
            ].join(" ")}
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
