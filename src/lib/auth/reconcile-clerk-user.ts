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

export async function reconcileClerkUser(
  clerkId: string,
  deps: ReconcileClerkUserDeps,
): Promise<ReconcileClerkUserResult> {
  const existing = await deps.findUserByClerkId(clerkId);

  let userId: string;
  let role: UserRole;
  let isAdmin: boolean;
  let created = false;

  if (existing) {
    userId = existing.id;
    role = existing.role;
    isAdmin = existing.isAdmin;
  } else {
    const snapshot = await deps.fetchClerkUser(clerkId);
    if (!snapshot.emailAddress) {
      throw new Error(`Clerk user ${clerkId} has no primary email address`);
    }
    const referralCode = await deps.generateUniqueReferralCode();
    const user = await deps.createUser({
      clerkId,
      email: snapshot.emailAddress,
      firstName: snapshot.firstName ?? "",
      lastName: snapshot.lastName ?? "",
      avatarUrl: snapshot.imageUrl,
      authProvider: determineAuthProvider(snapshot.externalAccounts),
      referralCode,
    });
    await deps.seedNotificationPreferences(user.id);
    userId = user.id;
    role = user.role;
    isAdmin = user.isAdmin;
    created = true;
  }

  // Always re-write Clerk metadata. Clerk does a deep-merge so this preserves
  // unrelated keys like `onboardingStatus`. The DB row is the source of truth
  // for {role, isAdmin}; this line keeps Clerk in sync with it.
  await deps.setClerkClaims(clerkId, { role, isAdmin });

  return { userId, role, isAdmin, created };
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
