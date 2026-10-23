import "server-only";
import { runCommand, runningProcesses } from "@/lib/security/host";
import type { CheckResult, ScanReport } from "@/lib/security/types";

// Services a web server usually depends on: [label, process names, systemd unit prefixes]
const KEY_SERVICES: [string, string[], string[]][] = [
  ["Web server", ["litespeed", "lshttpd", "openlitespeed", "nginx", "apache2", "httpd", "caddy"], ["lsws", "lshttpd", "nginx", "apache2", "httpd", "caddy"]],
  ["Database", ["mariadbd", "mysqld", "postgres"], ["mariadb", "mysql", "mysqld", "postgresql"]],
  ["PHP", ["php-fpm", "lsphp"], ["php"]],
  ["SSH", ["sshd"], ["ssh", "sshd"]],
  ["Cron", ["cron", "crond"], ["cron", "crond"]],
];

export async function scanServices(): Promise<ScanReport> {
  const started = Date.now();
  const results: CheckResult[] = [];
  const procs = await runningProcesses();

  const systemdState = (await runCommand("systemctl", ["is-system-running"]))?.trim();
  const hasSystemd = !!systemdState && systemdState !== "offline";

  let failed: string[] = [];
  let running: string[] = [];
  if (hasSystemd) {
    const failedOut = await runCommand("systemctl", ["list-units", "--type=service", "--state=failed", "--no-legend", "--plain", "--no-pager"]);
    failed = (failedOut ?? "").split("\n").map((l) => l.trim().split(/\s+/)[0]).filter(Boolean);
    const runningOut = await runCommand("systemctl", ["list-units", "--type=service", "--state=running", "--no-legend", "--plain", "--no-pager"]);
    running = (runningOut ?? "").split("\n").map((l) => l.trim().split(/\s+/)[0]).filter(Boolean);
  }

  for (const [label, names, units] of KEY_SERVICES) {
    const proc = names.find((n) => [...procs].some((p) => p.startsWith(n)));
    const unit = running.find((u) => units.some((prefix) => u.startsWith(prefix)));
    results.push(
      proc || unit
        ? { check: label, status: "PASS", detail: `Running (${unit ?? proc})`, recommendation: "No action needed" }
        : { check: label, status: "WARN", detail: `No ${names.slice(0, 3).join(" / ")} process found`, recommendation: "Ignore if this server does not need it" },
    );
  }

  if (hasSystemd) {
    results.push(
      failed.length
        ? { check: "Failed systemd units", status: "FAIL", detail: failed.join(", "), recommendation: "Inspect with: systemctl status <unit> && journalctl -u <unit> -n 50" }
        : { check: "Failed systemd units", status: "PASS", detail: "No failed services", recommendation: "No action needed" },
    );
    results.push({
      check: "System state",
      status: systemdState === "running" ? "PASS" : "WARN",
      detail: `systemctl is-system-running: ${systemdState}`,
      recommendation: systemdState === "running" ? "No action needed" : "Run: systemctl --failed",
    });
    for (const unit of running) {
      results.push({ check: unit, status: "INFO", detail: "running", recommendation: "—" });
    }
  } else {
    results.push({
      check: "systemd",
      status: "INFO",
      detail: "systemd is not available (container or non-systemd init) — showing process-based checks only",
      recommendation: "—",
    });
  }

  return { scanner: "services", durationMs: Date.now() - started, results };
}
