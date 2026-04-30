import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "../../src/generated/prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// S3 client + helpers inlined here (rather than importing from src/lib/s3)
// because the production Docker image only copies prisma/ + node_modules
// + src/generated. Re-importing src/lib/s3.ts would crash the seed when
// invoked via `ecs run-task` against the deployed image.
const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });

function getBucket(): string {
  const bucket = process.env.S3_UPLOADS_BUCKET;
  if (!bucket) throw new Error("S3_UPLOADS_BUCKET is not set");
  return bucket;
}

function getPublicUrl(key: string): string {
  const region = process.env.AWS_REGION ?? "us-east-1";
  return `https://${getBucket()}.s3.${region}.amazonaws.com/${key}`;
}

async function putObject(
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

/**
 * Seed the InspirationPhoto library with the curated stylist mood-board
 * starter set. Reads JPGs from `prisma/seeds/inspirations/`, uploads each
 * to S3 under `inspiration/seed-<basename>.jpg`, then upserts a row.
 *
 * Idempotent: an `s3Key` collision skips the upload + upsert silently.
 *
 * Required env: `S3_UPLOADS_BUCKET`, `AWS_REGION`, and AWS credentials
 * resolvable by the SDK (task role on ECS, or `AWS_PROFILE=<staging>`
 * locally).
 */
export async function seedInspirations(prisma: PrismaClient) {
  const dir = join(__dirname, "inspirations");
  const files = readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  if (files.length === 0) {
    console.log("[inspirations] no source images found, skipping");
    return;
  }
  if (!process.env.S3_UPLOADS_BUCKET) {
    console.log(
      "[inspirations] S3_UPLOADS_BUCKET not set — skipping (run with staging/prod env)",
    );
    return;
  }

  let uploaded = 0;
  let skipped = 0;
  for (const file of files) {
    const s3Key = `inspiration/seed-${file}`;
    const existing = await prisma.inspirationPhoto.findFirst({
      where: { s3Key },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }
    const body = readFileSync(join(dir, file));
    const ext = file.split(".").pop()?.toLowerCase();
    const contentType =
      ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    await putObject(s3Key, body, contentType);
    await prisma.inspirationPhoto.create({
      data: {
        s3Key,
        url: getPublicUrl(s3Key),
        category: "female",
        tags: [],
      },
    });
    uploaded += 1;
  }
  console.log(
    `[inspirations] ${uploaded} uploaded, ${skipped} already present, ${files.length} total`,
  );
}
