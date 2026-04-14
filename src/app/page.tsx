import Link from "next/link";
import { PublicNav } from "@/components/nav/public-nav";

export default function Home() {
  return (
    <>
      <PublicNav />
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Your personal stylist,
            <br />
            one click away
          </h1>
          <p className="mt-6 text-lg text-muted-foreground">
            Connect with expert stylists who curate personalized looks tailored
            to your style, body, and budget.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/sign-up"
              className="rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Get started
            </Link>
            <Link
              href="/pricing"
              className="rounded-full border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-accent"
            >
              View pricing
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
