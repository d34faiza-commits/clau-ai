import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import type { CheckResult, ScanReport } from "./types";
import { examples, rel, resolveScanDir, walk } from "./fs-walk";

const SENSITIVE = /^(\.env(\..*)?|wp-config\.php|configuration\.php|config\.php|settings\.php|\.htpasswd|.*\.(pem|key))$/i;
const BACKUP = /\.(sql|sql\.gz|bak|old|orig|backup|swp|zip|tar|tar\.gz|tgz|rar|7z)$|~$/i;

export async function auditPermissions(dirInput: string): Promise<ScanReport> {
  const started = Date.now();
  const root = await resolveScanDir(dirInput);

  const worldWritableFiles: string[] = [];
  const worldWritableDirs: string[] = [];
  const suid: string[] = [];
  const sensitiveReadable: string[] = [];
  const backups: string[] = [];
  const gitDirs: string[] = [];
  const executablePhp: string[] = [];

  const { files, truncated } = await walk(
    root,
    50_000,
    (abs, stat, isDir) => {
      const mode = stat.mode;
      const name = path.basename(abs);
      const r = rel(root, abs);
      if (isDir) {
        // world-writable without sticky bit (like /tmp) is dangerous
        if (mode & 0o002 && !(mode & 0o1000)) worldWritableDirs.push(r);
        if (name === ".git") gitDirs.push(r);
        return;
      }
      if (mode & 0o002) worldWritableFiles.push(r);
      if (mode & 0o6000) suid.push(r);
      if (SENSITIVE.test(name) && mode & 0o004) sensitiveReadable.push(r);
      if (BACKUP.test(name)) backups.push(r);
      if (/\.php\d?$/i.test(name) && mode & 0o111) executablePhp.push(r);
    },
    { skipDirs: false },
  );

  const rootPerm = (await fs.stat(root)).mode & 0o777;

  const results: CheckResult[] = [
    {
      check: "Root directory permissions",
      status: rootPerm & 0o002 ? "FAIL" : "PASS",
      detail: `${root} is ${rootPerm.toString(8).padStart(3, "0")}`,
      recommendation: rootPerm & 0o002 ? `chmod 755 ${root}` : "No action needed",
    },
    {
      check: "World-writable files",
      status: worldWritableFiles.length ? "FAIL" : "PASS",
      detail: worldWritableFiles.length
        ? `${worldWritableFiles.length} file(s): ${examples(worldWritableFiles)}`
        : "No files writable by every user",
      recommendation: worldWritableFiles.length
        ? `find ${root} -type f -perm -o+w -exec chmod 644 {} +`
        : "No action needed",
    },
    {
      check: "World-writable directories (777)",
      status: worldWritableDirs.length ? "FAIL" : "PASS",
      detail: worldWritableDirs.length
        ? `${worldWritableDirs.length} folder(s): ${examples(worldWritableDirs)}`
        : "No folders writable by every user",
      recommendation: worldWritableDirs.length
        ? `find ${root} -type d -perm -o+w -exec chmod 755 {} +`
        : "No action needed",
    },
    {
      check: "SUID / SGID files",
      status: suid.length ? "FAIL" : "PASS",
      detail: suid.length ? `${suid.length} file(s): ${examples(suid)}` : "No SUID/SGID files in the web directory",
      recommendation: suid.length ? "Remove the bit: chmod u-s,g-s <file> — web files never need it" : "No action needed",
    },
    {
      check: "Sensitive files readable by others",
      status: sensitiveReadable.length ? "WARN" : "PASS",
      detail: sensitiveReadable.length
        ? `${sensitiveReadable.length} file(s): ${examples(sensitiveReadable)}`
        : "Config/key files are not world-readable",
      recommendation: sensitiveReadable.length
        ? "chmod 640 (or 600) and make the web server user the group owner"
        : "No action needed",
    },
    {
      check: "Backup / dump files in web root",
      status: backups.length ? "WARN" : "PASS",
      detail: backups.length ? `${backups.length} file(s): ${examples(backups)}` : "No .sql/.bak/.zip files found",
      recommendation: backups.length ? "Move backups outside the public directory or delete them" : "No action needed",
    },
    {
      check: "Exposed .git directories",
      status: gitDirs.length ? "WARN" : "PASS",
      detail: gitDirs.length ? `${gitDirs.length} found: ${examples(gitDirs)}` : "No .git folders found",
      recommendation: gitDirs.length
        ? "Deny access in the web server (e.g. Nginx: location ~ /\\.git { deny all; })"
        : "No action needed",
    },
    {
      check: "Executable PHP files",
      status: executablePhp.length ? "WARN" : "PASS",
      detail: executablePhp.length
        ? `${executablePhp.length} file(s): ${examples(executablePhp)}`
        : "PHP files do not have the execute bit",
      recommendation: executablePhp.length ? "chmod 644 for PHP files" : "No action needed",
    },
  ];

  return { scanner: "permissions", target: root, durationMs: Date.now() - started, scannedFiles: files, truncated, results };
}
