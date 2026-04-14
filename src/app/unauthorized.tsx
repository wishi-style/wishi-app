import Link from "next/link";

export default function Unauthorized() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">
        Sign in required
      </h1>
      <p className="text-muted-foreground">
        Please sign in to access this page.
      </p>
      <Link
        href="/sign-in"
        className="mt-2 rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Sign in
      </Link>
    </main>
  );
}
