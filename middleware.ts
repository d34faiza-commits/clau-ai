import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

const PUBLIC_PATHS = ["/login", "/api/auth/login"];

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const user = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (user) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Relative Location: behind Nginx/LiteSpeed the request URL Next sees is the internal
  // 127.0.0.1:PORT address, so an absolute redirect would send visitors to localhost.
  const next = pathname !== "/" ? `?next=${encodeURIComponent(pathname + search)}` : "";
  return new NextResponse(null, { status: 307, headers: { Location: `/login${next}` } });
}

export const config = {
  // everything except Next.js assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
