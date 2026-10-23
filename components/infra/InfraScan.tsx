"use client";

import { Activity, Network, PackageCheck, ServerCog, ShieldCheck } from "lucide-react";
import ScanCard from "@/components/security/ScanCard";

export default function InfraScan({ defaultDomain }: { defaultDomain: string }) {
  return (
    <div className="space-y-4">
      <ScanCard
        endpoint="/api/infra/ports"
        title="Open Ports"
        description="Lists every listening TCP/UDP port, which process owns it, and flags databases or caches exposed to the internet."
        icon={Network}
        iconClass="bg-accent-green/15 text-accent-green"
        fields={[]}
        buttonLabel="Scan Ports"
      />
      <ScanCard
        endpoint="/api/infra/ssl"
        title="SSL Certificate Checker"
        description="Connects to each domain over HTTPS and checks trust, domain match, expiry date and TLS version."
        icon={ShieldCheck}
        iconClass="bg-accent-blue/15 text-accent-blue"
        fields={[
          {
            name: "domains",
            label: "Domains (comma separated, max 20)",
            type: "text",
            defaultValue: defaultDomain,
            placeholder: "example.com, www.example.com, shop.example.com:8443",
          },
        ]}
        buttonLabel="Check SSL"
      />
      <ScanCard
        endpoint="/api/infra/services"
        title="Services"
        description="Status of the web server, database, PHP, SSH and cron, plus any failed systemd units."
        icon={ServerCog}
        iconClass="bg-amber-400/15 text-amber-400"
        fields={[]}
        buttonLabel="Check Services"
      />
      <ScanCard
        endpoint="/api/infra/updates"
        title="System Updates"
        description="Pending security and regular package updates, package list freshness and whether a reboot is required."
        icon={PackageCheck}
        iconClass="bg-red-500/15 text-red-400"
        fields={[]}
        buttonLabel="Check Updates"
      />
      <ScanCard
        endpoint="/api/infra/processes"
        title="Top Processes"
        description="The 15 processes using the most CPU right now, with memory usage and load average."
        icon={Activity}
        iconClass="bg-fuchsia-400/15 text-fuchsia-400"
        fields={[]}
        buttonLabel="Show Processes"
      />
    </div>
  );
}
