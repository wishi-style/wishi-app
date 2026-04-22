import Image from "next/image";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { PillButton } from "@/components/primitives/pill-button";

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
  bio,
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

  return (
    <article className="group flex flex-col">
      <div className="relative aspect-square overflow-hidden rounded-xl mb-4 bg-muted">
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

        {matchScore !== null && matchScore !== undefined ? (
          <div className="absolute right-3 top-3 rounded-full bg-foreground/80 px-3 py-1 text-xs font-medium text-background backdrop-blur-sm">
            {matchScore}% Match
          </div>
        ) : null}

        {!isAvailable && (
          <div className="absolute bottom-3 left-3 rounded-full bg-foreground/80 px-3 py-1 text-xs text-background backdrop-blur-sm">
            Waitlist
          </div>
        )}
      </div>

      <div className="flex flex-col items-center text-center">
        <Avatar className="h-12 w-12 mb-2 border-2 border-background shadow-sm">
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
        {bio ? (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2 max-w-[30ch]">
            {bio}
          </p>
        ) : null}
        <PillButton
          href={`/stylists/${id}`}
          variant="outline"
          size="sm"
          className="mt-3 w-full max-w-[220px]"
        >
          View Profile
        </PillButton>
      </div>
    </article>
  );
}
