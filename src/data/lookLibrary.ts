export interface LookLibraryItem {
  id: string;
  name: string;
  imageUrl: string;
  tags: string[];
  createdAt: string;
}

export const lookLibrary: LookLibraryItem[] = [
  { id: "look-1", name: "Soft tailoring", imageUrl: "/loveable-assets/inspo-1.jpg", tags: ["Classic", "Minimal"], createdAt: "2026-04-12" },
  { id: "look-2", name: "Linen weekend", imageUrl: "/loveable-assets/inspo-2.jpg", tags: ["Minimal", "Bohemian"], createdAt: "2026-04-10" },
  { id: "look-3", name: "Evening drape", imageUrl: "/loveable-assets/inspo-3.jpg", tags: ["Glam", "Romantic"], createdAt: "2026-04-08" },
  { id: "look-4", name: "City uniform", imageUrl: "/loveable-assets/inspo-4.jpg", tags: ["Streetwear", "Minimal"], createdAt: "2026-04-05" },
  { id: "look-5", name: "Garden party", imageUrl: "/loveable-assets/inspo-5.jpg", tags: ["Romantic", "Preppy"], createdAt: "2026-04-02" },
  { id: "look-6", name: "Studio neutrals", imageUrl: "/loveable-assets/inspo-6.jpg", tags: ["Minimal", "Classic"], createdAt: "2026-03-28" },
  { id: "look-7", name: "Off-duty edge", imageUrl: "/loveable-assets/inspo-7.jpg", tags: ["Edgy", "Streetwear"], createdAt: "2026-03-22" },
  { id: "look-8", name: "Tailored statement", imageUrl: "/loveable-assets/inspo-8.jpg", tags: ["Tailored", "Smart Casual"], createdAt: "2026-03-18" },
];
