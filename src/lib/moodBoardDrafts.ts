const STORAGE_KEY = "wishi_moodboard_drafts";

export interface MoodBoardDraft {
  id: string;
  clientName: string;
  sessionId: string | null;
  images: string[];
  updatedAt: string;
}

export function getDrafts(): MoodBoardDraft[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveDraft(draft: Omit<MoodBoardDraft, "id" | "updatedAt">, existingId?: string): MoodBoardDraft {
  const drafts = getDrafts();
  const now = new Date().toISOString();

  if (existingId) {
    const idx = drafts.findIndex((d) => d.id === existingId);
    if (idx !== -1) {
      drafts[idx] = { ...drafts[idx], ...draft, updatedAt: now };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
      return drafts[idx];
    }
  }

  const newDraft: MoodBoardDraft = {
    id: `draft-${Date.now()}`,
    ...draft,
    updatedAt: now,
  };
  drafts.unshift(newDraft);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  return newDraft;
}

export function deleteDraft(id: string): void {
  const drafts = getDrafts().filter((d) => d.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
}
