import { NextResponse } from "next/server";
import { listStylistReviews } from "@/lib/stylists/review.service";
import { isDomainError } from "@/lib/errors/domain-error";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

function parsePaginationParam(
  raw: string | null,
  name: string,
): { value?: number; error?: string } {
  if (raw === null) return {};
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    return { error: `${name} must be a non-negative integer` };
  }
  return { value: parsed };
}

export async function GET(req: Request, { params }: Props) {
  const { id: stylistProfileId } = await params;
  const url = new URL(req.url);

  const limit = parsePaginationParam(url.searchParams.get("limit"), "limit");
  if (limit.error) {
    return NextResponse.json({ error: limit.error }, { status: 400 });
  }
  const offset = parsePaginationParam(url.searchParams.get("offset"), "offset");
  if (offset.error) {
    return NextResponse.json({ error: offset.error }, { status: 400 });
  }

  try {
    const result = await listStylistReviews(stylistProfileId, {
      limit: limit.value,
      offset: offset.value,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (isDomainError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
