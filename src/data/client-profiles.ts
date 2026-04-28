import { Crown, Star, Sparkles } from "lucide-react";

/* ─── Types ─── */
export type LoyaltyTier = "new" | "bronze" | "silver" | "gold" | "vip";

export interface ClientProfile {
  fullName: string;
  initials: string;
  gender: string;
  location: string;
  loyaltyTier: LoyaltyTier;
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

export const loyaltyConfig: Record<LoyaltyTier, { label: string; icon: React.ElementType; className: string }> = {
  new: { label: "New Client", icon: Sparkles, className: "text-foreground bg-muted" },
  bronze: { label: "Bronze", icon: Star, className: "text-amber-800 bg-amber-100" },
  silver: { label: "Silver", icon: Star, className: "text-slate-500 bg-slate-100" },
  gold: { label: "Gold", icon: Crown, className: "text-amber-600 bg-amber-50" },
  vip: { label: "VIP", icon: Crown, className: "text-accent bg-accent/10" },
};

export const mockClientProfiles: Record<string, ClientProfile> = {
  s1: {
    fullName: "Feizhen Dang",
    initials: "FD",
    gender: "Female",
    location: "New York, NY",
    loyaltyTier: "gold",
    totalSessions: 8,
    stylingGoal: "A workwear wardrobe",
    bodyIssues: ["Stomach", "Something else"],
    bodyIssueNotes: "Post partum and I have a large stomach I'd like to hide",
    bodyType: "Pear",
    highlightAreas: ["Shoulders", "Waist"],
    style: ["Classic", "Minimalist", "Polished"],
    styleIcons: ["Meghan Markle", "Amal Clooney"],
    comfortZone: "A little outside",
    typicallyWears: "Mostly jeans and pants",
    sizes: { Tops: "M", Bottoms: "8", Dresses: "8", Shoes: "7.5", Outerwear: "M" },
    budgets: { Tops: "$50–$100", Bottoms: "$60–$120", Dresses: "$100–$200", Shoes: "$80–$150", Accessories: "$30–$80" },
    fitPreferences: { top: "Relaxed", bottom: "Straight" },
    occupation: "Marketing Manager",
    dressCode: "Denim Friendly",
    colorsLike: ["Navy", "Black", "White", "Camel", "Olive"],
    colorsDislike: ["Neon", "Hot Pink", "Orange"],
    fabricsDislike: ["Polyester", "Sequins"],
    patternsDislike: ["Large florals", "Animal print"],
    denimFit: ["Straight", "Wide Leg"],
    dressStyles: ["Midi", "Wrap"],
    heelPreference: "Never",
    jewelryType: ["Gold"],
    socialLinks: { instagram: "@feizhen.style", pinterest: "feizhen_d", facebook: "" },
    favoriteLooks: ["Work Chic Board #2 — Look 3", "Weekend Casual — Look 1"],
    previousBoards: [
      { name: "Work Chic Moodboard", type: "mood" },
      { name: "Work Chic Style Board #1", type: "style" },
      { name: "Work Chic Style Board #2", type: "style" },
    ],
    photos: [],
    notes: "Prefers shopping from Nordstrom and Revolve. Has a capsule wardrobe mindset. Doesn't like oversized fits on top.",
  },
  s2: {
    fullName: "Crystal Stokey",
    initials: "CS",
    gender: "Female",
    location: "Los Angeles, CA",
    loyaltyTier: "silver",
    totalSessions: 4,
    stylingGoal: "Date night and weekend outfits",
    bodyIssues: ["Arms"],
    bodyIssueNotes: "Prefers sleeves or structured shoulders",
    bodyType: "Hourglass",
    highlightAreas: ["Waist", "Legs"],
    style: ["Bohemian", "Romantic"],
    styleIcons: ["Sienna Miller", "Vanessa Hudgens"],
    comfortZone: "Stay close",
    typicallyWears: "Dresses and skirts",
    sizes: { Tops: "S", Bottoms: "4", Dresses: "4", Shoes: "8", Outerwear: "S" },
    budgets: { Tops: "$40–$80", Bottoms: "$50–$100", Dresses: "$80–$160", Shoes: "$60–$120", Accessories: "$20–$60" },
    fitPreferences: { top: "Fitted", bottom: "Slim" },
    occupation: "Freelance Photographer",
    dressCode: "Casual Creative",
    colorsLike: ["Burnt Orange", "Olive", "Warm Brown", "Rust"],
    colorsDislike: ["Cool Gray", "Bright Blue"],
    fabricsDislike: ["Leather"],
    patternsDislike: ["Stripes"],
    denimFit: ["Skinny", "Flare"],
    dressStyles: ["Maxi", "Mini"],
    heelPreference: "Sometimes — low block heels",
    jewelryType: ["Gold", "Mixed metals"],
    socialLinks: { instagram: "@crystal.stokey", pinterest: "cstokey" },
    favoriteLooks: ["Boho Date Night — Look 2"],
    previousBoards: [
      { name: "Boho Date Night Moodboard", type: "mood" },
      { name: "Weekend Vibes Board", type: "style" },
    ],
    photos: [],
    notes: "Loves earthy tones. Very specific about arm coverage.",
  },
};
