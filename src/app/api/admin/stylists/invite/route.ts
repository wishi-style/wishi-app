import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
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

  // Use the request's host so the invitation link redirects back into the
  // same environment that issued it (staging vs prod). Falls back to the
  // configured app URL when the header is missing.
  const url = new URL(req.url);
  const redirectUrl = `${url.origin}/onboarding/step-1`;

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
