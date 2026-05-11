import { NextResponse } from "next/server";
import { forbidden } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { searchSuitPairs } from "@/lib/inventory/inventory-client";
import { loadClientStylingContext } from "@/lib/inventory/client-context";
import type { SuitPairQueryDto } from "@/lib/inventory/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/stylist/sessions/[id]/shop-inventory/suit-pairs
 *
 * Body: `{ colorFamily, semanticQuery?, limit? }`. The stylist's client
 * context fills in `gender` + `excludeLeather` defaults; explicit fields
 * win.
 *
 * Returns: `{ pairs: SuitPairRow[] }`. Empty array when the service is down
 * or returns no matches — UI shows an empty state.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId: clerkId } = await requireRole("STYLIST");
  const { id: sessionId } = await params;

  const stylistUser = await prisma.user.findUnique({
    where: { clerkId },
    select: { id: true },
  });
  if (!stylistUser) forbidden();

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { stylistId: true },
  });
  if (!session || session.stylistId !== stylistUser.id) {
    forbidden();
  }

  const body = (await req.json().catch(() => ({}))) as Partial<SuitPairQueryDto>;
  if (!body.colorFamily) {
    return NextResponse.json(
      { error: "colorFamily is required" },
      { status: 400 },
    );
  }

  const ctx = await loadClientStylingContext({ sessionId });

  const dto: SuitPairQueryDto = {
    colorFamily: body.colorFamily,
    semanticQuery: body.semanticQuery,
    gender: body.gender ?? ctx?.inventoryGender ?? undefined,
    excludeLeather:
      body.excludeLeather ?? ctx?.excludeLeatherByDefault ?? undefined,
    brandId: body.brandId,
    minPrice: body.minPrice,
    maxPrice: body.maxPrice,
    limit: body.limit,
  };

  const pairs = await searchSuitPairs(dto);
  return NextResponse.json({ pairs });
}
