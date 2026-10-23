"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Loader2, Lock, LogIn, Terminal, User } from "lucide-react";

export default function LoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      // only follow same-site relative paths
      const next = searchParams.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  };

  const input =
    "w-full rounded-md border border-base-border bg-base py-2.5 pl-10 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-accent-green/50";

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex items-center justify-center gap-2 text-accent-green">
        <Terminal className="h-7 w-7" />
        <span className="font-mono text-2xl font-bold tracking-tight">clau-ai</span>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-xl border border-base-border bg-base-panel p-6 shadow-2xl">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">Server Control Panel</p>
        </div>

        {!configured && (
          <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-300">
            Login belum dikonfigurasi. Jalankan <code className="font-mono">npm run setup</code> di server, lalu restart
            aplikasi.
          </div>
        )}

        <label className="relative block">
          <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            className={input}
            placeholder="Username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="relative block">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            className={input}
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error && (
          <p className="flex items-start gap-2 text-sm text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !configured}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-accent-green py-2.5 text-sm font-semibold text-slate-900 hover:bg-green-400 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          Sign in
        </button>
      </form>
    </div>
  );
}
