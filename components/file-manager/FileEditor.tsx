"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Save } from "lucide-react";
import Modal from "@/components/Modal";

type FileEditorProps = {
  path: string;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
};

export default function FileEditor({ path, onClose, onSaved, onError }: FileEditorProps) {
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dirty = content !== original;

  // Keep the latest callbacks without re-running the load effect when the
  // parent re-renders (which would discard unsaved edits).
  const callbacks = useRef({ onClose, onError });
  callbacks.current = { onClose, onError };

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/files/content?path=${encodeURIComponent(path)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (cancelled) return;
        setContent(data.content);
        setOriginal(data.content);
        setLoading(false);
        textareaRef.current?.focus();
      })
      .catch((err: Error) => {
        if (cancelled) return;
        callbacks.current.onError(err.message);
        callbacks.current.onClose();
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  const save = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/files/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setOriginal(content);
      onSaved();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [content, path, saving, onSaved, onError]);

  const requestClose = useCallback(() => {
    if (dirty && !window.confirm("Perubahan belum disimpan. Tutup editor?")) return;
    onClose();
  }, [dirty, onClose]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      save();
      return;
    }
    if (e.key === "Tab") {
      // insert indentation instead of moving focus
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart: start, selectionEnd: end } = el;
      const next = content.slice(0, start) + "    " + content.slice(end);
      setContent(next);
      requestAnimationFrame(() => el.setSelectionRange(start + 4, start + 4));
    }
  };

  const lines = content.split("\n").length;

  return (
    <Modal
      title={`${dirty ? "● " : ""}${path}`}
      onClose={requestClose}
      wide
      footer={
        <>
          <span className="mr-auto self-center font-mono text-xs text-slate-500">
            {lines} lines · Ctrl+S to save
          </span>
          <button
            type="button"
            onClick={requestClose}
            className="rounded-md px-4 py-2 text-sm text-slate-300 hover:bg-base-hover"
          >
            Close
          </button>
          <button
            type="button"
            onClick={save}
            disabled={loading || saving || !dirty}
            className="flex items-center gap-2 rounded-md bg-accent-green px-4 py-2 text-sm font-medium text-slate-900 hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </>
      }
    >
      {loading ? (
        <div className="flex h-[60vh] items-center justify-center text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          className="h-[60vh] w-full resize-none rounded-lg border border-base-border bg-base p-4 font-mono text-sm leading-relaxed text-slate-200 outline-none focus:border-accent-green/50"
        />
      )}
    </Modal>
  );
}
