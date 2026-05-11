import { prisma } from "@/lib/prisma";
import {
  type AuthProvider,
  type UserRole,
} from "@/generated/prisma/client";
import { generateReferralCode } from "./referral-code";

// The reconciliation has two responsibilities:
//   1. Make sure a Prisma `User` row exists for this clerkId. Without this row
//      the rest of the app (sessions, profile, notifications) silently 404s
//      because every service joins on `User`.
//   2. Make sure Clerk `publicMetadata.{role,isAdmin}` matches the Prisma
//      `User.{role,isAdmin}`. Every `requireRole(...)` / `requireAdmin()`
//      guard reads JWT claims, so Clerk has to know both.
//
// The Clerk `user.created` webhook is the primary writer (success path), but
// it can fail (URL/secret misconfig, transient DB error, retry race against
// Clerk's `clerkId @unique` constraint). Every failure leaves a user who can
// authenticate but hits `forbidden()` on every authed page. Reconciliation
// gives us a single idempotent function we can call from the webhook AND
// from the request path (as a self-heal in `requireRole`) so any future miss
// is invisible to the user — they never see the broken state because the next
// page-load fixes it.

interface ClerkUserSnapshot {
  emailAddress: string;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string | null;
  externalAccounts: ReadonlyArray<{ provider: string }>;
}

export type RoleClaims = { role: UserRole; isAdmin: boolean };

const VALID_ROLES: ReadonlyArray<UserRole> = ["CLIENT", "STYLIST"];

/**
 * Inspect Clerk session claims and report what we got plus whether we need
 * to reconcile against the DB. Reconciliation is needed when:
 *
 *   - The role claim is missing or not one of the supported enum values
 *     (e.g. legacy "ADMIN" carried by JWTs issued before the schema change).
 *   - The isAdmin claim is missing entirely (boolean check, not falsy —
 *     `false` is fine; `undefined` means the JWT predates the new shape).
 *
 * Returning `needsReconcile=true` is the trigger for `requireRole` and
 * `/post-signin` to call `reconcileClerkUser` and pull fresh `{role,isAdmin}`
 * from the DB, then opportunistically push them back to Clerk so the next
 * JWT rotation carries normalized claims.
 */
export function parseRoleClaims(metadata: unknown): {
  role: UserRole | undefined;
  isAdmin: boolean;
  needsReconcile: boolean;
} {
  const m = (metadata ?? {}) as { role?: unknown; isAdmin?: unknown };
  const role: UserRole | undefined =
    typeof m.role === "string" && (VALID_ROLES as readonly string[]).includes(m.role)
      ? (m.role as UserRole)
      : undefined;
  const isAdmin = m.isAdmin === true;
  const isAdminClaimPresent = typeof m.isAdmin === "boolean";
  const needsReconcile = role === undefined || !isAdminClaimPresent;
  return { role, isAdmin, needsReconcile };
}

export interface ReconcileClerkUserDeps {
  findUserByClerkId(
    clerkId: string,
  ): Promise<{ id: string; role: UserRole; isAdmin: boolean } | null>;
  fetchClerkUser(clerkId: string): Promise<ClerkUserSnapshot>;
  generateUniqueReferralCode(): Promise<string>;
  createUser(data: {
    clerkId: string;
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    authProvider: AuthProvider;
    referralCode: string;
  }): Promise<{ id: string; role: UserRole; isAdmin: boolean }>;
  seedNotificationPreferences(userId: string): Promise<void>;
  setClerkClaims(clerkId: string, claims: RoleClaims): Promise<void>;
}

export type ReconcileClerkUserResult = {
  userId: string;
  role: UserRole;
  isAdmin: boolean;
  created: boolean;
};

export function determineAuthProvider(
  externalAccounts: ReadonlyArray<{ provider: string }>,
): AuthProvider {
  if (externalAccounts.length === 0) return "EMAIL";
  const provider = externalAccounts[0].provider;
  if (provider === "google" || provider === "oauth_google") return "GOOGLE";
  if (provider === "apple" || provider === "oauth_apple") return "APPLE";
  return "EMAIL";
}

/**
 * Resolve the Prisma User row for a Clerk id (creating it on first contact)
 * and return the canonical `{role, isAdmin}` from the DB. Does NOT write
 * Clerk metadata — splitting that out lets the request-time self-heal path
 * treat the metadata sync as opportunistic without making the DB lookup
 * itself fragile.
 */
async function resolveDbUserForClerk(
  clerkId: string,
  deps: ReconcileClerkUserDeps,
): Promise<ReconcileClerkUserResult> {
  const existing = await deps.findUserByClerkId(clerkId);
  if (existing) {
    return {
      userId: existing.id,
      role: existing.role,
      isAdmin: existing.isAdmin,
      created: false,
    };
  }

  const snapshot = await deps.fetchClerkUser(clerkId);
  if (!snapshot.emailAddress) {
    throw new Error(`Clerk user ${clerkId} has no primary email address`);
  }
  const referralCode = await deps.generateUniqueReferralCode();
  let user;
  try {
    user = await deps.createUser({
      clerkId,
      email: snapshot.emailAddress,
      firstName: snapshot.firstName ?? "",
      lastName: snapshot.lastName ?? "",
      avatarUrl: snapshot.imageUrl,
      authProvider: determineAuthProvider(snapshot.externalAccounts),
      referralCode,
    });
  } catch (err) {
    // Tag email-collision failures so CloudWatch can alarm on them
    // distinctly from generic Clerk SDK / DB errors. The Prisma P2002 with
    // target=["email"] means a different clerkId already owns this email
    // — the user can authenticate via Clerk but can't get a DB row, and
    // every authed page will forbid them until the collision is resolved.
    const e = err as { code?: string; meta?: { target?: string[] } };
    if (e.code === "P2002" && e.meta?.target?.includes("email")) {
      throw new Error(
        `email_collision: Clerk user ${clerkId} email '${snapshot.emailAddress}' already exists in DB under a different clerkId`,
      );
    }
    throw err;
  }
  await deps.seedNotificationPreferences(user.id);
  return {
    userId: user.id,
    role: user.role,
    isAdmin: user.isAdmin,
    created: true,
  };
}

export async function reconcileClerkUser(
  clerkId: string,
  deps: ReconcileClerkUserDeps,
): Promise<ReconcileClerkUserResult> {
  const result = await resolveDbUserForClerk(clerkId, deps);

  // Always re-write Clerk metadata. Clerk does a deep-merge so this preserves
  // unrelated keys like `onboardingStatus`. The DB row is the source of truth
  // for {role, isAdmin}; this line keeps Clerk in sync with it.
  await deps.setClerkClaims(clerkId, {
    role: result.role,
    isAdmin: result.isAdmin,
  });

  return result;
}

export type ResilientReconcileResult = ReconcileClerkUserResult & {
  /**
   * `true` when `setClerkClaims` succeeded, `false` when it threw. The DB
   * lookup/create result is returned regardless — callers in the request
   * path use this to avoid 403'ing a user whose DB row is correctly
   * identified just because Clerk's API is having a moment.
   */
  syncedClerk: boolean;
};

/**
 * Same contract as `reconcileClerkUser`, but the trailing Clerk metadata
 * write is treated as opportunistic — failures are logged and reported via
 * the `syncedClerk` flag rather than thrown. Use from request-time
 * self-heal paths (`requireRole`, `requireAdmin`) where a transient Clerk
 * outage must not lock the user out of the app. The strict variant is
 * still the right choice for the webhook + the admin resync route, where
 * the sync is the whole point of the call.
 */
export async function reconcileClerkUserResilient(
  clerkId: string,
  deps: ReconcileClerkUserDeps,
): Promise<ResilientReconcileResult> {
  const result = await resolveDbUserForClerk(clerkId, deps);

  let syncedClerk = false;
  try {
    await deps.setClerkClaims(clerkId, {
      role: result.role,
      isAdmin: result.isAdmin,
    });
    syncedClerk = true;
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "clerk_metadata_sync_failed",
        clerkId,
        err: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  return { ...result, syncedClerk };
}

// Default deps wired to real Prisma + Clerk SDK. Lazy-imports the Clerk SDK
// so this module can be unit-tested without a Clerk env var.
export async function buildDefaultReconcileDeps(): Promise<ReconcileClerkUserDeps> {
  const { clerkClient } = await import("@clerk/nextjs/server");

  return {
    findUserByClerkId: (clerkId) =>
      prisma.user.findUnique({
        where: { clerkId },
        select: { id: true, role: true, isAdmin: true },
      }),

    fetchClerkUser: async (clerkId) => {
      const client = await clerkClient();
      const u = await client.users.getUser(clerkId);
      return {
        emailAddress:
          u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)
            ?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? "",
        firstName: u.firstName,
        lastName: u.lastName,
        imageUrl: u.imageUrl ?? null,
        externalAccounts: u.externalAccounts.map((a) => ({ provider: a.provider })),
      };
    },

    generateUniqueReferralCode: async () => {
      for (let i = 0; i < 5; i++) {
        const code = generateReferralCode();
        const existing = await prisma.user.findUnique({
          where: { referralCode: code },
          select: { id: true },
        });
        if (!existing) return code;
      }
      return generateReferralCode() + generateReferralCode();
    },

    createUser: (data) =>
      prisma.user.create({
        data,
        select: { id: true, role: true, isAdmin: true },
      }),

    seedNotificationPreferences: async (userId) => {
      const categories = [
        "session_updates",
        "marketing",
        "chat",
        "promotions",
      ] as const;
      const rows = categories.flatMap((category) => [
        { userId, channel: "EMAIL" as const, category, isEnabled: true },
        { userId, channel: "SMS" as const, category, isEnabled: true },
        { userId, channel: "PUSH" as const, category, isEnabled: false },
      ]);
      await prisma.notificationPreference.createMany({ data: rows });
    },

    setClerkClaims: async (clerkId, { role, isAdmin }) => {
      const client = await clerkClient();
      await client.users.updateUserMetadata(clerkId, {
        publicMetadata: { role, isAdmin },
      });
    },
  };
}

/**
 * Push the current DB `User.{role,isAdmin}` into Clerk publicMetadata. Use
 * after any DB role mutation (`promoteToStylist`, `setAdminFlag`, etc.) so
 * the Clerk JWT picks up the new claims on the next session-token rotation.
 *
 * Failures are logged but not rethrown — callers should treat the DB write
 * as the source of truth and the Clerk write as an opportunistic sync. The
 * `requireRole` self-heal will catch any sync that drops on the floor.
 *
 * No-op for users without a real Clerk ID (e2e fixtures use `e2e_*` IDs).
 */
export async function syncClerkClaimsForUser(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { clerkId: true, role: true, isAdmin: true },
  });
  if (!user?.clerkId || !user.clerkId.startsWith("user_")) return;

  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    await client.users.updateUserMetadata(user.clerkId, {
      publicMetadata: { role: user.role, isAdmin: user.isAdmin },
    });
  } catch (err) {
    console.error("syncClerkClaimsForUser failed", {
      userId,
      err: err instanceof Error ? err.message : err,
    });
  }
}

/**
 * Push the current DB `StylistProfile.onboardingStatus` into Clerk
 * publicMetadata. Mirrors `syncClerkClaimsForUser` for the stylist-only
 * onboardingStatus key the edge proxy reads in `src/proxy.ts` to gate
 * `/stylist/*`.
 *
 * Call after any non-wizard mutation that flips `onboardingStatus`:
 * admin eligibility approval, Stripe Connect return, and the Stripe
 * `account.updated` payout webhook all bypass the wizard's own
 * `advance()` and would otherwise leave Clerk stale until the next
 * wizard step (which never comes, in the case of `ELIGIBLE`).
 *
 * Failures are logged but not rethrown — same opportunistic-sync
 * contract as `syncClerkClaimsForUser`. No-op for users without a real
 * Clerk ID (e2e fixtures use `e2e_*` / `demo-*` IDs) or without a
 * stylist profile (CLIENT users don't carry onboardingStatus).
 */
export async function syncStylistOnboardingForUser(
  userId: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      clerkId: true,
      stylistProfile: { select: { onboardingStatus: true } },
    },
  });
  if (!user?.clerkId || !user.clerkId.startsWith("user_")) return;
  if (!user.stylistProfile) return;

  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    await client.users.updateUserMetadata(user.clerkId, {
      publicMetadata: {
        onboardingStatus: user.stylistProfile.onboardingStatus,
      },
    });
  } catch (err) {
    console.error("syncStylistOnboardingForUser failed", {
      userId,
      err: err instanceof Error ? err.message : err,
    });
  }
}
