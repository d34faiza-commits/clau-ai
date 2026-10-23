import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { createGzip } from "node:zlib";
import { NextResponse } from "next/server";
import { databaseExists, dbConfigured, dbErrorResponse, dbSettings, validateDbName } from "@/lib/database";

export const dynamic = "force-dynamic";
export const maxDuration = 3600;

/** GET /api/database/backup?name=db — streams a gzipped mysqldump. */
export async function GET(request: Request) {
  if (!dbConfigured()) return NextResponse.json({ error: "Database is not configured" }, { status: 503 });
  let name: string;
  try {
    name = validateDbName(new URL(request.url).searchParams.get("name"));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  try {
    if (!(await databaseExists(name))) {
      return NextResponse.json({ error: `Database "${name}" does not exist` }, { status: 404 });
    }
  } catch (err) {
    const { message, status } = dbErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }

  const { host, port, user, password, socketPath } = dbSettings();
  const args = [
    `--user=${user}`,
    ...(socketPath ? [`--socket=${socketPath}`] : [`--host=${host}`, `--port=${port}`]),
    "--single-transaction",
    "--routines",
    "--triggers",
    "--events",
    "--default-character-set=utf8mb4",
    "--",
    name,
  ];
  // Password via env (not argv) so it does not show up in `ps`.
  const dump = spawn(process.env.MYSQLDUMP_BINARY || "mysqldump", args, {
    env: { ...process.env, MYSQL_PWD: password },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  dump.stderr.on("data", (c) => (stderr += c));

  // Wait for the first output (or an early failure) so errors become a proper HTTP response.
  const firstChunk = await new Promise<Buffer | null>((resolve) => {
    dump.stdout.once("data", (chunk: Buffer) => resolve(chunk));
    dump.once("error", () => resolve(null));
    dump.once("close", () => resolve(null));
  });
  if (!firstChunk) {
    const message = stderr.trim() || "mysqldump is not installed or failed to start";
    return NextResponse.json({ error: message.replace(/^mysqldump: /, "") }, { status: 502 });
  }

  dump.stdout.pause();
  dump.stdout.unshift(firstChunk);
  const gzip = createGzip();
  dump.stdout.pipe(gzip);
  dump.on("close", (code) => {
    if (code !== 0) gzip.destroy(new Error(stderr || `mysqldump exited with ${code}`));
  });

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return new Response(Readable.toWeb(gzip) as ReadableStream, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${name}-${stamp}.sql.gz"`,
      "Cache-Control": "no-store",
    },
  });
}
