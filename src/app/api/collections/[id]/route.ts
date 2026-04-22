import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  deleteCollection,
  getCollection,
  updateCollection,
} from "@/lib/collections/collection.service";
import { isDomainError } from "@/lib/errors/domain-error";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Props) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const collection = await getCollection(user.id, id);
    return NextResponse.json(collection);
  } catch (err) {
    if (isDomainError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function PATCH(req: Request, { params }: Props) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json()) as {
    name?: string;
    coverImageUrl?: string | null;
  };
  try {
    const collection = await updateCollection(user.id, id, {
      name: body.name,
      coverImageUrl: body.coverImageUrl,
    });
    return NextResponse.json(collection);
  } catch (err) {
    if (isDomainError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function DELETE(_req: Request, { params }: Props) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    await deleteCollection(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (isDomainError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
