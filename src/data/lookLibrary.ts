export interface LookLibraryItem {
  id: string;
  name: string;
  imageUrl: string;
  tags: string[];
  createdAt: string;
}

// Loveable seeded `LookLibraryPicker` from a mock array pointing at JPGs
// under /loveable-assets/inspo-N.jpg. Per the "no fake data from
// Loveable" rule those paths don't exist in this repo's `public/`,
// and broken `<img>` requests cascade into 5xx via the root-layout
// `auth()` call. Real data should be sourced from `Board(stylistProfileId,
// isFeaturedOnProfile=true)` once the picker is wired through; until
// then the picker shows its own empty state.
export const lookLibrary: LookLibraryItem[] = [];
