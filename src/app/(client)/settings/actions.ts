"use server";

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { getPublicUrl } from "@/lib/s3";
import { revalidatePath } from "next/cache";

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

export async function updateProfile(formData: FormData) {
  const { userId: clerkId } = await auth();
  if (!clerkId) throw new Error("Unauthorized");

  const firstName = formData.get("firstName");
  const lastName = formData.get("lastName");
  const phone = formData.get("phone");

  await prisma.user.update({
    where: { clerkId },
    data: {
      ...(typeof firstName === "string" && { firstName }),
      ...(typeof lastName === "string" && { lastName }),
      ...(typeof phone === "string" && { phone: phone || null }),
    },
  });

  revalidatePath("/settings");
}
