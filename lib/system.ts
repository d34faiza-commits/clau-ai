import "server-only";
import { execFile } from "node:child_process";
import { readFile, statfs } from "node:fs/promises";
import os from "node:os";
import { promisify } from "node:util";

const run = promisify(execFile);

export type SystemInfo = {
  hostname: string;
  os: string;
  kernel: string;
  uptimeSeconds: number;
  loadAverage: [number, number, number];
  cpuCores: number;
  php: {
    installed: boolean;
    version: string;
    memoryLimit: string;
    maxUpload: string;
    safeMode: string;
  };
  serverSoftware: string;
  memory: { totalBytes: number; usedBytes: number };
  disk: { totalBytes: number; usedBytes: number; freeBytes: number } | null;
  serverTime: string;
};

async function sh(cmd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await run(cmd, args, { timeout: 3000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function getOsName(): Promise<string> {
  try {
    const release = await readFile("/etc/os-release", "utf8");
    const match = release.match(/^PRETTY_NAME="?([^"\n]+)"?/m);
    if (match) return match[1];
  } catch {
    // not Linux or file missing — fall through
  }
  return os.type();
}

const PHP_SCRIPT = `echo json_encode([
  "version" => PHP_VERSION,
  "memory_limit" => ini_get("memory_limit"),
  "upload_max_filesize" => ini_get("upload_max_filesize"),
  "safe_mode" => ini_get("safe_mode"),
]);`;

async function getPhpInfo(): Promise<SystemInfo["php"]> {
  const binary = process.env.PHP_BINARY || "php";
  const out = await sh(binary, ["-r", PHP_SCRIPT]);
  if (!out) {
    return { installed: false, version: "Not installed", memoryLimit: "-", maxUpload: "-", safeMode: "-" };
  }
  try {
    const data = JSON.parse(out);
    // safe_mode was removed in PHP 5.4, so ini_get returns false/"" on modern PHP
    const safeOn = data.safe_mode === "1" || String(data.safe_mode).toLowerCase() === "on";
    return {
      installed: true,
      version: data.version,
      memoryLimit: data.memory_limit === "-1" ? "Unlimited" : data.memory_limit || "-",
      maxUpload: data.upload_max_filesize || "-",
      safeMode: safeOn ? "ON" : "OFF",
    };
  } catch {
    return { installed: true, version: "Unknown", memoryLimit: "-", maxUpload: "-", safeMode: "-" };
  }
}

const WEB_SERVERS: [RegExp, string][] = [
  [/^(litespeed|lshttpd|openlitespeed)/, "LiteSpeed"],
  [/^nginx/, "Nginx"],
  [/^(apache2|httpd)/, "Apache"],
  [/^caddy/, "Caddy"],
];

async function getServerSoftware(): Promise<string> {
  const out = await sh("ps", ["-eo", "comm="]);
  if (!out) return "Unknown";
  const processes = out.split("\n").map((p) => p.trim().toLowerCase());
  const found = WEB_SERVERS.filter(([re]) => processes.some((p) => re.test(p))).map(([, name]) => name);
  return found.length ? found.join(" + ") : "Not detected";
}

async function getDisk(): Promise<SystemInfo["disk"]> {
  try {
    const s = await statfs(process.env.DISK_PATH || "/");
    const totalBytes = s.blocks * s.bsize;
    const freeBytes = s.bavail * s.bsize;
    // used = total - free (incl. reserved blocks), matches `df`
    const usedBytes = totalBytes - s.bfree * s.bsize;
    return { totalBytes, usedBytes, freeBytes };
  } catch {
    return null;
  }
}

async function getMemory(): Promise<SystemInfo["memory"]> {
  const totalBytes = os.totalmem();
  try {
    // MemAvailable is what `free` reports; os.freemem() ignores reclaimable cache
    const meminfo = await readFile("/proc/meminfo", "utf8");
    const match = meminfo.match(/^MemAvailable:\s+(\d+) kB/m);
    if (match) return { totalBytes, usedBytes: totalBytes - Number(match[1]) * 1024 };
  } catch {
    // not Linux — fall through
  }
  return { totalBytes, usedBytes: totalBytes - os.freemem() };
}

export async function getSystemInfo(): Promise<SystemInfo> {
  const [osName, php, serverSoftware, disk, memory] = await Promise.all([
    getOsName(),
    getPhpInfo(),
    getServerSoftware(),
    getDisk(),
    getMemory(),
  ]);

  return {
    hostname: os.hostname(),
    os: osName,
    kernel: `${os.type()} ${os.release()}`,
    uptimeSeconds: os.uptime(),
    loadAverage: os.loadavg() as [number, number, number],
    cpuCores: os.cpus().length,
    php,
    serverSoftware,
    memory,
    disk,
    serverTime: new Date().toISOString(),
  };
}
