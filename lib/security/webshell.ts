import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import type { CheckResult, ScanReport } from "./types";
import { rel, resolveScanDir, walk } from "./fs-walk";

const PHP_FILE = /\.(php\d?|phtml|phar|inc|pht)$/i;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FINDINGS = 500;
const INPUT = String.raw`\$_(?:GET|POST|REQUEST|COOKIE|SERVER|FILES)`;

type Signature = { name: string; regex: RegExp; severity: "FAIL" | "WARN"; advice: string };

const QUARANTINE = "Quarantine the file (move it outside the web root), review it and restore from a clean backup";

const SIGNATURES: Signature[] = [
  {
    name: "eval() of decoded payload",
    regex: /\b(?:eval|assert)\s*\(\s*(?:@?\s*)?(?:base64_decode|gzinflate|gzuncompress|gzdecode|str_rot13|strrev|hex2bin|convert_uudecode)\s*\(/i,
    severity: "FAIL",
    advice: QUARANTINE,
  },
  {
    name: "Code execution from user input",
    regex: new RegExp(String.raw`\b(?:eval|assert|system|shell_exec|passthru|exec|popen|proc_open|pcntl_exec)\s*\([^;]*${INPUT}`, "i"),
    severity: "FAIL",
    advice: QUARANTINE,
  },
  {
    name: "Backtick shell execution with user input",
    regex: new RegExp("`[^`]*" + INPUT + "[^`]*`"),
    severity: "FAIL",
    advice: QUARANTINE,
  },
  {
    name: "Dynamic function call from user input",
    regex: new RegExp(String.raw`${INPUT}\s*\[[^\]]+\]\s*\(`, "i"),
    severity: "FAIL",
    advice: QUARANTINE,
  },
  {
    name: "preg_replace /e code execution",
    regex: /preg_replace\s*\(\s*(['"])(.).*\2[a-z]*e[a-z]*\1/i,
    severity: "FAIL",
    advice: QUARANTINE,
  },
  {
    name: "Known webshell signature",
    regex: /\b(?:c99shell|r57shell|b374k|WSO\s*\d|FilesMan|IndoXploit|Mini\s*Shell|AnonymousFox|alfa[\s_-]?shell|weevely)\b/i,
    severity: "FAIL",
    advice: QUARANTINE,
  },
  {
    name: "Obfuscated variable function",
    regex: /\$\w+\s*=\s*['"](?:as|ba|ev|sy|sh)['"]\s*\.\s*['"]/i,
    severity: "WARN",
    advice: "Review: string-built function names are a common obfuscation trick",
  },
  {
    name: "create_function() usage",
    regex: /\bcreate_function\s*\(/i,
    severity: "WARN",
    advice: "Deprecated and often abused; review and replace with a closure",
  },
  {
    name: "Shell command function",
    regex: /\b(?:system|shell_exec|passthru|proc_open|popen|pcntl_exec)\s*\(/i,
    severity: "WARN",
    advice: "Verify this is legitimate application code; consider disable_functions in php.ini",
  },
  {
    name: "Large encoded blob",
    regex: /['"][A-Za-z0-9+/=]{1500,}['"]/,
    severity: "WARN",
    advice: "Inspect the decoded content; long base64 strings often hide payloads",
  },
];

function snippet(line: string, index: number): string {
  const start = Math.max(0, index - 30);
  const text = line.slice(start, start + 140).trim();
  return (start > 0 ? "…" : "") + text + (line.length > start + 140 ? "…" : "");
}

export async function scanWebshells(dirInput: string, maxFiles: number): Promise<ScanReport> {
  const started = Date.now();
  const root = await resolveScanDir(dirInput);
  const results: CheckResult[] = [];
  let phpFiles = 0;

  const { files, truncated } = await walk(root, maxFiles, async (abs, stat, isDir) => {
    if (isDir || results.length >= MAX_FINDINGS) return;
    const name = path.basename(abs);
    if (!PHP_FILE.test(name) || stat.size > MAX_FILE_BYTES) return;
    phpFiles++;

    const r = rel(root, abs);
    // PHP in an upload folder is a classic webshell drop location
    if (/(^|\/)(uploads?|images?|media|tmp|cache)(\/|$)/i.test(path.dirname(r))) {
      results.push({
        check: r,
        status: "WARN",
        detail: "PHP file inside an upload/media folder",
        recommendation: "Block PHP execution in upload folders and verify this file",
      });
    }

    let text: string;
    try {
      text = await fs.readFile(abs, "utf8");
    } catch {
      return;
    }
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const sig of SIGNATURES) {
        const m = sig.regex.exec(line);
        if (!m) continue;
        results.push({
          check: `${r}:${i + 1}`,
          status: sig.severity,
          detail: `${sig.name} — ${snippet(line, m.index)}`,
          recommendation: sig.advice,
        });
        break; // most severe signature per line
      }
      if (results.length >= MAX_FINDINGS) return;
    }
  });

  // most severe first
  results.sort((a, b) => (a.status === b.status ? 0 : a.status === "FAIL" ? -1 : 1));

  if (results.length === 0) {
    results.push({
      check: "Webshell / backdoor patterns",
      status: "PASS",
      detail: `No suspicious patterns in ${phpFiles} PHP file(s)`,
      recommendation: "Keep scanning regularly and after every plugin/theme install",
    });
  }

  return { scanner: "webshell", target: root, durationMs: Date.now() - started, scannedFiles: files, truncated, results };
}
