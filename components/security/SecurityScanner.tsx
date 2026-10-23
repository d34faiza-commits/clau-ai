"use client";

import { Bug, FileCog, FolderLock, KeyRound } from "lucide-react";
import ComplianceCard from "@/components/security/ComplianceCard";
import ScanCard from "@/components/security/ScanCard";

export default function SecurityScanner({ defaultDir }: { defaultDir: string }) {
  return (
    <div className="space-y-4">
      <ScanCard
        scanner="permissions"
        title="Permission Auditor"
        description="Finds world-writable files and folders, SUID bits, readable config files, exposed backups and .git folders."
        icon={FolderLock}
        iconClass="bg-accent-green/15 text-accent-green"
        fields={[{ name: "dir", label: "Directory", type: "text", defaultValue: defaultDir }]}
        buttonLabel="Run Audit"
      />
      <ScanCard
        scanner="credentials"
        title="Config Credential Scanner"
        description="Looks for passwords, API keys, tokens and private keys in config files. Secrets are masked in the results."
        icon={KeyRound}
        iconClass="bg-amber-400/15 text-amber-400"
        fields={[
          { name: "dir", label: "Directory", type: "text", defaultValue: defaultDir },
          { name: "maxFiles", label: "Max files", type: "number", defaultValue: 5000, min: 1, max: 100000, className: "w-32" },
        ]}
        buttonLabel="Scan"
      />
      <ScanCard
        scanner="webshell"
        title="Webshell / Backdoor Detector"
        description="Scans PHP files for eval(base64_decode(…)), shell execution from user input, known webshells and obfuscation."
        icon={Bug}
        iconClass="bg-red-500/15 text-red-400"
        fields={[{ name: "dir", label: "Directory", type: "text", defaultValue: defaultDir }]}
        buttonLabel="Scan Now"
        danger
      />
      <ScanCard
        scanner="phpini"
        title="PHP.INI Security Auditor"
        description="Checks expose_php, display_errors, allow_url_include, disable_functions, open_basedir, session cookie flags and PHP version support."
        icon={FileCog}
        iconClass="bg-accent-blue/15 text-accent-blue"
        fields={[]}
        buttonLabel="Audit PHP Config"
      />
      <ComplianceCard />
    </div>
  );
}
