import { redirect } from "next/navigation";

export default async function StylistSessionIndex({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/stylist/sessions/${id}/workspace`);
}
