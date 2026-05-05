import { type UserJSON } from "@clerk/nextjs/server";

// Pure builder for Clerk's user.updated payload → Prisma update map.
// Lives outside route.ts so unit tests can import it without pulling in
// the Clerk webhook verifier and the prisma client. The fix this exists
// to pin: skip null first_name / last_name so Prisma's update doesn't
// blow up with a not-null violation (Clerk sends null for invitees who
// haven't set those fields yet — e.g. right after signup before they've
// hit the Clerk profile screen).
export function buildUserUpdateData(
  data: Pick<UserJSON, "email_addresses" | "first_name" | "last_name" | "image_url">,
): Record<string, unknown> {
  const email = data.email_addresses?.[0]?.email_address;
  const out: Record<string, unknown> = { lastLoginAt: new Date() };
  if (email) out.email = email;
  if (typeof data.first_name === "string") out.firstName = data.first_name;
  if (typeof data.last_name === "string") out.lastName = data.last_name;
  // avatarUrl is nullable in the User schema; null is a valid "clear".
  if (data.image_url !== undefined) out.avatarUrl = data.image_url;
  return out;
}
