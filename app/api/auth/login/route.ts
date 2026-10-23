import { NextResponse } from "next/server";
import { rejectCrossSite } from "@/lib/api-guard";
import { verifyPassword } from "@/lib/password";
import { authConfigured, createSessionToken, SESSION_COOKIE, SESSION_HOURS } from "@/lib/session";

export const dynamic = "force-dynamic";

// Brute-force protection: max 5 failed attempts per IP per 15 minutes.
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: Request): string {
  return request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
}

export async function POST(request: Request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;

  if (!authConfigured()) {
    return NextResponse.json(
      { error: "Login belum dikonfigurasi. Jalankan `npm run setup` di server." },
      { status: 503 },
    );
  }

  const ip = clientIp(request);
  const now = Date.now();
  const record = failures.get(ip);
  if (record && record.resetAt > now && record.count >= MAX_FAILURES) {
    const minutes = Math.ceil((record.resetAt - now) / 60000);
    return NextResponse.json({ error: `Terlalu banyak percobaan. Coba lagi dalam ${minutes} menit.` }, { status: 429 });
  }

  const { username, password } = await request.json().catch(() => ({}));
  const valid =
    typeof username === "string" &&
    typeof password === "string" &&
    username === process.env.ADMIN_USERNAME &&
    (await verifyPassword(password, process.env.ADMIN_PASSWORD_HASH!));

  if (!valid) {
    const fresh = !record || record.resetAt <= now;
    failures.set(ip, { count: fresh ? 1 : record.count + 1, resetAt: fresh ? now + WINDOW_MS : record.resetAt });
    return NextResponse.json({ error: "Username atau password salah" }, { status: 401 });
  }

  failures.delete(ip);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSessionToken(username), {
    httpOnly: true,
    sameSite: "strict",
    // only mark Secure behind HTTPS, otherwise login over plain http://IP would silently fail
    secure: request.headers.get("x-forwarded-proto") === "https" || new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
  return response;
}
