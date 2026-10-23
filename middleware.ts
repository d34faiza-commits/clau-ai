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
  const login = new URL("/login", publicOrigin(request));
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

/**
 * Behind Nginx/LiteSpeed, request.url is the internal 127.0.0.1:PORT address, so redirects
 * must be built from the Host / X-Forwarded-* headers the proxy passes on.
 */
function publicOrigin(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = (request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "")).split(",")[0].trim();
  if (host && /^[A-Za-z0-9.:[\]-]+$/.test(host) && (proto === "http" || proto === "https")) {
    return `${proto}://${host}`;
  }
  return request.nextUrl.origin;
}

export const config = {
  // everything except Next.js assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
