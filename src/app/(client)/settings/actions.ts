"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getPublicUrl } from "@/lib/s3";
import { revalidatePath } from "next/cache";
import { Gender } from "@/generated/prisma/client";

export async function confirmAvatarUpload(s3Key: string) {
  const { userId: clerkId } = await auth();
  if (!clerkId) throw new Error("Unauthorized");

  const avatarUrl = getPublicUrl(s3Key);

  await prisma.user.update({
    where: { clerkId },
    data: { avatarUrl },
  });

  revalidatePath("/settings");
}

const VALID_GENDERS = new Set<Gender>([
  "FEMALE",
  "MALE",
  "NON_BINARY",
  "PREFER_NOT_TO_SAY",
]);

function nullable(v: FormDataEntryValue | null): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseGender(v: FormDataEntryValue | null): Gender | null {
  const s = nullable(v);
  if (!s) return null;
  return VALID_GENDERS.has(s as Gender) ? (s as Gender) : null;
}

function parseBirthday(v: FormDataEntryValue | null): Date | null {
  const s = nullable(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "New York, NY" → { city: "New York", state: "NY" }; bare "Paris" → city. */
function parseLocation(
  v: FormDataEntryValue | null,
): { city: string | null; state: string | null } | null {
  const s = nullable(v);
  if (!s) return null;
  const [cityRaw, stateRaw] = s.split(",").map((p) => p.trim());
  return { city: cityRaw || null, state: stateRaw || null };
}

export async function updateProfile(formData: FormData) {
  const { userId: clerkId } = await auth();
  if (!clerkId) throw new Error("Unauthorized");

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!user) throw new Error("Unauthorized");

  const firstName = nullable(formData.get("firstName"));
  const lastName = nullable(formData.get("lastName"));
  const phone = formData.get("phone");
  const phoneNorm =
    typeof phone === "string" ? (phone.trim() ? phone.trim() : null) : undefined;
  const birthday = parseBirthday(formData.get("birthday"));
  const gender = parseGender(formData.get("gender"));
  const height = nullable(formData.get("height"));
  const bodyType = nullable(formData.get("bodyType"));
  const occupation = nullable(formData.get("occupation"));
  const instagram = nullable(formData.get("instagram"));
  const pinterest = nullable(formData.get("pinterest"));
  const location = parseLocation(formData.get("location"));

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        ...(phoneNorm !== undefined ? { phone: phoneNorm } : {}),
        ...(formData.has("birthday") ? { birthday } : {}),
        ...(formData.has("gender") ? { gender } : {}),
      },
    });

    if (formData.has("height") || formData.has("bodyType")) {
      await tx.bodyProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          height: height ?? undefined,
          bodyType: bodyType ?? undefined,
        },
        update: {
          ...(formData.has("height") ? { height } : {}),
          ...(formData.has("bodyType") ? { bodyType } : {}),
        },
      });
    }

    if (formData.has("occupation")) {
      await tx.styleProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          occupation: occupation ?? undefined,
          stylePreferences: [],
          styleIcons: [],
        },
        update: { occupation },
      });
    }

    if (formData.has("location")) {
      const existing = await tx.userLocation.findFirst({
        where: { userId: user.id, isPrimary: true },
        select: { id: true },
      });
      if (location) {
        if (existing) {
          await tx.userLocation.update({
            where: { id: existing.id },
            data: { city: location.city, state: location.state },
          });
        } else {
          await tx.userLocation.create({
            data: {
              userId: user.id,
              city: location.city,
              state: location.state,
              isPrimary: true,
            },
          });
        }
      } else if (existing) {
        await tx.userLocation.delete({ where: { id: existing.id } });
      }
    }

    for (const platform of ["instagram", "pinterest"] as const) {
      if (!formData.has(platform)) continue;
      const value = platform === "instagram" ? instagram : pinterest;
      const existing = await tx.userSocialLink.findFirst({
        where: { userId: user.id, platform },
        select: { id: true },
      });
      if (value) {
        if (existing) {
          await tx.userSocialLink.update({
            where: { id: existing.id },
            data: { url: value },
          });
        } else {
          await tx.userSocialLink.create({
            data: { userId: user.id, platform, url: value },
          });
        }
      } else if (existing) {
        await tx.userSocialLink.delete({ where: { id: existing.id } });
      }
    }
  });

  revalidatePath("/settings");
}
