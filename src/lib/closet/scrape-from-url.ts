import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { putObject } from "@/lib/s3";
import { normalizeDesigner, deriveSeason } from "./taxonomy";
import type { ClosetItem } from "@/generated/prisma/client";

const FETCH_TIMEOUT_MS = 5000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const USER_AGENT =
  "Mozilla/5.0 (compatible; WishiCloset/1.0; +https://wishi.me)";

export interface ScrapeResult {
  closetItem: ClosetItem;
  partial: boolean; // true if we couldn't parse a full product
}

export interface ScrapeInput {
  userId: string;
  url: string;
  category?: string;
}

interface OpenGraph {
  title: string | null;
  imageUrl: string | null;
  siteName: string | null;
  brand: string | null;
}

export async function scrapeFromUrl(input: ScrapeInput): Promise<ScrapeResult> {
  const og = await fetchOpenGraph(input.url);

  let s3Key = "";
  if (og.imageUrl) {
    try {
      s3Key = await downloadAndUpload(og.imageUrl, input.userId);
    } catch (err) {
      console.warn("[closet-scrape] image upload failed:", err);
    }
  }

  const closetItem = await prisma.closetItem.create({
    data: {
      userId: input.userId,
      s3Key,
      url: input.url,
      name: og.title,
      designer: normalizeDesigner(og.brand ?? og.siteName),
      season: deriveSeason(input.category),
      category: input.category ?? null,
      colors: [],
    },
  });

  return { closetItem, partial: !og.title || !og.imageUrl };
}

async function fetchOpenGraph(url: string): Promise<OpenGraph> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { title: null, imageUrl: null, siteName: null, brand: null };
    const html = await res.text();
    return parseOpenGraph(html);
  } catch {
    return { title: null, imageUrl: null, siteName: null, brand: null };
  }
}

function parseOpenGraph(html: string): OpenGraph {
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
  const res = await fetch(imageUrl, {
    headers: { "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
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
