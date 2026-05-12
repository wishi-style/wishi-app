import { NextResponse } from "next/server";
import { forbidden } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFilters } from "@/lib/inventory/inventory-client";
import {
  loadClientStylingContext,
  toClientContextSummary,
} from "@/lib/inventory/client-context";

export const dynamic = "force-dynamic";

/**
 * GET /api/stylist/sessions/[id]/shop-inventory/facets
 *
 * Returns the canonical filter facet lists from the inventory service
 * (`getFilters`) plus the sanitised client-styling-context summary the UI
 * needs to render the "Tuned for {client}" chip row and per-card budget
 * pills. Cached for 5 min server-side (inventory client) and 1 min on the
 * response so React re-mounts don't replay the request.
 */
export async function GET(
  _req: Request,
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

  const [facets, ctx] = await Promise.all([
    getFilters(),
    loadClientStylingContext({ sessionId }),
  ]);

  return NextResponse.json(
    {
      facets,
      context: ctx ? toClientContextSummary(ctx) : null,
    },
    {
      headers: { "cache-control": "private, max-age=60" },
    },
  );
}
