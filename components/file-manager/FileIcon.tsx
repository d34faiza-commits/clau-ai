import {
  File,
  FileArchive,
  FileCode,
  FileImage,
  FileText,
  Folder,
  Link2,
} from "lucide-react";
import type { FileEntry } from "@/lib/file-types";

const CODE = new Set([
  "php", "js", "ts", "tsx", "jsx", "json", "html", "htm", "css", "scss", "py", "sh",
  "rb", "go", "java", "c", "cpp", "h", "sql", "xml", "yml", "yaml", "vue", "env", "htaccess",
]);
const IMAGE = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "avif"]);
const ARCHIVE = new Set(["zip", "tar", "gz", "tgz", "bz2", "xz", "rar", "7z"]);
const TEXT = new Set(["txt", "md", "log", "ini", "conf", "cfg", "csv"]);

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : name.startsWith(".") ? name.slice(1) : "";
}

/** Images and archives can't be edited as text; opening them downloads instead. */
export function isBinaryName(name: string): boolean {
  const ext = extensionOf(name);
  return (IMAGE.has(ext) && ext !== "svg") || ARCHIVE.has(ext);
}

export default function FileIcon({ entry }: { entry: FileEntry }) {
  if (entry.type === "dir") return <Folder className="h-4 w-4 shrink-0 fill-amber-400/20 text-amber-400" />;
  if (entry.type === "symlink") return <Link2 className="h-4 w-4 shrink-0 text-accent-blue" />;

  const ext = extensionOf(entry.name);
  if (CODE.has(ext)) return <FileCode className="h-4 w-4 shrink-0 text-accent-green" />;
  if (IMAGE.has(ext)) return <FileImage className="h-4 w-4 shrink-0 text-fuchsia-400" />;
  if (ARCHIVE.has(ext)) return <FileArchive className="h-4 w-4 shrink-0 text-orange-400" />;
  if (TEXT.has(ext)) return <FileText className="h-4 w-4 shrink-0 text-slate-300" />;
  return <File className="h-4 w-4 shrink-0 text-slate-400" />;
}
