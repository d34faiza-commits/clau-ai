import "server-only";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Runs a fixed binary with fixed arguments — never through a shell. */
export async function runCommand(cmd: string, args: string[], timeout = 5000): Promise<string | null> {
  try {
    const { stdout } = await run(cmd, args, { timeout, maxBuffer: 4 * 1024 * 1024 });
    return stdout;
  } catch {
    return null;
  }
}

export async function readText(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
}

export async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

/** Names of running processes (lower-case `comm` values). */
export async function runningProcesses(): Promise<Set<string>> {
  const out = await runCommand("ps", ["-eo", "comm="]);
  return new Set((out ?? "").split("\n").map((p) => p.trim().toLowerCase()).filter(Boolean));
}

/**
 * Effective sshd settings: sshd_config plus sshd_config.d/*.conf. Like sshd,
 * the first value seen for a keyword wins (includes are read where they appear,
 * which on Debian/Ubuntu is at the top).
 */
export async function sshdConfig(): Promise<Map<string, string> | null> {
  const main = await readText("/etc/ssh/sshd_config");
  if (main === null) return null;
  const settings = new Map<string, string>();
  const apply = (text: string) => {
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      if (/^match\s/i.test(line)) break; // ignore conditional blocks
      const [key, ...rest] = line.split(/\s+/);
      const k = key.toLowerCase();
      if (k === "include") continue;
      if (!settings.has(k)) settings.set(k, rest.join(" ").toLowerCase());
    }
  };
  try {
    const dir = "/etc/ssh/sshd_config.d";
    const names = (await fs.readdir(dir)).filter((n) => n.endsWith(".conf")).sort();
    for (const n of names) apply((await readText(path.join(dir, n))) ?? "");
  } catch {
    // no drop-in directory
  }
  apply(main);
  return settings;
}

export type PhpIni = { version: string; iniFile: string | false; values: Record<string, string | false> };

const PHP_INI_KEYS = [
  "expose_php", "display_errors", "display_startup_errors", "log_errors", "allow_url_fopen",
  "allow_url_include", "disable_functions", "open_basedir", "enable_dl", "file_uploads",
  "session.cookie_httponly", "session.cookie_secure", "session.use_strict_mode",
  "session.cookie_samesite", "session.use_only_cookies",
];

export async function phpIni(): Promise<PhpIni | null> {
  const binary = process.env.PHP_BINARY || "php";
  const script = `echo json_encode(["version" => PHP_VERSION, "iniFile" => php_ini_loaded_file(), "values" => array_combine(${JSON.stringify(
    PHP_INI_KEYS,
  ).replace(/"/g, "'")}, array_map("ini_get", ${JSON.stringify(PHP_INI_KEYS).replace(/"/g, "'")}))]);`;
  const out = await runCommand(binary, ["-r", script]);
  if (!out) return null;
  try {
    return JSON.parse(out);
  } catch {
    return null;
  }
}

/** PHP branches with active (security) support as of late 2026. */
export function phpSupportStatus(version: string): { status: "PASS" | "WARN" | "FAIL"; note: string } {
  const [major, minor] = version.split(".").map(Number);
  const v = major * 100 + minor;
  if (v < 802) return { status: "FAIL", note: `PHP ${major}.${minor} is end-of-life and receives no security fixes` };
  if (v === 802) return { status: "WARN", note: "PHP 8.2 security support ends 31 Dec 2026" };
  return { status: "PASS", note: `PHP ${major}.${minor} is supported` };
}
