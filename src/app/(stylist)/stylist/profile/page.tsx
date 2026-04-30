import Link from "next/link";
import { redirect } from "next/navigation";
import { Pencil } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { requireRole } from "@/lib/auth";
import { getCurrentAuthUser } from "@/lib/auth/server-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Stylist's "My Profile" — the surface clients see when they discover the
 * stylist on Wishi. View-mode port of `wishi-reimagined/src/pages/Stylist
 * Profile.tsx@19f4732` (lines 360-436).
 *
 * Edit mode is a bigger lift (image validation, draft autosave, inline
 * LookLibraryPicker, mood-board cover upload) and lives on its own commit
 * — the "Edit profile" CTA here drops the user into the onboarding wizard
 * which already covers the same fields end-to-end.
 *
 * Per-gender board attribution: Loveable splits Women / Men style boards
 * into separate tabs. The staging `Board` schema has `profileStyle` but
 * no gender column; profile boards are surfaced into BOTH tabs of the
 * styles the stylist serves until the schema grows a gender field.
 */

interface ProfileTextBlockProps {
  label: string;
  value: string | null | undefined;
}
function ProfileTextBlock({ label, value }: ProfileTextBlockProps) {
  return (
    <Card className="p-5 bg-muted/30 border-border">
      <p className="font-body text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
        {label}
      </p>
      <p className="font-body text-sm whitespace-pre-line leading-relaxed">
        {value || (
          <span className="italic text-muted-foreground">Not set yet.</span>
        )}
      </p>
    </Card>
  );
}

type StyleBoardEntry = { style: string; imageUrl: string | null };
function StyleBoardGrid({ boards }: { boards: StyleBoardEntry[] }) {
  if (boards.length === 0) {
    return (
      <p className="text-sm text-muted-foreground font-body py-8 text-center">
        No style boards added yet.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {boards.map((b) => (
        <div key={b.style} className="space-y-2">
          <div className="aspect-square overflow-hidden rounded-md border border-border bg-muted">
            {b.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={b.imageUrl}
                alt={b.style}
                className="h-full w-full object-cover"
              />
            ) : null}
          </div>
          <p className="font-body text-sm">{b.style}</p>
        </div>
      ))}
    </div>
  );
}

function fullNameFor(firstName: string | null, lastName: string | null): string {
  return [firstName, lastName].filter(Boolean).join(" ") || "Stylist";
}

function initialsFor(firstName: string | null, lastName: string | null): string {
  const f = firstName?.trim()[0] ?? "";
  const l = lastName?.trim()[0] ?? "";
  return `${f}${l}`.toUpperCase() || "?";
}

function instagramUrl(handle: string | null | undefined): string | null {
  if (!handle) return null;
  const cleaned = handle.replace(/^@/, "").trim();
  if (!cleaned) return null;
  return `https://instagram.com/${cleaned}`;
}

export default async function StylistProfilePage() {
  await requireRole("STYLIST");
  const authUser = await getCurrentAuthUser();
  if (!authUser) return null;

  const user = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: {
      firstName: true,
      lastName: true,
      avatarUrl: true,
      locations: { select: { city: true, country: true }, take: 1 },
      stylistProfile: {
        select: {
          id: true,
          bio: true,
          philosophy: true,
          directorPick: true,
          instagramHandle: true,
          styleSpecialties: true,
          genderPreference: true,
          profileMoodboardId: true,
          onboardingStatus: true,
        },
      },
    },
  });

  if (!user || !user.stylistProfile) {
    // Stylist hasn't completed step 1 of the onboarding wizard. Send them
    // there to set up basics before showing the public profile.
    redirect("/onboarding/step-1");
  }

  const profile = user.stylistProfile;
  const fullName = fullNameFor(user.firstName, user.lastName);
  const location = user.locations[0]
    ? [user.locations[0].city, user.locations[0].country].filter(Boolean).join(", ")
    : "";
  const igUrl = instagramUrl(profile.instagramHandle);

  // Mood-board cover: load the first BoardItem's image off the linked
  // moodboard. We can only resolve `webItemImageUrl` directly here —
  // `INVENTORY` and `INSPIRATION_PHOTO` items need a join through the
  // tastegraph inventory client / `InspirationPhoto` table; deferring
  // that hydration to the same commit that ports the inline mood-board
  // cover upload (Loveable handles it client-side).
  const moodBoardCover = profile.profileMoodboardId
    ? await prisma.boardItem
        .findFirst({
          where: { boardId: profile.profileMoodboardId, webItemImageUrl: { not: null } },
          orderBy: { orderIndex: "asc" },
          select: { webItemImageUrl: true },
        })
        .then((b) => b?.webItemImageUrl ?? null)
    : null;

  // Featured profile boards — Loveable surfaces these as the per-style
  // grid. Cover image = first BoardItem with a hydrated image.
  const profileBoardsRaw = await prisma.board.findMany({
    where: {
      stylistProfileId: profile.id,
      isFeaturedOnProfile: true,
      type: "STYLEBOARD",
      profileStyle: { not: null },
    },
    select: {
      profileStyle: true,
      items: {
        orderBy: { orderIndex: "asc" },
        take: 1,
        select: { webItemImageUrl: true },
      },
    },
  });
  const profileBoards: StyleBoardEntry[] = profileBoardsRaw
    .filter((b) => b.profileStyle)
    .map((b) => ({
      style: b.profileStyle as string,
      imageUrl: b.items[0]?.webItemImageUrl ?? null,
    }));

  const showWomen = profile.genderPreference.includes("FEMALE");
  const showMen = profile.genderPreference.includes("MALE");
  const showBothTabs = showWomen && showMen;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8 sm:py-12">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight">
            My Profile
          </h1>
          <p className="text-sm text-muted-foreground mt-1 font-body">
            How clients see you on Wishi
          </p>
        </div>
        <Link
          href="/onboarding/step-1"
          className="inline-flex items-center gap-2 h-9 rounded-md border border-border px-3 font-body text-sm hover:bg-muted transition-colors"
        >
          <Pencil className="h-4 w-4" /> Edit profile
        </Link>
      </div>

      {/* Hero: mood board + identity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="aspect-square w-full overflow-hidden rounded-md border border-border bg-muted">
          {moodBoardCover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={moodBoardCover}
              alt={`${fullName} mood board`}
              className="h-full w-full object-cover"
            />
          ) : null}
        </div>
        <div className="flex flex-col justify-center">
          <Avatar className="h-24 w-24 mb-4">
            {user.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={fullName} /> : null}
            <AvatarFallback className="font-display text-xl">
              {initialsFor(user.firstName, user.lastName)}
            </AvatarFallback>
          </Avatar>
          <h2 className="font-display text-2xl sm:text-3xl">{fullName}</h2>
          {location ? (
            <p className="text-sm text-muted-foreground font-body mt-1">{location}</p>
          ) : null}
          {igUrl ? (
            <a
              href={igUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-body mt-3 text-accent hover:underline"
            >
              {/* Lucide v1 dropped brand glyphs; inline SVG per CLAUDE.md. */}
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
              </svg>
              Instagram
            </a>
          ) : null}
        </div>
      </div>

      {/* Text sections */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <ProfileTextBlock label="Philosophy" value={profile.philosophy} />
        <ProfileTextBlock label="Style Director's Pick" value={profile.directorPick} />
        <ProfileTextBlock label="Bio" value={profile.bio} />
      </div>

      {/* Style boards */}
      <section>
        <h3 className="font-display text-xl mb-4">Style boards</h3>
        {showBothTabs ? (
          <Tabs defaultValue="women">
            <TabsList>
              <TabsTrigger value="women">Women ({profileBoards.length})</TabsTrigger>
              <TabsTrigger value="men">Men ({profileBoards.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="women" className="mt-6">
              <StyleBoardGrid boards={profileBoards} />
            </TabsContent>
            <TabsContent value="men" className="mt-6">
              <StyleBoardGrid boards={profileBoards} />
            </TabsContent>
          </Tabs>
        ) : (
          <StyleBoardGrid boards={profileBoards} />
        )}
      </section>
    </div>
  );
}
