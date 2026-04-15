import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function BookingSuccessPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#FAF8F5]">
      <div className="mx-auto max-w-md px-4 text-center">
        <div className="mb-6 text-5xl">✨</div>
        <h1 className="mb-3 font-serif text-3xl font-light text-stone-900">
          You&apos;re Booked!
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-stone-500">
          We&apos;re matching you with the perfect stylist. Complete your
          style preferences quiz so your stylist can get to know you.
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/sessions"
            className="rounded-full bg-black px-8 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Go to My Sessions
          </Link>
        </div>
      </div>
    </main>
  );
}
