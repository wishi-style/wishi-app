import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  createCollection,
  listCollections,
} from "@/lib/collections/collection.service";
import { isDomainError } from "@/lib/errors/domain-error";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const collections = await listCollections(user.id);
  return NextResponse.json({ collections });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json()) as {
    name?: string;
    closetItemIds?: string[];
  };
  if (typeof body.name !== "string") {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  try {
    const collection = await createCollection(
      user.id,
      body.name,
      Array.isArray(body.closetItemIds) ? body.closetItemIds : [],
    );
    return NextResponse.json(collection, { status: 201 });
  } catch (err) {
    if (isDomainError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
