import { listInspirationPhotos } from "@/lib/boards/inspiration.service";
import { InspirationLibraryClient } from "./client";

export const dynamic = "force-dynamic";

export default async function InspirationPhotosPage() {
  const photos = await listInspirationPhotos({ take: 120 });
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-semibold">Inspiration Library</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Photos available to stylists for moodboards and styleboard items.
      </p>
      <InspirationLibraryClient initialPhotos={photos} />
    </div>
  );
}
