import { NextResponse } from "next/server";
import { rejectCrossSite } from "@/lib/api-guard";
import {
  changeMode,
  createFile,
  createFolder,
  deleteEntry,
  FileError,
  listDirectory,
  renameEntry,
  toErrorResponse,
} from "@/lib/files";

export const dynamic = "force-dynamic";

function errorJson(err: unknown) {
  const { message, status } = toErrorResponse(err);
  return NextResponse.json({ error: message }, { status });
}

/** GET /api/files?path=/some/dir — list a folder. */
export async function GET(request: Request) {
  const relPath = new URL(request.url).searchParams.get("path") ?? "/";
  try {
    return NextResponse.json(await listDirectory(relPath));
  } catch (err) {
    return errorJson(err);
  }
}

type Action =
  | { action: "mkdir"; path: string; name: string }
  | { action: "touch"; path: string; name: string }
  | { action: "rename"; path: string; name: string }
  | { action: "delete"; paths: string[] }
  | { action: "chmod"; path: string; mode: string };

/** POST /api/files — { action, ... } for create / rename / delete / chmod. */
export async function POST(request: Request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;

  try {
    const body = (await request.json()) as Action;
    switch (body.action) {
      case "mkdir":
        await createFolder(body.path, body.name);
        break;
      case "touch":
        await createFile(body.path, body.name);
        break;
      case "rename":
        await renameEntry(body.path, body.name);
        break;
      case "delete":
        if (!Array.isArray(body.paths) || body.paths.length === 0) throw new FileError("Nothing to delete");
        for (const p of body.paths) await deleteEntry(p);
        break;
      case "chmod":
        await changeMode(body.path, body.mode);
        break;
      default:
        throw new FileError("Unknown action");
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorJson(err);
  }
}
