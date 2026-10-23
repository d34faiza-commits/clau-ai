import "server-only";
import type { Stats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { FileError, ROOT } from "@/lib/files";

const SKIP_DIRS = new Set([".git", "node_modules", ".cache", ".npm"]);

/** Validates a user-supplied absolute directory; scans are confined to the file-manager root. */
export async function resolveScanDir(input: string): Promise<string> {
  if (typeof input !== "string" || !input.trim() || input.includes("\0")) throw new FileError("Directory is required");
  const abs = path.resolve(input.trim());
  let real: string;
  try {
    real = await fs.realpath(abs);
  } catch {
    throw new FileError(`Directory not found: ${abs}`, 404);
  }
  if (real !== ROOT && !real.startsWith(ROOT + path.sep)) {
    throw new FileError(`Scans are limited to ${ROOT} (set FILE_MANAGER_ROOT to change)`, 403);
  }
  if (!(await fs.stat(real)).isDirectory()) throw new FileError("Not a directory");
  return real;
}

export type WalkResult = { files: number; truncated: boolean };

/**
 * Iterative directory walk that never follows symlinks. Calls `onEntry` for every
 * file and directory until `maxFiles` files have been visited.
 */
export async function walk(
  root: string,
  maxFiles: number,
  onEntry: (abs: string, stat: Stats, isDir: boolean) => void | Promise<void>,
  opts: { skipDirs?: boolean } = { skipDirs: true },
): Promise<WalkResult> {
  const stack = [root];
  let files = 0;
  while (stack.length) {
    const dir = stack.pop()!;
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch {
      continue; // unreadable — skip
    }
    for (const name of names) {
      const abs = path.join(dir, name);
      let stat: Stats;
      try {
        stat = await fs.lstat(abs);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        await onEntry(abs, stat, true);
        if (!(opts.skipDirs && SKIP_DIRS.has(name))) stack.push(abs);
      } else if (stat.isFile()) {
        if (files >= maxFiles) return { files, truncated: true };
        files++;
        await onEntry(abs, stat, false);
      }
    }
  }
  return { files, truncated: false };
}

export function rel(root: string, abs: string): string {
  return path.relative(root, abs) || ".";
}

/** "a, b, c and 12 more" */
export function examples(items: string[], max = 5): string {
  if (items.length <= max) return items.join(", ");
  return `${items.slice(0, max).join(", ")} and ${items.length - max} more`;
}

export function clampInt(value: unknown, def: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.floor(n)));
}
