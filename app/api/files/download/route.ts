import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { fileForDownload, toErrorResponse } from "@/lib/files";

export const dynamic = "force-dynamic";

/** GET /api/files/download?path=/file.zip — stream a file to the browser. */
export async function GET(request: Request) {
  const relPath = new URL(request.url).searchParams.get("path") ?? "";
  try {
    const { abs, size, name } = await fileForDownload(relPath);
    const stream = Readable.toWeb(createReadStream(abs)) as ReadableStream;
    return new Response(stream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(size),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const { message, status } = toErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
