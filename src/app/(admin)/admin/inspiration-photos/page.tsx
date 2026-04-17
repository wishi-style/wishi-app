import { PageHeader } from "@/components/admin/page-header";
import { listInspirationPhotosIncludingDeleted } from "@/lib/boards/inspiration.service";
import { InspirationLibraryClient } from "./client";

export const dynamic = "force-dynamic";

export default async function InspirationPhotosPage() {
  const photos = await listInspirationPhotosIncludingDeleted({ take: 200 });
  return (
    <div>
      <PageHeader
        title="Inspiration library"
        description="Photos available to stylists for moodboards and styleboard items."
      />
      <InspirationLibraryClient initialPhotos={photos} />
    </div>
  );
}
