import { NextResponse } from "next/server";
import { rejectCrossSite } from "@/lib/api-guard";
import {
  createDatabase,
  dbConfigured,
  dbErrorResponse,
  dbSettings,
  dropDatabase,
  listDatabases,
  serverVersion,
} from "@/lib/database";

export const dynamic = "force-dynamic";

/** GET /api/database — server info + database list. */
export async function GET() {
  if (!dbConfigured()) return NextResponse.json({ configured: false });
  try {
    const [version, databases] = await Promise.all([serverVersion(), listDatabases()]);
    const { host, port, user, socketPath } = dbSettings();
    return NextResponse.json({ configured: true, version, server: socketPath ?? `${host}:${port}`, user, databases });
  } catch (err) {
    const { message, status } = dbErrorResponse(err);
    return NextResponse.json({ configured: true, error: message }, { status });
  }
}

/** POST /api/database — { action: "create" | "delete", name } */
export async function POST(request: Request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;

  const body = await request.json().catch(() => ({}));
  try {
    if (body.action === "create") await createDatabase(body.name);
    else if (body.action === "delete") await dropDatabase(body.name);
    else return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { message, status } = dbErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
