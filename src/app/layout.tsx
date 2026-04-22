import type { Metadata } from "next";
import { DM_Sans, Bodoni_Moda } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ImpersonationBannerMount } from "@/components/admin/impersonation-banner-mount";
import { StagingBanner } from "@/components/nav/staging-banner";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// GFS Didot isn't on Google Fonts — Bodoni Moda is the locked fallback
// (same editorial luxury serif silhouette).
const displaySerif = Bodoni_Moda({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Wishi — Your Personal Stylist",
  description:
    "The styling marketplace that connects you with expert stylists for personalized fashion advice.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${displaySerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground">
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
        >
          <ImpersonationBannerMount />
          <StagingBanner />
          {children}
          <Toaster />
        </ClerkProvider>
      </body>
    </html>
  );
}
