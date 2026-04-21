import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getPublicUrl, putObject } from "@/lib/s3";
import { assertPublicHttpUrl, UnsafeUrlError } from "./url-safety";
import { normalizeDesigner, deriveSeason } from "./taxonomy";
import type { ClosetItem } from "@/generated/prisma/client";

const FETCH_TIMEOUT_MS = 5000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const USER_AGENT =
  "Mozilla/5.0 (compatible; WishiCloset/1.0; +https://wishi.me)";

export interface ScrapeResult {
  closetItem: ClosetItem;
  partial: boolean; // true if metadata is incomplete or image didn't land in S3
}

export interface ScrapeInput {
  userId: string;
  url: string;
  category?: string;
}

export interface OpenGraph {
  title: string | null;
  imageUrl: string | null;
  siteName: string | null;
  brand: string | null;
}

export async function scrapeFromUrl(input: ScrapeInput): Promise<ScrapeResult> {
  // `url` is validated again here (not just at the route) so worker/test
  // callers can't skip the SSRF guard.
  await assertPublicHttpUrl(input.url);

  const og = await fetchOpenGraph(input.url);

  let s3Key = "";
  let uploadFailed = false;
  if (og.imageUrl) {
    try {
      s3Key = await downloadAndUpload(og.imageUrl, input.userId);
    } catch (err) {
      uploadFailed = true;
      console.warn("[closet-scrape] image upload failed:", err);
    }
  }

  // `ClosetItem.url` is read as the `<img src>` across closet/styleboard UI,
  // so it must be an image URL. Prefer the S3 copy, fall back to the OG image
  // (at least renders something while we investigate the upload failure), and
  // last-resort leave it empty rather than writing the retailer page URL.
  const imageUrl = s3Key
    ? getPublicUrl(s3Key)
    : og.imageUrl ?? "";

  const closetItem = await prisma.closetItem.create({
    data: {
      userId: input.userId,
      s3Key,
      url: imageUrl,
      name: og.title,
      designer: normalizeDesigner(og.brand ?? og.siteName),
      season: deriveSeason(input.category),
      category: input.category ?? null,
      colors: [],
    },
  });

  const partial = !og.title || !og.imageUrl || uploadFailed;
  return { closetItem, partial };
}

async function fetchOpenGraph(url: string): Promise<OpenGraph> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "manual",
    });
    if (!res.ok) return { title: null, imageUrl: null, siteName: null, brand: null };
    const html = await res.text();
    return parseOpenGraph(html);
  } catch {
    return { title: null, imageUrl: null, siteName: null, brand: null };
  }
}

export function parseOpenGraph(html: string): OpenGraph {
  const meta = (property: string): string | null => {
    const m = new RegExp(
      `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`,
      "i",
    ).exec(html);
    return m?.[1] ?? null;
  };
  const nameMeta = (name: string): string | null => {
    const m = new RegExp(
      `<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`,
      "i",
    ).exec(html);
    return m?.[1] ?? null;
  };
  return {
    title: meta("og:title") ?? nameMeta("title"),
    imageUrl: meta("og:image") ?? meta("og:image:secure_url"),
    siteName: meta("og:site_name"),
    brand: meta("product:brand") ?? nameMeta("brand"),
  };
}

async function downloadAndUpload(
  imageUrl: string,
  userId: string,
): Promise<string> {
  // OG image URLs come from the scraped page — still untrusted. Re-run the
  // SSRF guard before fetching so a malicious product page can't send us to
  // 169.254.169.254 via `og:image`.
  try {
    await assertPublicHttpUrl(imageUrl);
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      throw new Error(`og:image rejected: ${err.message}`);
    }
    throw err;
  }

  const res = await fetch(imageUrl, {
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "manual",
  });
  if (!res.ok) throw new Error(`image fetch failed: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`image too large: ${buf.byteLength} bytes`);
  }
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const ext = contentType.includes("png") ? "png" : "jpg";
  const hash = createHash("sha1").update(imageUrl).digest("hex").slice(0, 8);
  const key = `closet/${userId}/${randomUUID()}-${hash}.${ext}`;
  await putObject(key, buf, contentType);
  return key;
}
