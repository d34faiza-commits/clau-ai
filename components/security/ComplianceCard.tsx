"use client";

import { ClipboardCheck } from "lucide-react";
import ScanCard from "@/components/security/ScanCard";
import { FRAMEWORKS } from "@/lib/security/types";

export default function ComplianceCard() {
  return (
    <ScanCard
      endpoint="/api/security/compliance"
      title="Compliance"
      description="Server hardening checks mapped to SOC 2 Trust Services Criteria and ISO 27001:2022 Annex A controls."
      icon={ClipboardCheck}
      iconClass="bg-accent-blue/15 text-accent-blue"
      fields={[{ name: "framework", label: "Framework", type: "select", defaultValue: "both", options: FRAMEWORKS, className: "min-w-[220px]" }]}
      buttonLabel="Run All Checks"
    />
  );
}
