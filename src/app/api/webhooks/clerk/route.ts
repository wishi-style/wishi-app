import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { type UserJSON } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { claimGuestQuizResult } from "@/lib/quiz/claim-guest-quiz";
import {
  buildDefaultReconcileDeps,
  reconcileClerkUser,
} from "@/lib/auth/reconcile-clerk-user";
import { readStylistInvitationFromMetadata } from "@/lib/stylists/invite.service";
import { promoteToStylist } from "@/lib/users/admin.service";

export const dynamic = "force-dynamic";

async function handleUserCreated(data: UserJSON) {
  const clerkId = data.id;

  // Reconcile is idempotent: it upserts the Prisma row and re-syncs Clerk
  // publicMetadata.role. A retry that hits the `clerkId @unique` constraint
  // on a partially-created user will now fall through to the existing-row
  // branch and still re-write the role into Clerk, instead of erroring out
  // and leaving the user permanently role-less.
  const deps = await buildDefaultReconcileDeps();
  const { userId, created } = await reconcileClerkUser(clerkId, deps);

  // Guest-quiz claim is signup-only — don't replay it on retries.
  if (created) {
    const unsafeMetadata = data.unsafe_metadata as
      | { guestToken?: string }
      | undefined;
    await claimGuestQuizResult(userId, unsafeMetadata?.guestToken);
  }

  // Stylist invitations: when an admin invites someone via Clerk's
  // Invitations API, we attach `publicMetadata.stylistInvitation = true`
  // and the chosen `stylistType`. On signup that metadata flows into the
  // user.created event — auto-promote the brand-new CLIENT to STYLIST so
  // they hit /onboarding/1 with a real StylistProfile already created.
  // Failures here must NOT 5xx the webhook (Clerk would retry forever and
  // the second run would race with the first); log + swallow instead.
  const invite = readStylistInvitationFromMetadata(
    data.public_metadata as Record<string, unknown> | null | undefined,
  );
  if (invite && created) {
    try {
      await promoteToStylist({
        userId,
        stylistType: invite.stylistType,
        actorUserId: userId,
      });
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "clerk_webhook_stylist_invite_promote_failed",
          userId,
          clerkId,
          err: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  // Structured success log so CloudWatch metric filters can count successful
  // signups and correlate timing of new users with downstream activity.
  console.log(
    JSON.stringify({
      event: "clerk_webhook_user_created",
      userId,
      clerkId,
      created,
      stylistInvited: invite !== null,
    }),
  );
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
