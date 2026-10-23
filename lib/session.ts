// Session token helpers. Edge-compatible (used by middleware), so no Node APIs here.
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "clauai_session";
export const SESSION_HOURS = 12;

function secretKey(): Uint8Array | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) return null;
  return new TextEncoder().encode(secret);
}

export function authConfigured(): boolean {
  return secretKey() !== null && !!process.env.ADMIN_USERNAME && !!process.env.ADMIN_PASSWORD_HASH;
}

export async function createSessionToken(username: string): Promise<string> {
  const key = secretKey();
  if (!key) throw new Error("AUTH_SECRET is not configured");
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(username)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(key);
}

/** Returns the username for a valid token, or null. */
export async function verifySessionToken(token: string | undefined): Promise<string | null> {
  const key = secretKey();
  if (!key || !token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    return payload.sub && payload.sub === process.env.ADMIN_USERNAME ? payload.sub : null;
  } catch {
    return null;
  }
}
