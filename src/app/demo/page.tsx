import { notFound } from "next/navigation";
import { isE2EAuthModeEnabled } from "@/lib/auth/e2e-auth";
import { signInAsDemo, signOutDemo } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Wishi — Demo",
  robots: { index: false, follow: false },
};

// The /demo page only exists when E2E_AUTH_MODE=true, which is hard-coded off
// on production by isE2EAuthModeEnabled(). In production the route returns a
// 404 so neither the page nor the server actions are reachable.
export default async function DemoPage() {
  if (!isE2EAuthModeEnabled()) {
    notFound();
  }

  const roles: Array<{
    which: "client" | "stylist-maya" | "stylist-alex" | "stylist-jordan";
    name: string;
    subtitle: string;
  }> = [
    {
      which: "client",
      name: "Sasha — Client",
      subtitle: "Fully onboarded. Female, minimalist, moderate budget.",
    },
    {
      which: "stylist-maya",
      name: "Maya — Stylist",
      subtitle: "Minimalist + classic, female clients, moderate/premium budget.",
    },
    {
      which: "stylist-alex",
      name: "Alex — Stylist",
      subtitle: "All genders, minimalist + bohemian, moderate/premium.",
    },
    {
      which: "stylist-jordan",
      name: "Jordan — Stylist",
      subtitle: "Menswear/non-binary, streetwear + eclectic, premium.",
    },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-8 p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Wishi Demo</h1>
        <p className="text-sm text-muted-foreground">
          Pick a demo account to jump into the app. No password needed. Data
          resets nightly. Stripe test card:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            4242 4242 4242 4242
          </code>
          , any future expiry, any CVC.
        </p>
      </header>

      <ul className="flex flex-col gap-3">
        {roles.map((r) => (
          <li key={r.which}>
            <form action={signInAsDemo}>
              <input type="hidden" name="which" value={r.which} />
              <button
                type="submit"
                className="flex w-full flex-col items-start gap-1 rounded-lg border border-border bg-card p-4 text-left transition hover:border-primary hover:bg-accent"
              >
                <span className="font-medium">{r.name}</span>
                <span className="text-xs text-muted-foreground">{r.subtitle}</span>
              </button>
            </form>
          </li>
        ))}
      </ul>

      <form action={signOutDemo} className="self-start">
        <button
          type="submit"
          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Clear demo session
        </button>
      </form>
    </main>
  );
}
