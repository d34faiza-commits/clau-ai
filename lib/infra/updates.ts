import "server-only";
import { exists, runCommand } from "@/lib/security/host";
import type { CheckResult, ScanReport } from "@/lib/security/types";

export async function scanUpdates(): Promise<ScanReport> {
  const started = Date.now();
  const results: CheckResult[] = [];

  const apt = await runCommand("apt", ["list", "--upgradable"], 30_000);
  if (apt !== null) {
    // "pkg/noble-security 1.2 amd64 [upgradable from: 1.1]"
    const lines = apt.split("\n").filter((l) => l.includes("[upgradable from"));
    const security = lines.filter((l) => /-security/.test(l.split(" ")[0]));
    const name = (l: string) => l.split("/")[0];
    results.push({
      check: "Security updates",
      status: security.length ? "FAIL" : "PASS",
      detail: security.length
        ? `${security.length} pending: ${security.slice(0, 15).map(name).join(", ")}${security.length > 15 ? " …" : ""}`
        : "No pending security updates",
      recommendation: security.length ? "sudo apt update && sudo apt upgrade" : "No action needed",
    });
    results.push({
      check: "Other updates",
      status: lines.length - security.length > 0 ? "WARN" : "PASS",
      detail: `${lines.length - security.length} package(s) can be upgraded`,
      recommendation: lines.length - security.length > 0 ? "Review and apply during a maintenance window" : "No action needed",
    });
    const stamp = await runCommand("stat", ["-c", "%Y", "/var/lib/apt/periodic/update-success-stamp"]);
    const listsAge = stamp ? Math.floor((Date.now() / 1000 - Number(stamp)) / 86400) : null;
    results.push({
      check: "Package lists freshness",
      status: listsAge === null || listsAge > 7 ? "WARN" : "PASS",
      detail: listsAge === null ? "Unknown when `apt update` last ran" : `Last apt update ${listsAge} day(s) ago`,
      recommendation: listsAge === null || listsAge > 7 ? "Run sudo apt update so this check sees new updates" : "No action needed",
    });
  } else {
    const dnf = await runCommand("dnf", ["-q", "--cacheonly", "updateinfo", "list", "--security"], 30_000);
    results.push(
      dnf === null
        ? { check: "Package manager", status: "INFO", detail: "Neither apt nor dnf is available", recommendation: "—" }
        : {
            check: "Security updates",
            status: dnf.trim() ? "FAIL" : "PASS",
            detail: dnf.trim() ? `${dnf.trim().split("\n").length} security advisories pending` : "No pending security updates",
            recommendation: dnf.trim() ? "sudo dnf upgrade --security" : "No action needed",
          },
    );
  }

  results.push(
    (await exists("/var/run/reboot-required"))
      ? { check: "Reboot required", status: "WARN", detail: "Installed updates need a reboot (e.g. new kernel)", recommendation: "Schedule a reboot" }
      : { check: "Reboot required", status: "PASS", detail: "No reboot pending", recommendation: "No action needed" },
  );

  const kernel = await runCommand("uname", ["-r"]);
  if (kernel) results.push({ check: "Running kernel", status: "INFO", detail: kernel.trim(), recommendation: "—" });

  return { scanner: "updates", durationMs: Date.now() - started, results };
}
