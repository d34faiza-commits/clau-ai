import "server-only";
import tls from "node:tls";
import { FileError } from "@/lib/files";
import type { CheckResult, ScanReport } from "@/lib/security/types";

const HOST_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;
const MAX_DOMAINS = 20;
const WARN_DAYS = 21;

type Target = { host: string; port: number };

const TRUST_ERRORS: Record<string, string> = {
  DEPTH_ZERO_SELF_SIGNED_CERT: "self-signed certificate",
  SELF_SIGNED_CERT_IN_CHAIN: "self-signed certificate in the chain",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "incomplete chain (missing intermediate certificate)",
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY: "issuer not trusted (missing intermediate or private CA)",
  CERT_UNTRUSTED: "certificate not trusted",
};

export function parseTargets(input: unknown): Target[] {
  if (typeof input !== "string") throw new FileError("Enter at least one domain");
  const items = input
    .split(/[\s,]+/)
    .map((s) => s.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, ""))
    .filter(Boolean);
  if (!items.length) throw new FileError("Enter at least one domain");
  if (items.length > MAX_DOMAINS) throw new FileError(`Maximum ${MAX_DOMAINS} domains per check`);
  return [...new Set(items)].map((item) => {
    const [host, portStr] = item.split(":");
    const port = portStr ? Number(portStr) : 443;
    if (!HOST_RE.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new FileError(`Invalid domain: ${item}`);
    }
    return { host: host.toLowerCase(), port };
  });
}

function inspect({ host, port }: Target): Promise<CheckResult> {
  const label = port === 443 ? host : `${host}:${port}`;
  return new Promise((resolve) => {
    const done = (r: Omit<CheckResult, "check">) => resolve({ check: label, ...r });
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: 8000 }, () => {
      const cert = socket.getPeerCertificate();
      const protocol = socket.getProtocol() ?? "unknown";
      const authorized = socket.authorized;
      const authError = socket.authorizationError ? String(socket.authorizationError) : "";
      socket.end();

      if (!cert || !cert.valid_to) return done({ status: "FAIL", detail: "No certificate presented", recommendation: "Install a certificate (e.g. certbot)" });

      const expires = new Date(cert.valid_to);
      const days = Math.floor((expires.getTime() - Date.now()) / 86_400_000);
      const issuer = cert.issuer?.O || cert.issuer?.CN || "unknown issuer";
      const base = `${issuer} · expires ${expires.toISOString().slice(0, 10)} (${days} days) · ${protocol}`;

      if (days < 0) return done({ status: "FAIL", detail: `Expired ${-days} day(s) ago · ${issuer}`, recommendation: "Renew now: sudo certbot renew" });
      // rejectUnauthorized:false skips the hostname check, so do it explicitly
      const identityError = tls.checkServerIdentity(host, cert);
      if (identityError) {
        const names = cert.subjectaltname?.replace(/DNS:/g, "") || cert.subject?.CN || "unknown";
        return done({
          status: "FAIL",
          detail: `Certificate is for ${names}, not ${host} · ${base}`,
          recommendation: `Issue a certificate that includes ${host} (e.g. certbot -d ${host})`,
        });
      }
      if (!authorized) {
        const why = TRUST_ERRORS[authError] ?? authError.replace(/_/g, " ").toLowerCase();
        return done({ status: "FAIL", detail: `Not trusted: ${why} · ${base}`, recommendation: "Use a certificate from a public CA (Let's Encrypt) and serve the full chain" });
      }
      if (protocol === "TLSv1" || protocol === "TLSv1.1") {
        return done({ status: "WARN", detail: base, recommendation: "Disable TLS 1.0/1.1; allow only TLS 1.2 and 1.3" });
      }
      if (days <= WARN_DAYS) return done({ status: "WARN", detail: base, recommendation: "Renew soon — check that certbot's renewal timer works" });
      return done({ status: "PASS", detail: base, recommendation: "No action needed" });
    });
    socket.on("timeout", () => {
      socket.destroy();
      done({ status: "FAIL", detail: `No response on port ${port} within 8s`, recommendation: "Check DNS, firewall and that the web server listens on 443" });
    });
    socket.on("error", (err: NodeJS.ErrnoException) => {
      const reason =
        err.code === "ENOTFOUND" ? "domain does not resolve (DNS)" : err.code === "ECONNREFUSED" ? `nothing listening on port ${port}` : err.message;
      done({ status: "FAIL", detail: `Connection failed: ${reason}`, recommendation: "Check DNS records and the web server's HTTPS listener" });
    });
  });
}

export async function checkSsl(domains: unknown): Promise<ScanReport> {
  const started = Date.now();
  const targets = parseTargets(domains);
  const results = await Promise.all(targets.map(inspect));
  return { scanner: "ssl", durationMs: Date.now() - started, results };
}
