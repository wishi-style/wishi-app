"use client";

import Image from "next/image";
import Link from "next/link";
import { ClockIcon, HeartIcon } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface StylistCardProps {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
  styleSpecialties: string[];
  matchScore: number | null;
  isAvailable: boolean;
  /**
   * Optional hero/portfolio image. Falls back to the avatar when the stylist
   * hasn't uploaded a portfolio cover yet.
   */
  portfolioUrl?: string | null;
  /**
   * Optional location string (e.g. "New York"). When absent, the first
   * styleSpecialty is rendered in the same slot so the card structure
   * matches Loveable's `font-body text-xs uppercase tracking-widest` line.
   */
  location?: string | null;
  /** When provided, the card renders Loveable's heart-toggle button. */
  favorited?: boolean;
  onToggleFavorite?: () => void;
}

export function StylistCard({
  id,
  name,
  avatarUrl,
  styleSpecialties,
  matchScore,
  isAvailable,
  portfolioUrl,
  location,
  favorited,
  onToggleFavorite,
}: StylistCardProps) {
  const heroImage = portfolioUrl ?? avatarUrl;
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("");
  const firstName = name.split(" ")[0] || name;
  const subtitle = location ?? styleSpecialties[0] ?? "";

  return (
    <Link href={`/stylists/${id}`} className="group block">
      {/* Portfolio image — Loveable Stylists.tsx:69-96 */}
      <div className="relative aspect-square overflow-hidden mb-0">
        {heroImage ? (
          <Image
            src={heroImage}
            alt={`${name}'s portfolio`}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-display text-5xl text-muted-foreground">
            {initials || name.charAt(0)}
          </div>
        )}
        {onToggleFavorite ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite();
            }}
            aria-label={favorited ? `Unfavorite ${name}` : `Favorite ${name}`}
            className="absolute top-3 right-3 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center hover:bg-background transition-colors"
          >
            <HeartIcon
              className={cn(
                "h-4 w-4 transition-colors",
                favorited
                  ? "fill-foreground text-foreground"
                  : "text-foreground",
              )}
            />
          </button>
        ) : null}
      </div>

      {/* Info — Loveable Stylists.tsx:99-122. No outer borders / rounded
          corners; bg-card sits flush below the portrait. */}
      <div className="flex flex-col items-center text-center bg-card px-4 py-5">
        <Avatar className="h-12 w-12 mb-2 border-2 border-background shadow-sm -mt-10">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
          <AvatarFallback className="font-body text-xs bg-secondary text-secondary-foreground">
            {initials || name.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <h3 className="font-display text-lg">{name}</h3>
        {subtitle ? (
          <p className="font-body text-xs uppercase tracking-widest text-dark-taupe mt-0.5">
            {subtitle}
          </p>
        ) : null}
        {matchScore !== null && matchScore !== undefined ? (
          <p className="font-display text-base mt-1 italic">{matchScore}% Match</p>
        ) : null}
        {!isAvailable ? (
          <div className="flex items-center gap-1.5 mt-1.5 text-muted-foreground">
            <ClockIcon className="h-3.5 w-3.5" />
            <span className="font-body text-xs">Waitlist only</span>
          </div>
        ) : null}
        <span className="mt-3 w-full max-w-[220px] rounded-full bg-foreground text-background py-2.5 text-sm font-body font-medium group-hover:bg-foreground/90 transition-colors text-center block">
          {isAvailable ? `Meet ${firstName}` : "Join waitlist"}
        </span>
      </div>
    </Link>
  );
}
