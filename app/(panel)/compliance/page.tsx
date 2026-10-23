import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";
import ComplianceCard from "@/components/security/ComplianceCard";

export const metadata: Metadata = { title: "Compliance — clau-ai" };

export default function CompliancePage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex items-center gap-3">
        <ClipboardCheck className="h-6 w-6 text-accent-green" />
        <h1 className="text-xl font-semibold text-slate-100">Compliance</h1>
      </header>
      <ComplianceCard />
      <p className="text-xs text-slate-500">
        Automated technical checks support an audit but do not replace one: SOC 2 and ISO 27001 also require
        documented policies, risk assessments and evidence of operating controls.
      </p>
    </div>
  );
}
