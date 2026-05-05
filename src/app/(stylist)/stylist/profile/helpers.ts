// Pure helpers for parsing the free-text fields on /stylist/profile.
// Extracted from actions.ts so they can be unit-tested — server-action
// files (`"use server"`) can only export async functions.

export function splitName(full: string): {
  firstName: string;
  lastName: string;
} {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function splitLocation(input: string): {
  city: string;
  state: string | null;
} {
  const idx = input.indexOf(",");
  if (idx === -1) return { city: input.trim(), state: null };
  const city = input.slice(0, idx).trim();
  const state = input.slice(idx + 1).trim() || null;
  return { city, state };
}
