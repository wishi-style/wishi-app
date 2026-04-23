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

const siteUrl = process.env.APP_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Wishi — Personalized Luxury Styling",
    template: "%s · Wishi",
  },
  description:
    "Wishi connects you with expert stylists who curate personalized, shoppable looks — from your own closet and the best brands in the world.",
  applicationName: "Wishi",
  authors: [{ name: "Wishi" }],
  keywords: [
    "personal stylist",
    "online styling",
    "fashion advice",
    "styling service",
    "personal shopping",
    "wardrobe",
    "lookbook",
  ],
  openGraph: {
    type: "website",
    siteName: "Wishi",
    locale: "en_US",
    url: siteUrl,
    title: "Wishi — Personalized Luxury Styling",
    description:
      "Wishi connects you with expert stylists who curate personalized, shoppable looks — from your own closet and the best brands in the world.",
    images: [
      {
        url: "/img/og-default.jpg",
        width: 1200,
        height: 630,
        alt: "Wishi",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Wishi — Personalized Luxury Styling",
    description:
      "Wishi connects you with expert stylists who curate personalized, shoppable looks.",
    images: ["/img/og-default.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/favicon.ico",
  },
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
