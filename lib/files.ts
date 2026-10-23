import "server-only";
import { existsSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { DirectoryListing, FileEntry } from "./file-types";

/** Every file operation is confined to this directory. */
export const ROOT = path.resolve(
  process.env.FILE_MANAGER_ROOT || (existsSync("/var/www") ? "/var/www" : os.homedir()),
);

export const MAX_EDIT_BYTES = 2 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_MB || 100) * 1024 * 1024;

export class FileError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}


let userCache: Map<number, string> | null = null;

function ownerName(uid: number): string {
  if (!userCache) {
    userCache = new Map();
    try {
      for (const line of readFileSync("/etc/passwd", "utf8").split("\n")) {
        const [name, , id] = line.split(":");
        if (name && id) userCache.set(Number(id), name);
      }
    } catch {
      // no /etc/passwd — show numeric ids
    }
  }
  return userCache.get(uid) ?? String(uid);
}

function isInsideRoot(abs: string): boolean {
  return abs === ROOT || abs.startsWith(ROOT + path.sep);
}

/** Relative "/foo/bar" path from the client → absolute path inside ROOT. */
function toAbsolute(relPath: string): string {
  if (typeof relPath !== "string" || relPath.includes("\0")) {
    throw new FileError("Invalid path");
  }
  const abs = path.resolve(ROOT, "." + path.posix.normalize("/" + relPath));
  if (!isInsideRoot(abs)) throw new FileError("Path is outside the allowed root", 403);
  return abs;
}

/** Resolves symlinks too, so a link can't be used to escape ROOT. */
async function resolveExisting(relPath: string): Promise<string> {
  const abs = toAbsolute(relPath);
  let real: string;
  try {
    real = await fs.realpath(abs);
  } catch {
    throw new FileError("File or folder not found", 404);
  }
  if (!isInsideRoot(real)) throw new FileError("Path is outside the allowed root", 403);
  return abs;
}

/** For paths about to be created: the parent must exist inside ROOT. */
async function resolveNew(parentRel: string, name: string): Promise<string> {
  validateName(name);
  const parent = await resolveExisting(parentRel);
  const stat = await fs.stat(parent);
  if (!stat.isDirectory()) throw new FileError("Target is not a folder");
  return path.join(parent, name);
}

export function validateName(name: string) {
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name === "." ||
    name === ".." ||
    /[/\\\0]/.test(name) ||
    name.length > 255
  ) {
    throw new FileError("Invalid name");
  }
}

function toRelative(abs: string): string {
  const rel = path.relative(ROOT, abs).split(path.sep).join("/");
  return "/" + rel;
}

function permissionString(mode: number, type: FileEntry["type"]): string {
  const prefix = type === "dir" ? "d" : type === "symlink" ? "l" : "-";
  const bits = ["r", "w", "x"];
  let out = "";
  for (let i = 8; i >= 0; i--) out += mode & (1 << i) ? bits[(8 - i) % 3] : "-";
  return prefix + out;
}

async function describe(abs: string): Promise<FileEntry> {
  const lst = await fs.lstat(abs);
  const type: FileEntry["type"] = lst.isSymbolicLink() ? "symlink" : lst.isDirectory() ? "dir" : "file";
  let size = lst.size;
  let isDirLink = false;
  if (type === "symlink") {
    try {
      const target = await fs.stat(abs);
      size = target.size;
      isDirLink = target.isDirectory();
    } catch {
      // broken link
    }
  }
  return {
    name: path.basename(abs),
    path: toRelative(abs),
    type: isDirLink ? "dir" : type,
    size: type === "dir" || isDirLink ? 0 : size,
    mode: (lst.mode & 0o7777).toString(8).padStart(4, "0"),
    permissions: permissionString(lst.mode, type),
    owner: ownerName(lst.uid),
    modified: lst.mtime.toISOString(),
  };
}

export async function listDirectory(relPath: string): Promise<DirectoryListing> {
  const abs = await resolveExisting(relPath);
  const stat = await fs.stat(abs);
  if (!stat.isDirectory()) throw new FileError("Not a folder");

  const names = await fs.readdir(abs);
  const entries = (
    await Promise.all(names.map((name) => describe(path.join(abs, name)).catch(() => null)))
  ).filter((e): e is FileEntry => e !== null);

  entries.sort((a, b) => {
    if ((a.type === "dir") !== (b.type === "dir")) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });

  return { root: ROOT, path: toRelative(abs), entries };
}

export async function readTextFile(relPath: string) {
  const abs = await resolveExisting(relPath);
  const stat = await fs.stat(abs);
  if (!stat.isFile()) throw new FileError("Not a file");
  if (stat.size > MAX_EDIT_BYTES) throw new FileError("File is too large to edit (max 2 MB)", 413);

  const buffer = await fs.readFile(abs);
  if (buffer.subarray(0, 8000).includes(0)) throw new FileError("Binary files cannot be edited", 415);
  return { path: toRelative(abs), content: buffer.toString("utf8"), modified: stat.mtime.toISOString() };
}

export async function writeTextFile(relPath: string, content: string) {
  if (typeof content !== "string") throw new FileError("Invalid content");
  if (Buffer.byteLength(content) > MAX_EDIT_BYTES) throw new FileError("Content is too large (max 2 MB)", 413);
  const abs = await resolveExisting(relPath);
  const stat = await fs.stat(abs);
  if (!stat.isFile()) throw new FileError("Not a file");
  await fs.writeFile(abs, content, "utf8");
}

export async function createFolder(parentRel: string, name: string) {
  const abs = await resolveNew(parentRel, name);
  await fs.mkdir(abs).catch((err: NodeJS.ErrnoException) => {
    if (err.code === "EEXIST") throw new FileError("A file or folder with that name already exists", 409);
    throw err;
  });
}

export async function createFile(parentRel: string, name: string) {
  const abs = await resolveNew(parentRel, name);
  // "wx" fails if the file already exists
  await fs.writeFile(abs, "", { flag: "wx" }).catch((err: NodeJS.ErrnoException) => {
    if (err.code === "EEXIST") throw new FileError("A file or folder with that name already exists", 409);
    throw err;
  });
}

export async function renameEntry(relPath: string, newName: string) {
  validateName(newName);
  const abs = await resolveExisting(relPath);
  if (abs === ROOT) throw new FileError("The root folder cannot be renamed", 403);
  const target = path.join(path.dirname(abs), newName);
  if (existsSync(target)) throw new FileError("A file or folder with that name already exists", 409);
  await fs.rename(abs, target);
}

export async function deleteEntry(relPath: string) {
  const abs = await resolveExisting(relPath);
  if (abs === ROOT) throw new FileError("The root folder cannot be deleted", 403);
  // lstat-based rm removes a symlink itself, never its target
  await fs.rm(abs, { recursive: true, force: false });
}

export async function changeMode(relPath: string, mode: string) {
  if (!/^[0-7]{3,4}$/.test(mode)) throw new FileError("Invalid permission (use e.g. 644 or 0755)");
  const abs = await resolveExisting(relPath);
  await fs.chmod(abs, parseInt(mode, 8));
}

export async function saveUpload(parentRel: string, file: File, overwrite: boolean) {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new FileError(`${file.name} exceeds the upload limit`, 413);
  }
  const abs = await resolveNew(parentRel, file.name);
  const data = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(abs, data, { flag: overwrite ? "w" : "wx" }).catch((err: NodeJS.ErrnoException) => {
    if (err.code === "EEXIST") throw new FileError(`${file.name} already exists`, 409);
    throw err;
  });
}

export async function fileForDownload(relPath: string) {
  const abs = await resolveExisting(relPath);
  const stat = await fs.stat(abs);
  if (!stat.isFile()) throw new FileError("Only files can be downloaded");
  return { abs, size: stat.size, name: path.basename(abs) };
}

/** Maps filesystem errors to readable messages and HTTP codes. */
export function toErrorResponse(err: unknown): { message: string; status: number } {
  if (err instanceof FileError) return { message: err.message, status: err.status };
  const code = (err as NodeJS.ErrnoException)?.code;
  switch (code) {
    case "EACCES":
    case "EPERM":
      return { message: "Permission denied", status: 403 };
    case "ENOENT":
      return { message: "File or folder not found", status: 404 };
    case "EEXIST":
      return { message: "Already exists", status: 409 };
    case "ENOTEMPTY":
      return { message: "Folder is not empty", status: 409 };
    case "ENOSPC":
      return { message: "No space left on device", status: 507 };
    default:
      console.error("[file-manager]", err);
      return { message: "Unexpected error", status: 500 };
  }
}
