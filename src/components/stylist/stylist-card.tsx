import Image from "next/image";
import Link from "next/link";
import { ClockIcon } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";

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
   * hasn't uploaded a portfolio cover yet — real portfolio wiring lands in a
   * follow-on sweep once `StylistProfile.featuredBoards` is materialized into
   * a cover image.
   */
  portfolioUrl?: string | null;
}

export function StylistCard({
  id,
  name,
  avatarUrl,
  styleSpecialties,
  matchScore,
  isAvailable,
  portfolioUrl,
}: StylistCardProps) {
  const heroImage = portfolioUrl ?? avatarUrl;
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("");
  const firstName = name.split(" ")[0] || name;

  return (
    <Link href={`/stylists/${id}`} className="group block">
      <div className="relative aspect-square overflow-hidden bg-muted">
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
      </div>

      <div className="flex flex-col items-center text-center bg-card px-4 py-5 border-x border-b border-border rounded-b-xl">
        <Avatar className="h-12 w-12 -mt-10 mb-2 border-2 border-background shadow-sm">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
          <AvatarFallback className="text-xs bg-secondary text-secondary-foreground">
            {initials || name.charAt(0)}
          </AvatarFallback>
        </Avatar>
        <h3 className="font-display text-lg">{name}</h3>
        {styleSpecialties.length > 0 ? (
          <p className="text-xs uppercase tracking-widest text-dark-taupe mt-0.5">
            {styleSpecialties.slice(0, 2).join(" · ")}
          </p>
        ) : null}
        {matchScore !== null && matchScore !== undefined ? (
          <p className="font-display text-base mt-1 italic">{matchScore}% Match</p>
        ) : null}
        {!isAvailable ? (
          <div className="flex items-center gap-1.5 mt-1.5 text-muted-foreground">
            <ClockIcon className="h-3.5 w-3.5" />
            <span className="text-xs">Waitlist only</span>
          </div>
        ) : null}
        <span className="mt-3 w-full max-w-[220px] rounded-full bg-foreground text-background py-2.5 text-sm font-medium group-hover:bg-foreground/90 transition-colors text-center block">
          {isAvailable ? `Meet ${firstName}` : "Join waitlist"}
        </span>
      </div>
    </Link>
  );
}
