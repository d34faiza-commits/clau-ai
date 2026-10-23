import "server-only";
import os from "node:os";
import { runCommand } from "@/lib/security/host";
import type { CheckResult, ScanReport } from "@/lib/security/types";

export async function topProcesses(): Promise<ScanReport> {
  const started = Date.now();
  const out = await runCommand("ps", ["-eo", "pid=,user=,pcpu=,pmem=,rss=,comm=", "--sort=-pcpu"]);
  if (out === null) {
    return { scanner: "processes", durationMs: 0, results: [{ check: "ps", status: "FAIL", detail: "ps is not available", recommendation: "apt install procps" }] };
  }
  const rows = out.trim().split("\n").slice(0, 15);
  const cores = os.cpus().length;
  const results: CheckResult[] = rows.map((line) => {
    const [pid, user, cpu, mem, rss, ...comm] = line.trim().split(/\s+/);
    const cpuN = Number(cpu);
    const memN = Number(mem);
    const heavy = cpuN >= 80 || memN >= 40;
    return {
      check: `${comm.join(" ")} (pid ${pid})`,
      status: heavy ? "WARN" : "INFO",
      detail: `user ${user} · CPU ${cpu}% · RAM ${mem}% (${(Number(rss) / 1024).toFixed(0)} MB)`,
      recommendation: heavy ? `High usage — inspect with: top -p ${pid}` : "—",
    };
  });
  const [l1] = os.loadavg();
  results.unshift({
    check: "Load average (1 min)",
    status: l1 > cores ? "WARN" : "PASS",
    detail: `${l1.toFixed(2)} on ${cores} core(s)`,
    recommendation: l1 > cores ? "CPU is saturated — find the busy processes below" : "No action needed",
  });
  return { scanner: "processes", durationMs: Date.now() - started, results };
}
