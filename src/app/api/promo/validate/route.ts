import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { validateForCheckout } from "@/lib/promotions/promo-code.service";

export const dynamic = "force-dynamic";

const schema = z.object({ code: z.string().min(1).max(64) });

/**
 * Client-facing promo validator powering the session-checkout Apply button.
 * Auth-gated so the endpoint can't be probed anonymously. The response shape
 * is intentionally uniform (no leaking stripeCouponId / promoCodeId or
 * which codes exist beyond a uniform { ok: false, reason } error map) and
 * the response is never cached.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "unauthorized" },
      { status: 401 },
    );
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, reason: "bad_input" },
      { status: 400 },
    );
  }

  const result = await validateForCheckout(parsed.data.code);
  if (!result.ok) {
    return NextResponse.json(result);
  }
  return NextResponse.json({
    ok: true,
    code: result.code,
    amountInCents: result.amountInCents,
  });
}
