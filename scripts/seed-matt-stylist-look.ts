/**
 * Local-only seed: spin up Matt's stylist account with one populated client
 * + an ACTIVE session so /stylist/sessions/[id]/styleboards/new is reachable
 * via the E2E sign-in backdoor.
 *
 * Run with:
 *   set -a && source .env && set +a && npx tsx scripts/seed-matt-stylist-look.ts
 */

import {
  ensureClientUser,
  ensureStylistUser,
  ensureStylistProfile,
  createSessionForClient,
  createMatchQuizResult,
  getPool,
  cleanupE2EUserByEmail,
} from "@/../tests/e2e/db";
import { randomUUID } from "node:crypto";

const STYLIST_EMAIL = "matthewcar+stylist@e2e.wishi.test";
const CLIENT_EMAIL = "matthewcar+client@e2e.wishi.test";

async function seedClientPreferences(userId: string): Promise<void> {
  const p = getPool();

  // StyleProfile — minimal but completed
  await p.query(
    `INSERT INTO style_profiles
       (id, user_id, style_preferences, style_icons, comfort_zone_level, dress_code, quiz_completed_at, quiz_answers, avoid_brands, preferred_brands, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 6, 'casual', NOW(), $5, $6, $7, NOW(), NOW())`,
    [
      randomUUID(),
      userId,
      ["minimalist", "modern"],
      ["Sofia Richie"],
      JSON.stringify({ "style_profile.style_preferences": ["minimalist", "modern"] }),
      [],
      ["Reformation", "Sezane"],
    ],
  );

  // BodyProfile + sizes (sizes live in body_sizes; FK = body_profile_id)
  const bodyId = randomUUID();
  await p.query(
    `INSERT INTO body_profiles (id, user_id, body_type, height, created_at, updated_at)
     VALUES ($1, $2, 'pear', '5''6"', NOW(), NOW())`,
    [bodyId, userId],
  );
  const sizeRows: [string, string][] = [
    ["tops", "M"],
    ["bottoms", "28"],
    ["dresses", "M"],
    ["shoes", "8"],
  ];
  for (const [category, size] of sizeRows) {
    await p.query(
      `INSERT INTO body_sizes (id, body_profile_id, category, size, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      [randomUUID(), bodyId, category, size],
    );
  }

  // BudgetByCategory — $ amounts in cents
  const budgets: [string, number, number][] = [
    ["TOPS", 20000, 40000],
    ["BOTTOMS", 15000, 35000],
    ["DRESSES", 25000, 60000],
    ["SHOES", 30000, 80000],
    ["OUTERWEAR", 40000, 90000],
    ["ACCESSORIES", 5000, 25000],
  ];
  for (const [category, min, max] of budgets) {
    await p.query(
      `INSERT INTO budget_by_category (id, user_id, category, min_in_cents, max_in_cents, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [randomUUID(), userId, category, min, max],
    );
  }

  // Color likes / dislikes — pink disliked, navy liked
  const colors: [string, boolean][] = [
    ["pink", false],
    ["neon green", false],
    ["navy", true],
    ["black", true],
    ["cream", true],
  ];
  for (const [color, isLiked] of colors) {
    await p.query(
      `INSERT INTO color_preferences (id, user_id, color, is_liked, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [randomUUID(), userId, color, isLiked],
    );
  }

  // Fabric dislikes (leather → triggers exclude-leather smart default)
  for (const fabric of ["leather"]) {
    await p.query(
      `INSERT INTO fabric_preferences (id, user_id, fabric, is_disliked, created_at)
       VALUES ($1, $2, $3, TRUE, NOW())`,
      [randomUUID(), userId, fabric],
    );
  }

  // Pattern dislikes
  for (const pattern of ["camo"]) {
    await p.query(
      `INSERT INTO pattern_preferences (id, user_id, pattern, is_disliked, created_at)
       VALUES ($1, $2, $3, TRUE, NOW())`,
      [randomUUID(), userId, pattern],
    );
  }
}

async function setStylistEligible(userId: string): Promise<void> {
  await getPool().query(
    `UPDATE stylist_profiles
       SET onboarding_status = 'ELIGIBLE', payouts_enabled = TRUE, updated_at = NOW()
     WHERE user_id = $1`,
    [userId],
  );
}

async function main() {
  console.log(`Cleaning previous seeds for ${STYLIST_EMAIL} / ${CLIENT_EMAIL}…`);
  await cleanupE2EUserByEmail(STYLIST_EMAIL);
  await cleanupE2EUserByEmail(CLIENT_EMAIL);

  const stylist = await ensureStylistUser({
    clerkId: `e2e_stylist_matt_${Date.now()}`,
    email: STYLIST_EMAIL,
    firstName: "Matt",
    lastName: "Stylist",
  });

  await ensureStylistProfile({
    userId: stylist.id,
    styleSpecialties: ["minimalist", "modern", "elegant"],
    genderPreference: ["FEMALE", "MALE"],
    budgetBrackets: ["moderate", "premium"],
  });
  await setStylistEligible(stylist.id);

  const client = await ensureClientUser({
    clerkId: `e2e_client_matt_${Date.now()}`,
    email: CLIENT_EMAIL,
    firstName: "Sarah",
    lastName: "Client",
  });

  // Tag the client's gender so the Shop's smart-default ladder fires
  await getPool().query(
    `UPDATE users SET gender = 'FEMALE' WHERE id = $1`,
    [client.id],
  );

  await createMatchQuizResult({
    userId: client.id,
    genderToStyle: "FEMALE",
    styleDirection: ["minimalist", "modern"],
    budgetBracket: "moderate",
  });
  await seedClientPreferences(client.id);

  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    planType: "MAJOR",
    status: "ACTIVE",
    amountPaidInCents: 13000,
  });

  console.log("\n=== seeded ===");
  console.log("stylist :", STYLIST_EMAIL, "->", stylist.id);
  console.log("client  :", CLIENT_EMAIL, "->", client.id);
  console.log("session :", session.id);
  console.log("\nNext:");
  console.log("  1. npm run dev:e2e");
  console.log("  2. open http://localhost:3001/sign-in?e2e=1");
  console.log(`  3. sign in with ${STYLIST_EMAIL}`);
  console.log(
    `  4. go to http://localhost:3001/stylist/sessions/${session.id}/styleboards/new`,
  );
}

main()
  .then(async () => {
    await getPool().end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    try {
      await getPool().end();
    } catch {}
    process.exit(1);
  });
