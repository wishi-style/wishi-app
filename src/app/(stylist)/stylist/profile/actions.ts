"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { splitName, splitLocation } from "./helpers";
import { setProfileMoodboard } from "@/lib/stylists/profile-images.service";

// Persists the editable fields on /stylist/profile. Text and identity
// fields write to User / StylistProfile / UserLocation; the optional
// avatar URL writes to User.avatarUrl; the optional moodboard upload
// writes to StylistProfile.profileMoodboardId via setProfileMoodboard().
//
// Image uploads use the presigned-URL flow: client requests a URL via
// /api/uploads/presigned?purpose=..., PUTs the file to S3, then passes
// the resulting public URL + s3 key here. Already-saved images come
// back through the form unchanged and are passed-through verbatim.
//
// `fullName` is split on the first whitespace into firstName / lastName
// so the existing User shape stays intact. `location` is split on
// "City, State" or "City, Country"; non-comma input drops into city.
// `instagramHandle` arrives normalised (handle only, no @ prefix) — the
// client extracts it via extractInstagramHandle() before posting.

const payloadSchema = z.object({
  fullName: z.string().trim().min(1).max(80),
  location: z.string().trim().min(1).max(80),
  philosophy: z.string().trim().min(1).max(500),
  directorsPick: z.string().trim().min(1).max(500),
  bio: z.string().trim().min(1).max(1000),
  instagramHandle: z
    .string()
    .regex(/^[A-Za-z0-9_.]{1,30}$/)
    .nullable(),
  // Already-uploaded image URL (or null to clear). The client never
  // forwards data: URLs — those go through presign+PUT first so the DB
  // only ever sees S3-backed URLs.
  avatarUrl: z.string().min(1).nullable().optional(),
  // Profile moodboard upload — only the *new* upload's s3Key + url are
  // sent; existing moodboards are addressed by the URL alone (no-op).
  moodboardUpload: z
    .object({
      s3Key: z.string().min(1),
      url: z.string().min(1),
    })
    .nullable()
    .optional(),
});

export type SaveStylistProfilePayload = z.infer<typeof payloadSchema>;

export type SaveStylistProfileResult =
  | { ok: true }
  | { ok: false; error: string };

export async function saveStylistProfile(
  payload: unknown,
): Promise<SaveStylistProfileResult> {
  const user = await getCurrentAuthUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (user.role !== "STYLIST") return { ok: false, error: "Stylist role required" };

  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  const { firstName, lastName } = splitName(data.fullName);
  const { city, state } = splitLocation(data.location);

  await prisma.$transaction(async (tx) => {
    const userUpdate: Record<string, unknown> = { firstName, lastName };
    if (data.avatarUrl !== undefined) userUpdate.avatarUrl = data.avatarUrl;

    await tx.user.update({ where: { id: user.id }, data: userUpdate });

    await tx.stylistProfile.update({
      where: { userId: user.id },
      data: {
        bio: data.bio,
        philosophy: data.philosophy,
        directorPick: data.directorsPick,
        instagramHandle: data.instagramHandle,
      },
    });

    const existing = await tx.userLocation.findFirst({
      where: { userId: user.id, isPrimary: true },
      select: { id: true },
    });
    if (existing) {
      await tx.userLocation.update({
        where: { id: existing.id },
        data: { city, state },
      });
    } else {
      await tx.userLocation.create({
        data: { userId: user.id, isPrimary: true, city, state },
      });
    }
  });

  // Moodboard upsert is its own transaction (deletes old photos, creates
  // a new one, links the Board → StylistProfile). Run after the text-fields
  // commit so a moodboard failure doesn't roll back the rest — the user
  // gets the saved bio/etc and a clear error to retry the upload.
  if (data.moodboardUpload) {
    try {
      await setProfileMoodboard(
        user.id,
        data.moodboardUpload.s3Key,
        data.moodboardUpload.url,
      );
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? `Profile saved, but moodboard upload failed: ${err.message}`
            : "Profile saved, but moodboard upload failed",
      };
    }
  }

  return { ok: true };
}
