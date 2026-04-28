import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { SiteHeader } from "@/components/primitives/site-header";
import { WelcomeClient } from "./welcome-client";

export const metadata: Metadata = {
  title: "Find your stylist — Wishi",
  description:
    "Tell us what you're after and your style preferences — we'll match you with a stylist who gets it.",
};

export default async function WelcomePage() {
  const { userId } = await auth();
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <WelcomeClient signedIn={userId !== null && userId !== undefined} />
    </div>
  );
}
