import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 font-display text-5xl">404</h1>
        <p className="mb-6 text-base text-muted-foreground">
          Oops! This page couldn&apos;t be found.
        </p>
        <Link
          href="/"
          className="text-sm text-foreground underline underline-offset-4 hover:text-foreground/70 transition-colors"
        >
          Return to home
        </Link>
      </div>
    </main>
  );
}
