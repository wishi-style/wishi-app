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
 * Resolve an S3 object key to a browser-loadable URL. The uploads bucket
 * itself is fully locked down (BlockPublicPolicy=true,
 * RestrictPublicBuckets=true — see infra/modules/storage), so direct
 * `https://<bucket>.s3.<region>.amazonaws.com/<key>` URLs return 403.
 *
 * Bytes flow back to the browser through `/api/images/[...key]`, which
 * pipes the S3 GetObject result with per-prefix auth gating. Returning
 * a relative path keeps URLs portable across staging/production and
 * survives a future CloudFront swap (the route handler can become a
 * 302 to a signed CloudFront URL with no consumer changes).
 */
export function getPublicUrl(key: string): string {
  return `/api/images/${key}`;
}

/**
 * Direct server-side upload. Used by the URL-based closet scraper to push
 * fetched product images into the uploads bucket.
 */
export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}
