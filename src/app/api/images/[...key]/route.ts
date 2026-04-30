import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { getServerAuth } from "@/lib/auth/server-auth";

export const dynamic = "force-dynamic";

const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });

function getBucket(): string {
  const bucket = process.env.S3_UPLOADS_BUCKET;
  if (!bucket) throw new Error("S3_UPLOADS_BUCKET is not set");
  return bucket;
}

// Per-prefix auth contract for content stored in the uploads bucket.
//
// The bucket itself is fully locked down (BlockPublicPolicy=true,
// RestrictPublicBuckets=true — see infra/modules/storage). This route
// is the only path bytes flow back to a browser; auth is gated here.
//
// - "public" matches the SharedBoard model (anonymous URLs are intentional)
// - "authed" requires any signed-in user (granular per-resource scoping
//   like "session participants only" or "owner only" can layer on later
//   without changing storage; this is the minimum bar that works today)
type AuthMode = "public" | "authed";
const PREFIX_AUTH: Array<{ prefix: string; mode: AuthMode }> = [
  { prefix: "inspiration/", mode: "public" }, // curated content library
  { prefix: "avatars/", mode: "public" },     // visible in stylist directory + reviews
  { prefix: "boards/", mode: "public" },      // /board/[id] is anonymous-by-default
  { prefix: "closet/", mode: "authed" },      // private to user + active-session stylist
  { prefix: "chat/", mode: "authed" },        // session participants only
];

function authModeFor(key: string): AuthMode | null {
  for (const { prefix, mode } of PREFIX_AUTH) {
    if (key.startsWith(prefix)) return mode;
  }
  return null;
}

function cacheControl(mode: AuthMode): string {
  // Public images get aggressive caching at the browser + any intermediate
  // CDN we eventually slot in front. Private images stay non-shareable so
  // a user can't paste a URL to someone else and have it cache hit.
  return mode === "public"
    ? "public, max-age=86400, s-maxage=604800, immutable"
    : "private, max-age=300, no-store";
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key: keyParts } = await params;
  const key = keyParts.join("/");

  const mode = authModeFor(key);
  if (!mode) {
    // Unrecognised prefix — refuse rather than passing through. New prefixes
    // must be added to PREFIX_AUTH explicitly so we never accidentally serve
    // bytes from a key shape we didn't think about.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (mode === "authed") {
    const { userId } = await getServerAuth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let result: GetObjectCommandOutput;
  try {
    result = await s3.send(
      new GetObjectCommand({ Bucket: getBucket(), Key: key }),
    );
  } catch (err: unknown) {
    const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
    const status = e.$metadata?.httpStatusCode;
    if (status === 404 || e.name === "NoSuchKey") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    throw err;
  }

  if (!result.Body) {
    return NextResponse.json({ error: "Empty body" }, { status: 502 });
  }

  // S3's Body is a Web ReadableStream on Node 22; pass straight to NextResponse.
  return new NextResponse(result.Body.transformToWebStream(), {
    status: 200,
    headers: {
      "Content-Type": result.ContentType ?? "application/octet-stream",
      "Content-Length": result.ContentLength?.toString() ?? "",
      "Cache-Control": cacheControl(mode),
      ...(result.ETag ? { ETag: result.ETag } : {}),
    },
  });
}
