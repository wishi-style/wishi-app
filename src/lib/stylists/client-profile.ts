// Stylist-side view of a client's profile.
//
// Shape mirrors the Loveable stylist export (`wishi-reimagined/src/data/clientProfiles.ts::ClientProfile`)
// so the ported Dashboard + ClientDetailPanel components drop in without prop reshaping.
// The real aggregation from `StyleProfile` + `BodyProfile` + `BodySize` + `ColorPreference` +
// `FabricPreference` + `PatternPreference` + `SpecificPreference` + `BudgetByCategory` +
// `StylistPrivateNote` (TBD) lands in Batch 1 once Dashboard consumers are wired.

export type ViewLoyaltyTier = "new" | "bronze" | "silver" | "gold" | "vip";

export interface ClientProfileView {
  fullName: string;
  initials: string;
  gender: string;
  location: string;
  loyaltyTier: ViewLoyaltyTier;
  totalSessions: number;
  profilePhotoUrl?: string;
  stylingGoal: string;
  bodyIssues: string[];
  bodyIssueNotes: string;
  bodyType: string;
  highlightAreas: string[];
  style: string[];
  styleIcons: string[];
  comfortZone: string;
  typicallyWears: string;
  sizes: Record<string, string>;
  budgets: Record<string, string>;
  fitPreferences: { top: string; bottom: string };
  occupation: string;
  dressCode: string;
  colorsLike: string[];
  colorsDislike: string[];
  fabricsDislike: string[];
  patternsDislike: string[];
  denimFit: string[];
  dressStyles: string[];
  heelPreference: string;
  jewelryType: string[];
  socialLinks: { instagram?: string; pinterest?: string; facebook?: string };
  favoriteLooks: string[];
  previousBoards: { name: string; type: "style" | "mood" }[];
  photos: string[];
  notes: string;
}

export function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
