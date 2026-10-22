import "server-only";
import { NextResponse } from "next/server";

/**
 * Rejects state-changing requests that come from another site. The panel is
 * protected by browser-sent credentials (Nginx basic auth), so without this a
 * malicious page could make the visitor's browser modify files (CSRF).
 */
export function rejectCrossSite(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return forbidden();
  try {
    if (new URL(origin).host !== host) return forbidden();
  } catch {
    return forbidden();
  }
  return null;
}

function forbidden() {
  return NextResponse.json({ error: "Cross-site request blocked" }, { status: 403 });
}
