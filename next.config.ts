import type { NextConfig } from "next";

// Phase 11 launch-hardening headers. HSTS is only meaningful once the
// deployed origin is HTTPS (staging is bare ALB HTTP today — safe to send
// the header anyway since non-HTTPS browsers ignore it).
const SECURITY_HEADERS = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    authInterrupts: true,
  },
  // Hosts that `<Image src=...>` is allowed to load remote bytes from.
  // Next 16 blocks any unconfigured remote host with a 400 from
  // /_next/image, which on a server-rendered page bubbles up as a 500
  // from the page itself. The Clerk webhook writes user.avatarUrl from
  // `img.clerk.com` (and its dev-tenant variants) — without these
  // patterns, every authed surface that renders a real user's avatar
  // crashes mid-render. S3 is needed for closet/board photo uploads.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.clerk.com" },
      { protocol: "https", hostname: "images.clerk.dev" },
      { protocol: "https", hostname: "*.clerk.com" },
      { protocol: "https", hostname: "*.clerk.dev" },
      { protocol: "https", hostname: "*.s3.amazonaws.com" },
      { protocol: "https", hostname: "*.s3.us-east-1.amazonaws.com" },
      { protocol: "https", hostname: "wishi-staging-uploads.s3.amazonaws.com" },
      { protocol: "https", hostname: "wishi-production-uploads.s3.amazonaws.com" },
      // Inventory + retailer product imagery surfaced via the styleboard
      // canvas + cart. Tastegraph proxies upstream brand CDNs through
      // its own host, so allow the proxy domain.
      { protocol: "https", hostname: "*.tastegraph.com" },
      { protocol: "https", hostname: "tastegraph.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
  // Loveable design contract uses /bag for cart links. Permanent
  // redirect so any /bag link inside or outside the app lands on /cart.
  async redirects() {
    return [
      { source: "/bag", destination: "/cart", permanent: true },
    ];
  },
};

export default nextConfig;
