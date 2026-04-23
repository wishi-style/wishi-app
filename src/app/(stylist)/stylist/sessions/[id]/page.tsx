import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function StylistSessionIndex({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/stylist/sessions/${id}/workspace`);
}
