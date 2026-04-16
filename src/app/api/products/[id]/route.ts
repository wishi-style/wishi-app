import { NextResponse } from "next/server";
import { getServerAuth } from "@/lib/auth/server-auth";
import { getProduct } from "@/lib/inventory/inventory-client";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await getServerAuth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }
  return NextResponse.json(product);
}
