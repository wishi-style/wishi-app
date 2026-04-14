import { nanoid } from "nanoid";

/**
 * Generate a unique, URL-safe referral code for a new user.
 * 8 characters gives ~2.8 trillion combinations — collision-safe at Wishi's scale.
 */
export function generateReferralCode(): string {
  return nanoid(8);
}
