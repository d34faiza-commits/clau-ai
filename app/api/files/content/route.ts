import { NextResponse } from "next/server";
import { rejectCrossSite } from "@/lib/api-guard";
import { readTextFile, toErrorResponse, writeTextFile } from "@/lib/files";

export const dynamic = "force-dynamic";

/** GET /api/files/content?path=/file.txt — read a text file for the editor. */
export async function GET(request: Request) {
  const relPath = new URL(request.url).searchParams.get("path") ?? "";
  try {
    return NextResponse.json(await readTextFile(relPath));
  } catch (err) {
    const { message, status } = toErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

/** PUT /api/files/content — { path, content } save the editor contents. */
export async function PUT(request: Request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;

  try {
    const { path, content } = await request.json();
    await writeTextFile(path, content);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { message, status } = toErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
