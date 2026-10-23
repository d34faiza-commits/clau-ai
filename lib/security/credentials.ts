import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import type { CheckResult, ScanReport } from "./types";
import { rel, resolveScanDir, walk } from "./fs-walk";

const CONFIG_NAME =
  /^(\.env(\..*)?|wp-config\.php|configuration\.php|config\.php|settings\.php|database\.php|local\.xml|env\.php|parameters\.ya?ml|\.htpasswd|.*\.(ini|conf|cnf|ya?ml|json|xml|properties|env))$/i;
const MAX_FILE_BYTES = 1024 * 1024;

type Rule = { name: string; regex: RegExp; severity: "FAIL" | "WARN" };

// Each regex captures the secret value in its last group, which is then masked.
const RULES: Rule[] = [
  { name: "Private key", regex: /(-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----)/, severity: "FAIL" },
  { name: "AWS access key", regex: /\b(AKIA[0-9A-Z]{16})\b/, severity: "FAIL" },
  { name: "Stripe live key", regex: /\b(sk_live_[0-9a-zA-Z]{16,})/, severity: "FAIL" },
  { name: "GitHub token", regex: /\b(gh[pousr]_[0-9A-Za-z]{30,})/, severity: "FAIL" },
  { name: "Slack token", regex: /\b(xox[baprs]-[0-9A-Za-z-]{10,})/, severity: "FAIL" },
  { name: "Anthropic / OpenAI key", regex: /\b(sk-(?:ant-|proj-)?[0-9A-Za-z_-]{20,})/, severity: "FAIL" },
  {
    name: "WordPress DB password",
    regex: /define\(\s*['"]DB_PASSWORD['"]\s*,\s*['"]([^'"]+)['"]/i,
    severity: "WARN",
  },
  {
    name: "Password assignment",
    regex: /\b[\w.-]*(?:pass(?:word|wd)?|secret|api[_-]?key|token|auth[_-]?key)[\w.-]*['"]?\s*(?:=>|=|:)\s*['"]?([^\s'",;#]{4,})/i,
    severity: "WARN",
  },
];

function mask(secret: string): string {
  if (secret.startsWith("-----BEGIN")) return secret;
  return secret.length <= 4 ? "****" : `${secret.slice(0, 2)}${"*".repeat(Math.min(8, secret.length - 2))}`;
}

const PLACEHOLDER = /^(\$|%|\{|<|null|none|false|true|changeme|password|secret|example|your|xxx|\*+$|process\.env|env\(|getenv)/i;

export async function scanCredentials(dirInput: string, maxFiles: number): Promise<ScanReport> {
  const started = Date.now();
  const root = await resolveScanDir(dirInput);
  const results: CheckResult[] = [];
  let configFiles = 0;

  const { files, truncated } = await walk(root, maxFiles, async (abs, stat, isDir) => {
    if (isDir || stat.size > MAX_FILE_BYTES || !CONFIG_NAME.test(path.basename(abs))) return;
    configFiles++;
    let text: string;
    try {
      text = await fs.readFile(abs, "utf8");
    } catch {
      return;
    }
    const worldReadable = (stat.mode & 0o004) !== 0;
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.length > 2000) continue;
      for (const rule of RULES) {
        const m = line.match(rule.regex);
        if (!m) continue;
        const secret = m[m.length - 1];
        if (rule.name === "Password assignment" && PLACEHOLDER.test(secret)) break;
        results.push({
          check: `${rel(root, abs)}:${i + 1}`,
          status: rule.severity === "FAIL" || worldReadable ? "FAIL" : "WARN",
          detail: `${rule.name}: ${mask(secret)}${worldReadable ? " (file is world-readable)" : ""}`,
          recommendation:
            rule.severity === "FAIL"
              ? "Rotate this credential immediately and keep it out of the web root"
              : worldReadable
                ? `chmod 640 ${rel(root, abs)} and move secrets outside the public directory`
                : "Ensure this file is not served by the web server",
        });
        break; // one finding per line
      }
      if (results.length >= 500) return;
    }
  });

  if (results.length === 0) {
    results.push({
      check: "Hardcoded credentials",
      status: "PASS",
      detail: `No exposed secrets in ${configFiles} config file(s)`,
      recommendation: "No action needed",
    });
  }

  return { scanner: "credentials", target: root, durationMs: Date.now() - started, scannedFiles: files, truncated, results };
}
