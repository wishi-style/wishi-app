import { prisma } from "@/lib/prisma";

// Self-heal users whose `firstName` / `lastName` were never populated in our
// DB even though Clerk has them — e.g. OAuth signups where the provider didn't
// share the name on first contact, or accounts whose Clerk profile picked up
// a name AFTER the `user.updated` webhook last fired.
//
// The Clerk webhook handles the steady-state sync; this helper is the
// opportunistic backfill for surfaces that render another user's name
// (stylist dashboard, ClientDetailPanel) so a stylist doesn't see the
// email-handle fallback ("Matthewcar") for a client whose name is sitting
// right there in Clerk.

interface Row {
  id: string;
  clerkId: string | null;
  firstName: string;
  lastName: string;
}

export interface EnsureClerkNameDeps {
  fetchClerkUser: (
    clerkId: string,
  ) => Promise<{ firstName: string | null; lastName: string | null }>;
  updateUserName: (
    id: string,
    data: { firstName: string; lastName: string },
  ) => Promise<void>;
}

const ATTEMPT_TTL_MS = 60_000;
const MAX_ATTEMPT_ENTRIES = 5_000;
const recentAttempts = new Map<string, number>();

function shouldAttempt(clerkId: string): boolean {
  const now = Date.now();
  const last = recentAttempts.get(clerkId);
  if (last !== undefined && now - last < ATTEMPT_TTL_MS) return false;
  if (recentAttempts.size >= MAX_ATTEMPT_ENTRIES) {
    const oldest = [...recentAttempts.entries()]
      .sort((a, b) => a[1] - b[1])
      .slice(0, Math.floor(MAX_ATTEMPT_ENTRIES / 4));
    for (const [k] of oldest) recentAttempts.delete(k);
  }
  recentAttempts.set(clerkId, now);
  return true;
}

// Mutates `rows` in place: each row whose name was successfully refreshed from
// Clerk has its `firstName`/`lastName` updated to the new values. Returns the
// same array for chaining. Failures are logged and swallowed — we never want a
// missing Clerk name to break the page that's calling us.
export async function ensureUserNamesFromClerk(
  rows: Row[],
  deps?: EnsureClerkNameDeps,
): Promise<Row[]> {
  const candidates = rows.filter(
    (r) =>
      r.clerkId &&
      r.clerkId.startsWith("user_") &&
      !r.firstName.trim() &&
      !r.lastName.trim() &&
      shouldAttempt(r.clerkId),
  );
  if (!candidates.length) return rows;

  const resolved = deps ?? (await buildDefaultDeps());

  await Promise.all(
    candidates.map(async (row) => {
      try {
        const fresh = await resolved.fetchClerkUser(row.clerkId!);
        const firstName = (fresh.firstName ?? "").trim();
        const lastName = (fresh.lastName ?? "").trim();
        if (!firstName && !lastName) return;
        await resolved.updateUserName(row.id, { firstName, lastName });
        row.firstName = firstName;
        row.lastName = lastName;
      } catch (err) {
        console.error(
          JSON.stringify({
            event: "ensure_user_names_from_clerk_failed",
            userId: row.id,
            clerkId: row.clerkId,
            err: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }),
  );

  return rows;
}

async function buildDefaultDeps(): Promise<EnsureClerkNameDeps> {
  const { clerkClient } = await import("@clerk/nextjs/server");
  return {
    fetchClerkUser: async (clerkId) => {
      const client = await clerkClient();
      const u = await client.users.getUser(clerkId);
      return { firstName: u.firstName, lastName: u.lastName };
    },
    updateUserName: async (id, data) => {
      await prisma.user.update({ where: { id }, data });
    },
  };
}

// Test-only escape hatch — `npm test` runs each suite in the same process,
// and the throttle Map otherwise leaks attempt timestamps across suites.
export function __resetEnsureClerkNameCacheForTests(): void {
  recentAttempts.clear();
}
