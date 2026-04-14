import { auth } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPresignedUploadUrl } from "@/lib/s3";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILENAME_LENGTH = 255;

export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const filename = req.nextUrl.searchParams.get("filename");
  const contentType = req.nextUrl.searchParams.get("contentType");

  if (!filename || !contentType) {
    return Response.json(
      { error: "filename and contentType are required" },
      { status: 400 },
    );
  }

  if (filename.length > MAX_FILENAME_LENGTH) {
    return Response.json({ error: "Filename too long" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(contentType)) {
    return Response.json(
      { error: `Invalid content type. Allowed: ${ALLOWED_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  const { url, key } = await getPresignedUploadUrl(
    user.id,
    filename,
    contentType,
  );

  return Response.json({ url, key });
}
