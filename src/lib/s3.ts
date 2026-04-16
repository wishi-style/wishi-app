import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });

function getBucket(): string {
  const bucket = process.env.S3_UPLOADS_BUCKET;
  if (!bucket) throw new Error("S3_UPLOADS_BUCKET is not set");
  return bucket;
}

/**
 * Generate a presigned PUT URL for direct browser upload to S3.
 * Returns the upload URL and the S3 object key.
 *
 * On ECS Fargate, the S3Client picks up credentials from the task role
 * automatically — no access keys needed.
 */
export async function getPresignedUploadUrl(
  userId: string,
  filename: string,
  contentType: string,
): Promise<{ url: string; key: string }> {
  const key = `avatars/${userId}/${filename}`;
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3, command, { expiresIn: 300 });
  return { url, key };
}

/**
 * Generate a presigned PUT URL for chat media uploads.
 */
export async function getChatMediaPresignedUrl(
  sessionId: string,
  filename: string,
  contentType: string,
): Promise<{ uploadUrl: string; key: string; publicUrl: string }> {
  const key = `chat/${sessionId}/${Date.now()}-${filename}`;
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
  return { uploadUrl, key, publicUrl: getPublicUrl(key) };
}

/**
 * Presigned PUT for a stylist's custom board photo (moodboard uploads).
 */
export async function getBoardPhotoPresignedUrl(
  stylistUserId: string,
  filename: string,
  contentType: string,
): Promise<{ uploadUrl: string; key: string; publicUrl: string }> {
  const key = `boards/${stylistUserId}/${Date.now()}-${filename}`;
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
  return { uploadUrl, key, publicUrl: getPublicUrl(key) };
}

/**
 * Presigned PUT for an admin-uploaded inspiration library photo.
 */
export async function getInspirationPhotoPresignedUrl(
  filename: string,
  contentType: string,
): Promise<{ uploadUrl: string; key: string; publicUrl: string }> {
  const key = `inspiration/${Date.now()}-${filename}`;
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
  return { uploadUrl, key, publicUrl: getPublicUrl(key) };
}

/**
 * Presigned PUT for a client-uploaded closet item photo.
 */
export async function getClosetItemPresignedUrl(
  userId: string,
  filename: string,
  contentType: string,
): Promise<{ uploadUrl: string; key: string; publicUrl: string }> {
  const key = `closet/${userId}/${Date.now()}-${filename}`;
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
  return { uploadUrl, key, publicUrl: getPublicUrl(key) };
}

/**
 * Build the public URL for an S3 object.
 * Uses direct S3 URL for now; will switch to CloudFront when CDN is configured.
 */
export function getPublicUrl(key: string): string {
  const region = process.env.AWS_REGION ?? "us-east-1";
  return `https://${getBucket()}.s3.${region}.amazonaws.com/${key}`;
}
