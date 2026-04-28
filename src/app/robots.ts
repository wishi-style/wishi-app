import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/stylist/",
          "/sessions/",
          "/settings",
          "/favorites",
          "/orders",
          "/cart",
          "/profile",
          "/matches",
          "/onboarding/",
          "/sign-in",
          "/sign-up",
          "/bookings/",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
