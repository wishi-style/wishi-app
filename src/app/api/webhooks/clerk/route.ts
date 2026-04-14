import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { clerkClient, type UserJSON } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateReferralCode } from "@/lib/auth/referral-code";
import type { AuthProvider, NotificationChannel } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

const NOTIFICATION_CATEGORIES = [
  "session_updates",
  "marketing",
  "chat",
  "promotions",
] as const;

function determineAuthProvider(
  externalAccounts: UserJSON["external_accounts"],
): AuthProvider {
  if (!externalAccounts?.length) return "EMAIL";
  const provider = externalAccounts[0].provider;
  if (provider === "google" || provider === "oauth_google") return "GOOGLE";
  if (provider === "apple" || provider === "oauth_apple") return "APPLE";
  return "EMAIL";
}

async function generateUniqueReferralCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = generateReferralCode();
    const existing = await prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });
    if (!existing) return code;
  }
  // Extremely unlikely — fall back to longer code
  return generateReferralCode() + generateReferralCode();
}

async function seedNotificationPreferences(userId: string) {
  const rows: Array<{
    userId: string;
    channel: NotificationChannel;
    category: string;
    isEnabled: boolean;
  }> = [];

  for (const category of NOTIFICATION_CATEGORIES) {
    // Email: all ON
    rows.push({ userId, channel: "EMAIL", category, isEnabled: true });
    // SMS: all ON (TCPA review flagged for legal before launch)
    rows.push({ userId, channel: "SMS", category, isEnabled: true });
    // Push: all OFF until browser/OS permission granted
    rows.push({ userId, channel: "PUSH", category, isEnabled: false });
  }

  await prisma.notificationPreference.createMany({ data: rows });
}

async function claimGuestQuizResult(
  userId: string,
  guestToken: string | undefined,
) {
  if (!guestToken) return;

  await prisma.matchQuizResult.updateMany({
    where: {
      guestToken,
      userId: null,
    },
    data: {
      userId,
      claimedAt: new Date(),
    },
  });
}

async function handleUserCreated(data: UserJSON) {
  const clerkId = data.id;
  const email = data.email_addresses?.[0]?.email_address;
  if (!email) {
    console.error("Webhook user.created: no email address", { clerkId });
    return;
  }

  const firstName = data.first_name || "";
  const lastName = data.last_name || "";
  const imageUrl = data.image_url;
  const authProvider = determineAuthProvider(data.external_accounts);
  const referralCode = await generateUniqueReferralCode();

  const unsafeMetadata = data.unsafe_metadata as
    | { guestToken?: string }
    | undefined;

  const user = await prisma.user.create({
    data: {
      clerkId,
      email,
      firstName,
      lastName,
      authProvider,
      avatarUrl: imageUrl || null,
      referralCode,
    },
  });

  // Set role in Clerk publicMetadata so it propagates to session JWTs
  const client = await clerkClient();
  await client.users.updateUserMetadata(clerkId, {
    publicMetadata: { role: "CLIENT" },
  });

  await seedNotificationPreferences(user.id);
  await claimGuestQuizResult(user.id, unsafeMetadata?.guestToken);
}

async function handleUserUpdated(data: UserJSON) {
  const clerkId = data.id;
  const email = data.email_addresses?.[0]?.email_address;

  const updateData: Record<string, unknown> = {
    lastLoginAt: new Date(),
  };

  if (email) updateData.email = email;
  if (data.first_name !== undefined) updateData.firstName = data.first_name;
  if (data.last_name !== undefined) updateData.lastName = data.last_name;
  if (data.image_url !== undefined) updateData.avatarUrl = data.image_url;

  await prisma.user.update({
    where: { clerkId },
    data: updateData,
  });
}

async function handleUserDeleted(data: { id?: string }) {
  const clerkId = data.id;
  if (!clerkId) return;

  // Soft-delete — preserve data for auditing
  await prisma.user.update({
    where: { clerkId },
    data: { deletedAt: new Date() },
  });
}

export async function POST(req: NextRequest) {
  try {
    const evt = await verifyWebhook(req);

    switch (evt.type) {
      case "user.created":
        await handleUserCreated(evt.data);
        break;
      case "user.updated":
        await handleUserUpdated(evt.data);
        break;
      case "user.deleted":
        await handleUserDeleted(evt.data);
        break;
      default:
        console.log(`Unhandled webhook event: ${evt.type}`);
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(`Webhook error: ${message}`, { status: 400 });
  }
}
