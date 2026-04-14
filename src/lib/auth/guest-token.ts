import { nanoid } from "nanoid";
import crypto from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "wishi_guest_token";
const MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

function getSigningKey(): string {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error("CLERK_SECRET_KEY is required for guest token signing");
  return key;
}

function sign(token: string): string {
  const hmac = crypto.createHmac("sha256", getSigningKey());
  hmac.update(token);
  return `${token}.${hmac.digest("base64url")}`;
}

function verify(signedToken: string): string | null {
  const dotIndex = signedToken.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const token = signedToken.slice(0, dotIndex);
  const expected = sign(token);

  if (!crypto.timingSafeEqual(Buffer.from(signedToken), Buffer.from(expected))) {
    return null;
  }

  return token;
}

/**
 * Mint a new guest token and set it as an HttpOnly cookie.
 * Called on first visit to /match-quiz (Phase 2).
 * Returns the raw token value (stored in MatchQuizResult.guestToken).
 */
export async function mintGuestToken(): Promise<string> {
  const token = nanoid(24);
  const signed = sign(token);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, signed, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });

  return token;
}

/**
 * Read and verify the guest token cookie.
 * Returns the raw token if valid, null if missing or tampered.
 */
export async function readGuestToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);
  if (!cookie?.value) return null;
  return verify(cookie.value);
}

/**
 * Clear the guest token cookie (called after the token is claimed on signup).
 */
export async function clearGuestToken(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
