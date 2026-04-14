import Link from "next/link";

interface StylistCardProps {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
  styleSpecialties: string[];
  matchScore: number | null;
  isAvailable: boolean;
}

export function StylistCard({
  id,
  name,
  avatarUrl,
  bio,
  styleSpecialties,
  matchScore,
  isAvailable,
}: StylistCardProps) {
  return (
    <Link
      href={`/stylists/${id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white transition-shadow hover:shadow-md"
    >
      {/* Avatar */}
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-stone-100">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={name}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl text-stone-300">
            {name.charAt(0)}
          </div>
        )}

        {matchScore && (
          <div className="absolute right-3 top-3 rounded-full bg-black/80 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
            {matchScore}% Match
          </div>
        )}

        {!isAvailable && (
          <div className="absolute bottom-3 left-3 rounded-full bg-stone-800/80 px-3 py-1 text-xs text-white backdrop-blur-sm">
            Waitlist
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-serif text-lg font-medium text-stone-900">{name}</h3>
        {bio && (
          <p className="line-clamp-2 text-sm text-stone-500">{bio}</p>
        )}
        {styleSpecialties.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
            {styleSpecialties.slice(0, 3).map((s) => (
              <span
                key={s}
                className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600"
              >
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
