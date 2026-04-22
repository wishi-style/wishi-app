import { notFound, unauthorized } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getCollection } from "@/lib/collections/collection.service";
import { isDomainError } from "@/lib/errors/domain-error";
import { CollectionDetailClient } from "./client";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CollectionDetailPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) unauthorized();

  const { id } = await params;
  let collection;
  try {
    collection = await getCollection(user.id, id);
  } catch (err) {
    if (isDomainError(err) && err.status === 404) notFound();
    throw err;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <Link
        href="/closet"
        className="mb-6 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800"
      >
        <ChevronLeft className="h-4 w-4" /> Back to closet
      </Link>
      <CollectionDetailClient collection={collection} />
    </div>
  );
}
