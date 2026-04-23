import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const STATIC_ROUTES = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.9 },
  { path: "/how-it-works", changeFrequency: "monthly", priority: 0.8 },
  { path: "/lux", changeFrequency: "monthly", priority: 0.8 },
  { path: "/stylists", changeFrequency: "daily", priority: 0.9 },
  { path: "/feed", changeFrequency: "daily", priority: 0.7 },
  { path: "/match-quiz", changeFrequency: "monthly", priority: 0.7 },
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const now = new Date();

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${base}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  // Match-eligible stylists only. StylistProfile.id is the URL slug.
  const stylists = await prisma.stylistProfile
    .findMany({
      where: { matchEligible: true },
      select: { id: true, updatedAt: true },
      take: 5000,
    })
    .catch(() => []);

  const stylistEntries: MetadataRoute.Sitemap = stylists.map((s) => ({
    url: `${base}/stylists/${s.id}`,
    lastModified: s.updatedAt,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticEntries, ...stylistEntries];
}
