// Canonical 10 style labels used across stylist onboarding, profile-board
// bucketing, and the feature-on-profile picker. Stored as plain strings on
// `StylistProfile.styleSpecialties` and `Board.profileStyle` — both columns
// also accept free-text overrides, so this list is the *suggested* set, not
// an enum.

export const CANONICAL_STYLES = [
  "Minimalist",
  "Classic",
  "Edgy",
  "Bohemian",
  "Preppy",
  "Streetwear",
  "Romantic",
  "Sporty",
  "Avant-garde",
  "Eclectic",
] as const;

export type CanonicalStyle = (typeof CANONICAL_STYLES)[number];

export function isCanonicalStyle(value: string): value is CanonicalStyle {
  return (CANONICAL_STYLES as readonly string[]).includes(value);
}
