import type { Metadata } from "next";
import { getServerAuth } from "@/lib/auth/server-auth";
import { SiteHeader } from "@/components/primitives/site-header";
import { MatchQuizClient } from "./match-quiz-client";

export const metadata: Metadata = {
  title: "Find your stylist — Wishi",
  description:
    "Tell us what you're after and your style preferences — we'll match you with a stylist who gets it.",
};

export default async function MatchQuizPage() {
  // getServerAuth() rather than Clerk's auth() so the E2E_AUTH_MODE cookie
  // backdoor resolves the same way it does on /stylist-match. Without this,
  // signedIn={false} reaches the client and the final-vote handler opens the
  // Clerk sign-up modal instead of pushing to /stylist-match.
  const { userId } = await getServerAuth();
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <MatchQuizClient signedIn={userId !== null && userId !== undefined} />
    </div>
  );
}
