import { clerkClient } from "@clerk/nextjs/server";
import { writeAudit } from "@/lib/audit/log";
import type { StylistType } from "@/generated/prisma/client";

// Marker we attach to every stylist invitation so listing can distinguish
// stylist invites from any other invitations Clerk may send (admin invites,
// org invites, future bulk imports). The webhook reads the same flag at
// `user.created` time to decide whether to auto-promote.
const STYLIST_INVITE_FLAG = "stylistInvitation";

export type StylistInvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export type StylistInvitationRow = {
  id: string;
  emailAddress: string;
  stylistType: StylistType;
  status: StylistInvitationStatus;
  createdAt: Date;
  updatedAt: Date;
  url?: string;
};

function isStylistInvitation(meta: Record<string, unknown> | null | undefined) {
  return Boolean(meta && (meta as Record<string, unknown>)[STYLIST_INVITE_FLAG]);
}

function readStylistTypeFromMeta(
  meta: Record<string, unknown> | null | undefined,
): StylistType {
  const raw = meta?.stylistType;
  if (raw === "PLATFORM" || raw === "IN_HOUSE") return raw;
  // Default for invitations created before stylistType was tracked. Newer
  // invites always carry the field, so this branch is a safety net only.
  return "PLATFORM";
}

export async function createStylistInvitation({
  emailAddress,
  stylistType,
  redirectUrl,
  actorUserId,
}: {
  emailAddress: string;
  stylistType: StylistType;
  redirectUrl: string;
  actorUserId: string;
}): Promise<StylistInvitationRow> {
  const client = await clerkClient();
  const invitation = await client.invitations.createInvitation({
    emailAddress,
    redirectUrl,
    notify: true,
    publicMetadata: {
      [STYLIST_INVITE_FLAG]: true,
      stylistType,
    } as Record<string, unknown>,
  });

  await writeAudit({
    actorUserId,
    action: "stylist.invitation_sent",
    entityType: "StylistInvitation",
    entityId: invitation.id,
    meta: { emailAddress, stylistType },
  });

  return {
    id: invitation.id,
    emailAddress: invitation.emailAddress,
    stylistType,
    status: invitation.status,
    createdAt: new Date(invitation.createdAt),
    updatedAt: new Date(invitation.updatedAt),
    url: invitation.url,
  };
}

export async function listStylistInvitations(filter?: {
  status?: StylistInvitationStatus;
}): Promise<StylistInvitationRow[]> {
  const client = await clerkClient();
  // Clerk paginates at 500 max per page; we don't expect more than that for
  // the foreseeable future. If we do, switch to offset pagination here.
  const response = await client.invitations.getInvitationList({
    status: filter?.status,
    limit: 500,
    orderBy: "-created_at",
  });

  return response.data
    .filter((inv) => isStylistInvitation(inv.publicMetadata))
    .map((inv) => ({
      id: inv.id,
      emailAddress: inv.emailAddress,
      stylistType: readStylistTypeFromMeta(inv.publicMetadata),
      status: inv.status,
      createdAt: new Date(inv.createdAt),
      updatedAt: new Date(inv.updatedAt),
      url: inv.url,
    }));
}

export async function revokeStylistInvitation({
  invitationId,
  actorUserId,
}: {
  invitationId: string;
  actorUserId: string;
}): Promise<StylistInvitationRow> {
  const client = await clerkClient();
  const invitation = await client.invitations.revokeInvitation(invitationId);

  await writeAudit({
    actorUserId,
    action: "stylist.invitation_revoked",
    entityType: "StylistInvitation",
    entityId: invitationId,
    meta: {
      emailAddress: invitation.emailAddress,
    },
  });

  return {
    id: invitation.id,
    emailAddress: invitation.emailAddress,
    stylistType: readStylistTypeFromMeta(invitation.publicMetadata),
    status: invitation.status,
    createdAt: new Date(invitation.createdAt),
    updatedAt: new Date(invitation.updatedAt),
    url: invitation.url,
  };
}

// Exposed for the Clerk webhook handler — it needs to detect a stylist
// invitation on `user.created` and auto-promote the new User row. Kept
// next to the writers so the marker key has exactly one source of truth.
export function readStylistInvitationFromMetadata(
  publicMetadata: Record<string, unknown> | null | undefined,
): { stylistType: StylistType } | null {
  if (!isStylistInvitation(publicMetadata)) return null;
  return { stylistType: readStylistTypeFromMeta(publicMetadata) };
}
