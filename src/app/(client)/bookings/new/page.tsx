import { prisma } from "@/lib/prisma";
import { getActivePlans } from "@/lib/plans";
import { BookingClient } from "./booking-client";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ stylistId?: string }>;
}

export default async function NewBookingPage({ searchParams }: Props) {
  const params = await searchParams;
  const plans = await getActivePlans();

  let stylistName: string | null = null;
  if (params.stylistId) {
    const profile = await prisma.stylistProfile.findUnique({
      where: { id: params.stylistId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (profile) {
      stylistName = `${profile.user.firstName} ${profile.user.lastName}`;
    }
  }

  return (
    <main className="min-h-screen bg-[#FAF8F5]">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="mb-2 font-serif text-3xl font-light text-stone-900">
          Choose Your Plan
        </h1>
        {stylistName && (
          <p className="mb-8 text-sm text-stone-500">
            Booking with <span className="font-medium text-stone-700">{stylistName}</span>
          </p>
        )}

        <BookingClient
          plans={plans}
          stylistId={params.stylistId ?? null}
        />
      </div>
    </main>
  );
}
