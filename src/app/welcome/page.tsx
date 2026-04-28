import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/auth/server-auth";

// Every primary marketing CTA ("Let's Get Styling" on /, /pricing, /lux,
// /how-it-works) hardcodes href="/welcome" because the broader Wave-A
// /welcome page (Loveable's 4-step funnel) is still in PR #41 and not
// landed on main. Without this index page, those CTAs took authenticated
// users to a 404 that bounced through the root error.tsx ("Try again").
//
// Until the full /welcome funnel ships, this stub honors the existing
// route convention used by the rest of the app: signed-in users skip the
// funnel and go straight to the stylist directory; new visitors enter via
// the match quiz, which is the funnel entry point per CLAUDE.md.
export default async function Welcome(): Promise<never> {
  const { userId } = await getServerAuth().catch(() => ({
    userId: null as string | null,
  }));
  redirect(userId ? "/stylists" : "/match-quiz");
}
