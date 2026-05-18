// Uploads background-removed canvas item images (PNG with alpha) to S3 at
// save time so render surfaces — chat card, feed, profile, share link —
// can serve the cutout via processedImageUrl instead of re-running the
// in-browser segmenter or losing the cutout entirely.
//
// One upload per item, sequenced rather than parallel to keep the toast
// signal clear if any single upload fails. Failures are non-fatal: the
// caller's payload keeps processedImageUrl = null and the original image
// continues to render across surfaces.

import { toast } from "sonner";

interface UploadableItem {
  uid: string;
  image: string;
  bgRemoved: boolean;
  processedImageUrl?: string;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  if (!res.ok) throw new Error(`fetch(dataUrl) failed: ${res.status}`);
  return res.blob();
}

async function uploadOne(
  boardId: string,
  uid: string,
  blob: Blob,
): Promise<string> {
  const params = new URLSearchParams({
    filename: `${uid}.png`,
    contentType: "image/png",
    purpose: "board-processed-image",
    boardId,
    itemUid: uid,
  });
  const presignedRes = await fetch(`/api/uploads/presigned?${params}`);
  if (!presignedRes.ok) {
    throw new Error(`Presigned request failed: ${presignedRes.status}`);
  }
  const { url, publicUrl } = (await presignedRes.json()) as {
    url: string;
    publicUrl: string;
  };
  const putRes = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "image/png" },
    body: blob,
  });
  if (!putRes.ok) {
    throw new Error(`S3 PUT failed: ${putRes.status}`);
  }
  return publicUrl;
}

export async function uploadProcessedImages<T extends UploadableItem>(
  boardId: string,
  items: T[],
): Promise<T[]> {
  const toUpload = items.filter((c) => c.bgRemoved && !c.processedImageUrl);
  if (toUpload.length === 0) return items;

  const results = new Map<string, string>();
  let failures = 0;
  for (const it of toUpload) {
    try {
      const blob = await dataUrlToBlob(it.image);
      const publicUrl = await uploadOne(boardId, it.uid, blob);
      results.set(it.uid, publicUrl);
    } catch (err) {
      failures += 1;
      console.warn("[styleboard] processed-image upload failed", {
        boardId,
        itemUid: it.uid,
        err,
      });
    }
  }
  if (failures > 0) {
    toast.warning(
      "Some background-removed cutouts couldn't be saved — sending the look with original images.",
    );
  }
  return items.map((c) =>
    results.has(c.uid)
      ? { ...c, processedImageUrl: results.get(c.uid)! }
      : c,
  );
}
