import "server-only";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { FileError } from "@/lib/files";
import { runCommand } from "@/lib/security/host";

export type PhpBinary = { path: string; version: string };

export type IniEntry = { name: string; global: string; local: string; access: number };

export type PhpInfo = {
  binary: string;
  version: string;
  sapi: string;
  zend: string;
  os: string;
  uname: string;
  iniFile: string | false;
  scannedIni: string[];
  extensions: { name: string; version: string }[];
  zendExtensions: string[];
  ini: IniEntry[];
};

// Directories holding PHP builds from common control panels / distros.
// [directory, regex for sub-entries, relative path of the binary inside a match]
const SEARCH: [string, RegExp, string][] = [
  ["/usr/bin", /^php(\d+(\.\d+)?)?$/, ""],
  ["/usr/local/bin", /^php(\d+(\.\d+)?)?$/, ""],
  ["/usr/local/lsws", /^lsphp\d+$/, "bin/php"], // LiteSpeed / CyberPanel
  ["/opt/cpanel", /^ea-php\d+$/, "root/usr/bin/php"], // cPanel EasyApache
  ["/opt/alt", /^php\d+$/, "usr/bin/php"], // CloudLinux alt-php
  ["/opt/remi", /^php\d+$/, "root/usr/bin/php"], // Remi (RHEL)
  ["/opt/plesk/php", /^\d+\.\d+$/, "bin/php"], // Plesk
];

async function isExecutable(file: string): Promise<boolean> {
  try {
    await fs.access(file, constants.X_OK);
    return (await fs.stat(file)).isFile();
  } catch {
    return false;
  }
}

let cache: { at: number; list: PhpBinary[] } | null = null;

/** All PHP CLI binaries on this server (deduplicated by real path), cached for a minute. */
export async function discoverPhpBinaries(force = false): Promise<PhpBinary[]> {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.list;

  const candidates = new Set<string>();
  if (process.env.PHP_BINARY) candidates.add(process.env.PHP_BINARY);
  for (const [dir, re, inner] of SEARCH) {
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) if (re.test(name)) candidates.add(path.join(dir, name, inner));
  }

  const byReal = new Map<string, string>();
  for (const candidate of candidates) {
    if (!(await isExecutable(candidate))) continue;
    const real = await fs.realpath(candidate).catch(() => candidate);
    // prefer the friendlier name (e.g. /usr/bin/php over /usr/bin/php8.3)
    const current = byReal.get(real);
    if (!current || candidate.length < current.length) byReal.set(real, candidate);
  }

  const list: PhpBinary[] = [];
  for (const bin of byReal.values()) {
    const version = (await runCommand(bin, ["-r", "echo PHP_VERSION;"]))?.trim();
    if (version && /^\d+\.\d+/.test(version)) list.push({ path: bin, version });
  }
  list.sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  cache = { at: Date.now(), list };
  return list;
}

/** Only binaries found by discovery may be executed — never an arbitrary path from the request. */
async function resolveBinary(requested: unknown): Promise<string> {
  const list = await discoverPhpBinaries();
  if (!list.length) throw new FileError("No PHP CLI found. Install php-cli or set PHP_BINARY in .env", 404);
  if (requested === undefined || requested === null || requested === "") {
    const preferred = list.find((b) => b.path === process.env.PHP_BINARY);
    return (preferred ?? list[0]).path;
  }
  const match = list.find((b) => b.path === requested);
  if (!match) throw new FileError("Unknown PHP binary", 400);
  return match.path;
}

// Uses classic closures (no arrow fns) so it also runs on PHP 5.6/7.x.
const INFO_SCRIPT = `
$ext = array();
foreach (get_loaded_extensions() as $e) { $v = phpversion($e); $ext[] = array("name" => $e, "version" => $v ? $v : ""); }
$ini = array();
foreach (ini_get_all(null, true) as $k => $v) {
  $ini[] = array("name" => $k, "global" => (string)$v["global_value"], "local" => (string)$v["local_value"], "access" => $v["access"]);
}
$scanned = php_ini_scanned_files();
echo json_encode(array(
  "version" => PHP_VERSION, "sapi" => PHP_SAPI, "zend" => zend_version(),
  "os" => PHP_OS, "uname" => php_uname(),
  "iniFile" => php_ini_loaded_file(),
  "scannedIni" => $scanned ? array_values(array_filter(array_map("trim", explode(",", $scanned)))) : array(),
  "extensions" => $ext, "zendExtensions" => get_loaded_extensions(true), "ini" => $ini,
), JSON_PARTIAL_OUTPUT_ON_ERROR);
`;

export async function getPhpInfo(requested: unknown): Promise<PhpInfo> {
  const binary = await resolveBinary(requested);
  const out = await runCommand(binary, ["-r", INFO_SCRIPT], 10_000);
  if (!out) throw new FileError(`Could not run ${binary}`, 502);
  try {
    const info = JSON.parse(out);
    info.extensions.sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return { binary, ...info };
  } catch {
    throw new FileError("Unexpected output from PHP", 502);
  }
}

/** Full `php -i` text, for download. */
export async function rawPhpInfo(requested: unknown): Promise<{ binary: string; text: string }> {
  const binary = await resolveBinary(requested);
  const text = await runCommand(binary, ["-i"], 10_000);
  if (text === null) throw new FileError(`Could not run ${binary}`, 502);
  return { binary, text };
}
