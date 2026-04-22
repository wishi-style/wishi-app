import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  addItemsToCollection,
  removeItemFromCollection,
} from "@/lib/collections/collection.service";
import { isDomainError } from "@/lib/errors/domain-error";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: Props) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: collectionId } = await params;
  const body = (await req.json()) as { closetItemIds?: string[] };
  if (!Array.isArray(body.closetItemIds) || body.closetItemIds.length === 0) {
    return NextResponse.json(
      { error: "closetItemIds (non-empty array) required" },
      { status: 400 },
    );
  }
  try {
    const result = await addItemsToCollection(
      user.id,
      collectionId,
      body.closetItemIds,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (isDomainError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function DELETE(req: Request, { params }: Props) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: collectionId } = await params;
  const url = new URL(req.url);
  const closetItemId = url.searchParams.get("closetItemId");
  if (!closetItemId) {
    return NextResponse.json(
      { error: "closetItemId query param required" },
      { status: 400 },
    );
  }
  try {
    await removeItemFromCollection(user.id, collectionId, closetItemId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isDomainError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
