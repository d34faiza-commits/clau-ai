import type { Metadata } from "next";
import { Shield } from "lucide-react";
import SecurityScanner from "@/components/security/SecurityScanner";
import { ROOT } from "@/lib/files";

export const metadata: Metadata = { title: "Security — clau-ai" };
export const dynamic = "force-dynamic";

export default function SecurityPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-center gap-3">
        <Shield className="h-6 w-6 text-accent-green" />
        <h1 className="text-xl font-semibold text-slate-100">Security Scanner</h1>
        <span className="ml-auto rounded-md border border-base-border bg-base-panel px-3 py-1 font-mono text-xs text-slate-400">
          scan root: {ROOT}
        </span>
      </header>
      <SecurityScanner defaultDir={ROOT} />
    </div>
  );
}
