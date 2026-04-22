import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const alt = "Wishi Stylist";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage({ params }: { params: { id: string } }) {
  const stylist = await prisma.stylistProfile
    .findUnique({
      where: { id: params.id },
      select: {
        styleSpecialties: true,
        user: { select: { firstName: true, lastName: true, avatarUrl: true } },
      },
    })
    .catch(() => null);

  const name = stylist
    ? `${stylist.user.firstName} ${stylist.user.lastName}`.trim()
    : "Wishi";
  const specialty = stylist?.styleSpecialties?.[0]?.toLowerCase() ?? "personal stylist";
  const avatar = stylist?.user.avatarUrl ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf8f5",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: 96,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 64,
            width: "100%",
          }}
        >
          {avatar ? (
            // next/og renders via satori; a raw <img> is the documented pattern here.
            <img
              src={avatar}
              alt={name}
              width={320}
              height={320}
              style={{
                borderRadius: 9999,
                objectFit: "cover",
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: 320,
                height: 320,
                borderRadius: 9999,
                background: "#e7e1d6",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 128,
                color: "#6b5f4e",
                fontWeight: 500,
              }}
            >
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
            }}
          >
            <div
              style={{
                fontSize: 28,
                color: "#6b5f4e",
                letterSpacing: 6,
                textTransform: "uppercase",
                marginBottom: 16,
              }}
            >
              Wishi Stylist
            </div>
            <div
              style={{
                fontSize: 80,
                color: "#1a1a1a",
                fontWeight: 500,
                lineHeight: 1.1,
                marginBottom: 24,
                letterSpacing: -2,
              }}
            >
              {name}
            </div>
            <div
              style={{
                fontSize: 36,
                color: "#4a4a4a",
                textTransform: "capitalize",
              }}
            >
              {specialty}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
