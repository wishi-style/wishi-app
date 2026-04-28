import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { SiteHeader } from "@/components/primitives/site-header";
import { MatchQuizClient } from "./match-quiz-client";

export const metadata: Metadata = {
  title: "Find your stylist — Wishi",
  description:
    "Tell us what you're after and your style preferences — we'll match you with a stylist who gets it.",
};

export default async function MatchQuizPage() {
  const { userId } = await auth();
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <MatchQuizClient signedIn={userId !== null && userId !== undefined} />
    </div>
  );
}
