import { NextResponse } from "next/server";
import { rejectCrossSite } from "@/lib/api-guard";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST(request: Request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
