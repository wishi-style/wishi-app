import { getServerAuth } from "@/lib/auth/server-auth";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getPresignedUploadUrl,
  getBoardPhotoPresignedUrl,
  getStyleQuizBodyPhotoPresignedUrl,
  getPublicUrl,
} from "@/lib/s3";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILENAME_LENGTH = 255;
const ALLOWED_PURPOSES = ["avatar", "profile-moodboard", "style-quiz-body-photo"] as const;
type Purpose = (typeof ALLOWED_PURPOSES)[number];

export async function GET(req: NextRequest) {
  const { userId: clerkId } = await getServerAuth();
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
  const purpose = (req.nextUrl.searchParams.get("purpose") ?? "avatar") as Purpose;

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

  if (!ALLOWED_PURPOSES.includes(purpose)) {
    return Response.json(
      { error: `Invalid purpose. Allowed: ${ALLOWED_PURPOSES.join(", ")}` },
      { status: 400 },
    );
  }

  // Each purpose maps to a different bucket prefix; the presigned PUT pattern
  // is the same. style-quiz-body-photo lands under `style-quiz/<userId>/...`
  // so admin tooling can list a client's quiz uploads by prefix.
  if (purpose === "avatar") {
    const { url, key } = await getPresignedUploadUrl(user.id, filename, contentType);
    return Response.json({ url, key, publicUrl: getPublicUrl(key) });
  }
  if (purpose === "style-quiz-body-photo") {
    const { uploadUrl, key, publicUrl } = await getStyleQuizBodyPhotoPresignedUrl(
      user.id,
      filename,
      contentType,
    );
    return Response.json({ url: uploadUrl, key, publicUrl });
  }
  const { uploadUrl, key, publicUrl } = await getBoardPhotoPresignedUrl(
    user.id,
    filename,
    contentType,
  );
  return Response.json({ url: uploadUrl, key, publicUrl });
}
