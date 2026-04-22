import pg from "pg";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Pool
// ---------------------------------------------------------------------------

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is not set");
    }
    pool = new pg.Pool({ connectionString, max: 5 });
    pool.on("error", (err) => {
      console.error("Unexpected pg pool error:", err);
    });
  }
  return pool;
}

function generateId(): string {
  return randomUUID();
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

export async function disconnectTestDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

export async function cleanupE2EUserByEmail(email: string): Promise<void> {
  const { rows } = await getPool().query(
    `SELECT id FROM users WHERE email = $1`,
    [email],
  );
  if (rows.length === 0) return;
  await cleanupE2EUserById(rows[0].id);
}

export async function cleanupE2EUserById(userId: string): Promise<void> {
  const p = getPool();
  await p.query(
    `DELETE FROM session_pending_actions WHERE session_id IN (SELECT id FROM sessions WHERE client_id = $1 OR stylist_id = $1)`,
    [userId],
  );
  await p.query(`DELETE FROM session_match_history WHERE client_id = $1 OR stylist_id = $1`, [userId]);
  // Phase 9b: promotions + loyalty must be cleared before payments/users
  await p.query(
    `DELETE FROM referral_credits WHERE referrer_user_id = $1 OR referred_user_id = $1`,
    [userId],
  );
  await p.query(`DELETE FROM loyalty_accounts WHERE user_id = $1`, [userId]);
  await p.query(
    `DELETE FROM gift_cards WHERE purchaser_user_id = $1`,
    [userId],
  );
  await p.query(`DELETE FROM payments WHERE user_id = $1`, [userId]);
  // Phase 6: Payout rows must be cleared before stylist_profiles can cascade-delete.
  await p.query(
    `DELETE FROM payouts WHERE session_id IN (SELECT id FROM sessions WHERE client_id = $1 OR stylist_id = $1)
       OR stylist_profile_id IN (SELECT id FROM stylist_profiles WHERE user_id = $1)`,
    [userId],
  );
  await p.query(`DELETE FROM sessions WHERE client_id = $1 OR stylist_id = $1`, [userId]);
  await p.query(`DELETE FROM subscriptions WHERE user_id = $1`, [userId]);
  await p.query(`DELETE FROM match_quiz_results WHERE user_id = $1`, [userId]);
  await p.query(`DELETE FROM notification_preferences WHERE user_id = $1`, [userId]);
  await p.query(`DELETE FROM color_preferences WHERE user_id = $1`, [userId]);
  await p.query(`DELETE FROM fabric_preferences WHERE user_id = $1`, [userId]);
  await p.query(`DELETE FROM pattern_preferences WHERE user_id = $1`, [userId]);
  await p.query(`DELETE FROM budget_by_category WHERE user_id = $1`, [userId]);
  await p.query(`DELETE FROM specific_preferences WHERE user_id = $1`, [userId]);
  await p.query(`DELETE FROM body_profiles WHERE user_id = $1`, [userId]);
  await p.query(`DELETE FROM style_profiles WHERE user_id = $1`, [userId]);
  await p.query(`DELETE FROM users WHERE id = $1`, [userId]);
}

// ---------------------------------------------------------------------------
// Fixture creators
// ---------------------------------------------------------------------------

interface UserParams {
  clerkId: string;
  email: string;
  firstName: string;
  lastName: string;
}

export async function ensureClientUser(params: UserParams) {
  await cleanupE2EUserByEmail(params.email);
  const id = generateId();
  const referralCode = `E2E-${params.clerkId.toUpperCase()}`;

  const { rows } = await getPool().query(
    `INSERT INTO users (id, clerk_id, auth_provider, email, first_name, last_name, role, referral_code, created_at, updated_at)
     VALUES ($1, $2, 'EMAIL', $3, $4, $5, 'CLIENT', $6, NOW(), NOW())
     RETURNING *`,
    [id, params.clerkId, params.email, params.firstName, params.lastName, referralCode],
  );
  return rows[0];
}

export async function ensureStylistUser(params: UserParams) {
  await cleanupE2EUserByEmail(params.email);
  const id = generateId();
  const referralCode = `E2E-${params.clerkId.toUpperCase()}`;

  const { rows } = await getPool().query(
    `INSERT INTO users (id, clerk_id, auth_provider, email, first_name, last_name, role, referral_code, created_at, updated_at)
     VALUES ($1, $2, 'EMAIL', $3, $4, $5, 'STYLIST', $6, NOW(), NOW())
     RETURNING *`,
    [id, params.clerkId, params.email, params.firstName, params.lastName, referralCode],
  );
  return rows[0];
}

export async function ensureAdminUser(params: UserParams) {
  await cleanupE2EUserByEmail(params.email);
  const id = generateId();
  const referralCode = `E2E-${params.clerkId.toUpperCase()}`;

  const { rows } = await getPool().query(
    `INSERT INTO users (id, clerk_id, auth_provider, email, first_name, last_name, role, referral_code, created_at, updated_at)
     VALUES ($1, $2, 'EMAIL', $3, $4, $5, 'ADMIN', $6, NOW(), NOW())
     RETURNING *`,
    [id, params.clerkId, params.email, params.firstName, params.lastName, referralCode],
  );
  return rows[0];
}

export async function createSessionForClient({
  amountPaidInCents = 6000,
  clientId,
  planType = "MINI",
  status = "BOOKED",
  stylistId = null,
}: {
  amountPaidInCents?: number;
  clientId: string;
  planType?: "MINI" | "MAJOR" | "LUX";
  status?: "BOOKED" | "ACTIVE" | "COMPLETED";
  stylistId?: string | null;
}) {
  const id = generateId();
  const styleboardsAllowed =
    planType === "MAJOR" ? 5 : planType === "LUX" ? 8 : 2;

  const { rows } = await getPool().query(
    `INSERT INTO sessions (id, client_id, stylist_id, plan_type, status, amount_paid_in_cents, moodboards_allowed, styleboards_allowed, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 1, $7, NOW(), NOW())
     RETURNING *`,
    [id, clientId, stylistId, planType, status, amountPaidInCents, styleboardsAllowed],
  );
  return rows[0];
}

export async function createStyleProfileFixture(userId: string): Promise<void> {
  const id = generateId();
  const quizAnswers = JSON.stringify({
    "style_profile.style_preferences": ["minimalist"],
  });

  await getPool().query(
    `INSERT INTO style_profiles (id, user_id, style_preferences, style_icons, comfort_zone_level, dress_code, quiz_completed_at, quiz_answers, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 5, 'casual', NOW(), $5, NOW(), NOW())`,
    [id, userId, ["minimalist"], [], quizAnswers],
  );
}

// ---------------------------------------------------------------------------
// Stylist profile helpers
// ---------------------------------------------------------------------------

export async function ensureStylistProfile({
  userId,
  isAvailable = true,
  matchEligible = true,
  styleSpecialties = ["minimalist"],
  genderPreference = ["FEMALE"],
  budgetBrackets = ["moderate"],
}: {
  userId: string;
  isAvailable?: boolean;
  matchEligible?: boolean;
  styleSpecialties?: string[];
  genderPreference?: string[];
  budgetBrackets?: string[];
}) {
  const id = generateId();
  const { rows } = await getPool().query(
    `INSERT INTO stylist_profiles (id, user_id, is_available, match_eligible, style_specialties, gender_preference, budget_brackets, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::"Gender"[], $7, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET is_available = $3, match_eligible = $4, style_specialties = $5, gender_preference = $6::"Gender"[], budget_brackets = $7, updated_at = NOW()
     RETURNING *`,
    [id, userId, isAvailable, matchEligible, styleSpecialties, genderPreference, budgetBrackets],
  );
  return rows[0];
}

export async function cleanupStylistProfile(userId: string): Promise<void> {
  const p = getPool();
  await p.query(`DELETE FROM stylist_waitlist_entries WHERE stylist_profile_id IN (SELECT id FROM stylist_profiles WHERE user_id = $1)`, [userId]);
  await p.query(`DELETE FROM session_match_history WHERE stylist_id = $1`, [userId]);
  // Phase 6: Payouts FK → stylist_profiles must be cleared before the profile deletes.
  await p.query(
    `DELETE FROM payouts WHERE stylist_profile_id IN (SELECT id FROM stylist_profiles WHERE user_id = $1)`,
    [userId],
  );
  await p.query(`DELETE FROM sessions WHERE stylist_id = $1`, [userId]);
  await p.query(`DELETE FROM stylist_profiles WHERE user_id = $1`, [userId]);
}

export async function createMatchQuizResult({
  userId,
  genderToStyle = "FEMALE",
  styleDirection = ["minimalist"],
  budgetBracket = "moderate",
}: {
  userId: string;
  genderToStyle?: string;
  styleDirection?: string[];
  budgetBracket?: string;
}) {
  const id = generateId();
  const { rows } = await getPool().query(
    `INSERT INTO match_quiz_results (id, user_id, gender_to_style, style_direction, budget_bracket, completed_at, raw_answers)
     VALUES ($1, $2, $3, $4, $5, NOW(), '{}')
     RETURNING *`,
    [id, userId, genderToStyle, styleDirection, budgetBracket],
  );
  return rows[0];
}

// ---------------------------------------------------------------------------
// Waitlist helpers
// ---------------------------------------------------------------------------

export async function getWaitlistEntry(userId: string, stylistProfileId: string) {
  const { rows } = await getPool().query(
    `SELECT * FROM stylist_waitlist_entries WHERE user_id = $1 AND stylist_profile_id = $2`,
    [userId, stylistProfileId],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

export async function getSessionById(sessionId: string) {
  const { rows } = await getPool().query(
    `SELECT * FROM sessions WHERE id = $1`,
    [sessionId],
  );
  return rows[0] ?? null;
}

export async function getMatchHistoryForSession(sessionId: string) {
  const { rows } = await getPool().query(
    `SELECT * FROM session_match_history WHERE session_id = $1`,
    [sessionId],
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Queries (return snake_case column names)
// ---------------------------------------------------------------------------

export async function getUserByEmail(email: string) {
  const { rows } = await getPool().query(
    `SELECT * FROM users WHERE email = $1`,
    [email],
  );
  return rows[0] ?? null;
}

export async function getLatestMatchQuizResultForUser(userId: string) {
  const { rows } = await getPool().query(
    `SELECT * FROM match_quiz_results WHERE user_id = $1 ORDER BY completed_at DESC LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function getStyleProfileByUserId(userId: string) {
  const { rows } = await getPool().query(
    `SELECT * FROM style_profiles WHERE user_id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function getBodyProfileByUserId(userId: string) {
  const { rows } = await getPool().query(
    `SELECT * FROM body_profiles WHERE user_id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}
