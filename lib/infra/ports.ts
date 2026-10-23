import "server-only";
import { runCommand } from "@/lib/security/host";
import type { CheckResult, ScanReport } from "@/lib/security/types";

type Risk = { name: string; publicStatus: "FAIL" | "WARN"; advice: string };

// Services that should almost never be reachable from the internet.
const RISKY: Record<number, Risk> = {
  21: { name: "FTP", publicStatus: "WARN", advice: "FTP sends passwords in clear text — use SFTP instead" },
  23: { name: "Telnet", publicStatus: "FAIL", advice: "Disable telnet and use SSH" },
  25: { name: "SMTP", publicStatus: "WARN", advice: "Make sure it is not an open relay" },
  111: { name: "rpcbind", publicStatus: "FAIL", advice: "Stop rpcbind or firewall it" },
  445: { name: "SMB", publicStatus: "FAIL", advice: "Never expose SMB to the internet" },
  2375: { name: "Docker API (no TLS)", publicStatus: "FAIL", advice: "Exposes root access — bind to a unix socket only" },
  3306: { name: "MySQL/MariaDB", publicStatus: "FAIL", advice: "Set bind-address = 127.0.0.1 in my.cnf or firewall port 3306" },
  5432: { name: "PostgreSQL", publicStatus: "FAIL", advice: "Set listen_addresses = 'localhost' or firewall port 5432" },
  5900: { name: "VNC", publicStatus: "FAIL", advice: "Tunnel VNC over SSH instead of exposing it" },
  6379: { name: "Redis", publicStatus: "FAIL", advice: "Set bind 127.0.0.1 and protected-mode yes in redis.conf" },
  9200: { name: "Elasticsearch", publicStatus: "FAIL", advice: "Bind to localhost and enable authentication" },
  11211: { name: "Memcached", publicStatus: "FAIL", advice: "Start memcached with -l 127.0.0.1 (also blocks UDP amplification)" },
  27017: { name: "MongoDB", publicStatus: "FAIL", advice: "Set net.bindIp: 127.0.0.1 and enable authorization" },
};

const KNOWN: Record<number, string> = {
  22: "SSH", 53: "DNS", 80: "HTTP", 443: "HTTPS", 465: "SMTPS", 587: "SMTP submission", 993: "IMAPS",
  995: "POP3S", 3000: "clau-ai / Node.js", 7080: "LiteSpeed WebAdmin", 8080: "HTTP alt", 8443: "HTTPS alt",
  8090: "CyberPanel", 2083: "cPanel", 2087: "WHM", 8083: "Hestia/Vesta",
};

type Listener = { proto: string; address: string; port: number; process: string };

function parseSs(out: string): Listener[] {
  const listeners: Listener[] = [];
  for (const line of out.split("\n")) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 5) continue;
    const proto = cols[0];
    const local = cols[4];
    const idx = local.lastIndexOf(":");
    const port = Number(local.slice(idx + 1));
    if (!Number.isInteger(port)) continue;
    const address = local.slice(0, idx).replace(/^\[|\]$/g, "").replace(/%.*$/, "");
    const proc = line.match(/users:\(\("([^"]+)"/)?.[1] ?? "";
    listeners.push({ proto, address, port, process: proc });
  }
  return listeners;
}

function isLocal(address: string): boolean {
  return address.startsWith("127.") || address === "::1" || address === "localhost";
}

export async function scanPorts(): Promise<ScanReport> {
  const started = Date.now();
  const out = await runCommand("ss", ["-H", "-tulnp"]);
  if (out === null) {
    return {
      scanner: "ports",
      durationMs: Date.now() - started,
      results: [{ check: "Listening ports", status: "FAIL", detail: "`ss` is not available", recommendation: "apt install iproute2" }],
    };
  }

  // de-duplicate IPv4/IPv6 twins of the same service
  const seen = new Set<string>();
  const listeners = parseSs(out)
    .filter((l) => {
      const key = `${l.proto}:${l.port}:${isLocal(l.address)}:${l.process}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.port - b.port);

  const results: CheckResult[] = listeners.map((l) => {
    const local = isLocal(l.address);
    const risk = RISKY[l.port];
    const service = risk?.name ?? KNOWN[l.port] ?? "";
    const where = local ? "localhost only" : l.address === "*" || l.address === "0.0.0.0" || l.address === "::" ? "all interfaces (public)" : l.address;
    const label = `${l.proto.toUpperCase()} ${l.port}${service ? ` · ${service}` : ""}`;
    const proc = l.process ? `process: ${l.process}` : "process: unknown (run as root to see)";

    if (risk && !local) {
      return { check: label, status: risk.publicStatus, detail: `Listening on ${where} — ${proc}`, recommendation: risk.advice };
    }
    if (l.port === 3000 && !local) {
      return { check: label, status: "WARN", detail: `Listening on ${where} — ${proc}`, recommendation: "Bind the panel to 127.0.0.1 and use Nginx in front" };
    }
    return {
      check: label,
      status: local ? "PASS" : "INFO",
      detail: `Listening on ${where} — ${proc}`,
      recommendation: local ? "Not reachable from outside" : "Make sure this port should be public, otherwise firewall it",
    };
  });

  results.sort((a, b) => ["FAIL", "WARN", "INFO", "PASS"].indexOf(a.status) - ["FAIL", "WARN", "INFO", "PASS"].indexOf(b.status));
  return { scanner: "ports", durationMs: Date.now() - started, results };
}
