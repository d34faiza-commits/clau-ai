import type { Metadata } from "next";
import os from "node:os";
import { ScanSearch } from "lucide-react";
import InfraScan from "@/components/infra/InfraScan";

export const metadata: Metadata = { title: "Infra Scan — clau-ai" };
export const dynamic = "force-dynamic";

export default function InfraScanPage() {
  // Prefill the SSL checker with the server's hostname when it looks like a real domain
  const hostname = os.hostname();
  const defaultDomain = hostname.includes(".") ? hostname : "";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex items-center gap-3">
        <ScanSearch className="h-6 w-6 text-accent-green" />
        <h1 className="text-xl font-semibold text-slate-100">Infra Scan</h1>
      </header>
      <InfraScan defaultDomain={defaultDomain} />
    </div>
  );
}
