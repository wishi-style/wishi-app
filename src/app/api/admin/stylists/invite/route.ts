import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { resolveAppUrl } from "@/lib/app-url";
import { createStylistInvitation } from "@/lib/stylists/invite.service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  stylistType: z.enum(["PLATFORM", "IN_HOUSE"]),
});

export async function POST(req: Request) {
  const admin = await requireAdmin();

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof z.ZodError
            ? err.issues[0]?.message ?? "Invalid request"
            : "Invalid JSON",
      },
      { status: 400 },
    );
  }

  // Behind ALB → ECS, `req.url` resolves to the container's private
  // hostname (e.g. ip-10-1-10-34.ec2.internal:3000), which a recipient's
  // browser can't reach. resolveAppUrl prefers APP_URL (set per env in
  // task definition), then x-forwarded-host, so the invite link always
  // points at the public origin.
  const appUrl = resolveAppUrl({
    envAppUrl: process.env.APP_URL,
    headers: await headers(),
  });
  const redirectUrl = `${appUrl}/onboarding/1`;

  try {
    const invitation = await createStylistInvitation({
      emailAddress: body.email,
      stylistType: body.stylistType,
      redirectUrl,
      actorUserId: admin.userId,
    });
    return NextResponse.json({ invitation });
  } catch (err) {
    // Clerk surfaces "duplicate invitation" / "already a member" as 422
    // with a structured body. We surface the message to the admin so they
    // can decide whether to revoke + reinvite.
    const message = err instanceof Error ? err.message : "Invite failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
