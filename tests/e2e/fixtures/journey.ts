import {
  expect,
  type Browser,
  type BrowserContext,
  type Page,
  type Route,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  createSessionForClient,
  createStyleProfileFixture,
  ensureAdminUser,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
} from "../db";

/**
 * Journey-test helpers. These exist because the journey specs (J1..J8) thread
 * state across many pages and many actors; if every spec inlined the seed +
 * sign-in dance, the suite would be tens of thousands of lines and would drift
 * apart. Everything here is additive over `tests/e2e/db.ts`.
 *
 * Conventions
 * - Every helper that writes to the DB returns a row; every helper that needs
 *   cleanup returns or accepts a cleanup hook.
 * - Email convention: `${prefix}-${role}-${stamp}@e2e.wishi.test`.
 * - clerkId convention: `e2e_${prefix}_${role}_${stamp}` — must round-trip
 *   through the proxy onboarding gate, so keep alphanumeric + underscore.
 * - Cleanup is best-effort. Tests own try/finally and call ctx.cleanup().
 */

// ---------------------------------------------------------------------------
// Stamps
// ---------------------------------------------------------------------------

export function uniqueStamp(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

/**
 * Sign in via the E2E backdoor (`/sign-in?e2e=1` + email POST). Returns when
 * the post-signin redirect has resolved into a role-appropriate landing.
 */
export async function signInE2E(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in?e2e=1");
  await page.getByLabel("Email").fill(email);
  await Promise.all([
    page.waitForURL((url) => !/\/sign-in/.test(url.toString()), {
      timeout: 15_000,
    }),
    page.getByRole("button", { name: "Sign In" }).click(),
  ]);
}

// ---------------------------------------------------------------------------
// Multi-actor setup — client + stylist linked through a session
// ---------------------------------------------------------------------------

export interface JourneyActor {
  id: string;
  email: string;
  clerkId: string;
}

export interface JourneySession {
  id: string;
  planType: "MINI" | "MAJOR" | "LUX";
  status: string;
}

export interface JourneyContext {
  client: JourneyActor;
  stylist: JourneyActor;
  stylistProfile: { id: string };
  session: JourneySession;
  cleanup: () => Promise<void>;
}

export interface SetupSessionOptions {
  prefix: string;
  planType?: "MINI" | "MAJOR" | "LUX";
  sessionStatus?:
    | "BOOKED"
    | "ACTIVE"
    | "PENDING_END"
    | "PENDING_END_APPROVAL"
    | "COMPLETED"
    | "FROZEN";
  withStyleProfile?: boolean;
  stylistAvailable?: boolean;
  stylistMatchEligible?: boolean;
  stylistType?: "PLATFORM" | "IN_HOUSE";
  stylistGenderPreference?: ("FEMALE" | "MALE" | "NON_BINARY")[];
  stylistStyleSpecialties?: string[];
}

/**
 * Seed a client + stylist + stylist profile + a session linking them. Used by
 * the J2 / J3 / J5 / J6 specs that need a working session out of the box.
 */
export async function setupLinkedSession(
  opts: SetupSessionOptions,
): Promise<JourneyContext> {
  const stamp = uniqueStamp();
  const clientEmail = `${opts.prefix}-c-${stamp}@e2e.wishi.test`;
  const stylistEmail = `${opts.prefix}-s-${stamp}@e2e.wishi.test`;
  const clientClerkId = `e2e_${opts.prefix}_c_${stamp.replace(/-/g, "_")}`;
  const stylistClerkId = `e2e_${opts.prefix}_s_${stamp.replace(/-/g, "_")}`;

  const client = await ensureClientUser({
    clerkId: clientClerkId,
    email: clientEmail,
    firstName: "Journey",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: stylistClerkId,
    email: stylistEmail,
    firstName: "Journey",
    lastName: "Stylist",
  });
  const stylistProfile = await ensureStylistProfile({
    userId: stylist.id,
    isAvailable: opts.stylistAvailable ?? true,
    matchEligible: opts.stylistMatchEligible ?? true,
    styleSpecialties: opts.stylistStyleSpecialties ?? ["minimalist"],
    genderPreference: opts.stylistGenderPreference ?? ["FEMALE"],
  });
  // Default to ELIGIBLE so post-signin redirects land on /stylist/dashboard
  // instead of stalling on /onboarding. Specs needing mid-wizard state set
  // it explicitly via setupStylist().
  await getPool().query(
    `UPDATE stylist_profiles
       SET onboarding_status = 'ELIGIBLE'::"StylistOnboardingStatus",
           onboarding_step = 12,
           stylist_type = COALESCE($1, stylist_type)
       WHERE id = $2`,
    [opts.stylistType ?? null, stylistProfile.id],
  );
  if (opts.withStyleProfile) {
    await createStyleProfileFixture(client.id);
  }
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: opts.sessionStatus ?? "ACTIVE",
    planType: opts.planType ?? "MINI",
  });

  return {
    client: { id: client.id, email: clientEmail, clerkId: clientClerkId },
    stylist: { id: stylist.id, email: stylistEmail, clerkId: stylistClerkId },
    stylistProfile: { id: stylistProfile.id },
    session: {
      id: session.id,
      planType: opts.planType ?? "MINI",
      status: opts.sessionStatus ?? "ACTIVE",
    },
    cleanup: async () => {
      const p = getPool();
      await p.query(`DELETE FROM messages WHERE session_id = $1`, [session.id]);
      await p.query(
        `DELETE FROM session_pending_actions WHERE session_id = $1`,
        [session.id],
      );
      await p.query(
        `DELETE FROM board_items WHERE board_id IN (SELECT id FROM boards WHERE session_id = $1)`,
        [session.id],
      );
      await p.query(
        `DELETE FROM board_photos WHERE board_id IN (SELECT id FROM boards WHERE session_id = $1)`,
        [session.id],
      );
      await p.query(
        `DELETE FROM favorite_boards WHERE board_id IN (SELECT id FROM boards WHERE session_id = $1)`,
        [session.id],
      );
      await p.query(`DELETE FROM boards WHERE session_id = $1`, [session.id]);
      await p.query(`DELETE FROM cart_items WHERE session_id = $1`, [
        session.id,
      ]);
      await p.query(`DELETE FROM closet_items WHERE user_id = $1`, [client.id]);
      await p.query(`DELETE FROM affiliate_clicks WHERE user_id = $1`, [
        client.id,
      ]);
      await p.query(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = $1)`, [client.id]);
      await p.query(`DELETE FROM orders WHERE user_id = $1`, [client.id]);
      await cleanupStylistProfile(stylist.id);
      await cleanupE2EUserByEmail(clientEmail);
      await cleanupE2EUserByEmail(stylistEmail);
    },
  };
}

// ---------------------------------------------------------------------------
// Single-actor seeders — anon, client, stylist, admin
// ---------------------------------------------------------------------------

export interface SoloActor {
  id: string;
  email: string;
  clerkId: string;
  cleanup: () => Promise<void>;
}

export async function setupClient(prefix: string): Promise<SoloActor> {
  const stamp = uniqueStamp();
  const email = `${prefix}-c-${stamp}@e2e.wishi.test`;
  const clerkId = `e2e_${prefix}_c_${stamp.replace(/-/g, "_")}`;
  const u = await ensureClientUser({
    clerkId,
    email,
    firstName: "Solo",
    lastName: "Client",
  });
  return {
    id: u.id,
    email,
    clerkId,
    cleanup: () => cleanupE2EUserByEmail(email),
  };
}

export async function setupStylist(
  prefix: string,
  opts: {
    onboardingStatus?:
      | "NOT_STARTED"
      | "IN_PROGRESS"
      | "AWAITING_ELIGIBILITY"
      | "ELIGIBLE";
    onboardingStep?: number;
    isAvailable?: boolean;
    matchEligible?: boolean;
    stylistType?: "PLATFORM" | "IN_HOUSE";
  } = {},
): Promise<SoloActor & { profileId: string }> {
  const stamp = uniqueStamp();
  const email = `${prefix}-s-${stamp}@e2e.wishi.test`;
  const clerkId = `e2e_${prefix}_s_${stamp.replace(/-/g, "_")}`;
  const u = await ensureStylistUser({
    clerkId,
    email,
    firstName: "Solo",
    lastName: "Stylist",
  });
  const profile = await ensureStylistProfile({
    userId: u.id,
    isAvailable: opts.isAvailable ?? true,
    matchEligible: opts.matchEligible ?? true,
  });
  const status = opts.onboardingStatus ?? "ELIGIBLE";
  const step = opts.onboardingStep ?? 12;
  await getPool().query(
    `UPDATE stylist_profiles
       SET onboarding_status = $1::"StylistOnboardingStatus",
           onboarding_step = $2,
           stylist_type = COALESCE($3, stylist_type)
       WHERE id = $4`,
    [status, step, opts.stylistType ?? null, profile.id],
  );
  return {
    id: u.id,
    email,
    clerkId,
    profileId: profile.id,
    cleanup: async () => {
      await cleanupStylistProfile(u.id);
      await cleanupE2EUserByEmail(email);
    },
  };
}

export async function setupAdmin(prefix: string): Promise<SoloActor> {
  const stamp = uniqueStamp();
  const email = `${prefix}-a-${stamp}@e2e.wishi.test`;
  const clerkId = `e2e_${prefix}_a_${stamp.replace(/-/g, "_")}`;
  const u = await ensureAdminUser({
    clerkId,
    email,
    firstName: "Solo",
    lastName: "Admin",
  });
  return {
    id: u.id,
    email,
    clerkId,
    cleanup: () => cleanupE2EUserByEmail(email),
  };
}

// ---------------------------------------------------------------------------
// Two-context helper for client + stylist scenarios
// ---------------------------------------------------------------------------

export interface DualContext {
  clientCtx: BrowserContext;
  clientPage: Page;
  stylistCtx: BrowserContext;
  stylistPage: Page;
  close: () => Promise<void>;
}

export async function openDualContexts(
  browser: Browser,
  ctx: JourneyContext,
): Promise<DualContext> {
  const clientCtx = await browser.newContext();
  const stylistCtx = await browser.newContext();
  const clientPage = await clientCtx.newPage();
  const stylistPage = await stylistCtx.newPage();
  await signInE2E(clientPage, ctx.client.email);
  await signInE2E(stylistPage, ctx.stylist.email);
  return {
    clientCtx,
    clientPage,
    stylistCtx,
    stylistPage,
    close: async () => {
      await clientCtx.close();
      await stylistCtx.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Subscription seeding (Mini/Major)
// ---------------------------------------------------------------------------

export interface SubscriptionSeedOptions {
  userId: string;
  stylistId?: string | null;
  planType?: "MINI" | "MAJOR";
  status?:
    | "TRIALING"
    | "ACTIVE"
    | "PAUSED"
    | "PAST_DUE"
    | "CANCELLED"
    | "INCOMPLETE";
  frequency?: "MONTHLY" | "QUARTERLY";
  trialEndsInDays?: number;
  pendingPlanType?: "MINI" | "MAJOR" | null;
  pausedUntilInDays?: number | null;
  cancelRequestedAtMinutesAgo?: number | null;
  lastPaymentFailedAtMinutesAgo?: number | null;
}

export async function seedSubscription(
  opts: SubscriptionSeedOptions,
): Promise<{ id: string; stripeSubscriptionId: string }> {
  const id = randomUUID();
  const stripeId = `sub_e2e_${id.slice(0, 8)}`;
  const trialEnd = opts.trialEndsInDays
    ? new Date(Date.now() + opts.trialEndsInDays * 86_400_000)
    : null;
  const periodEnd = new Date(Date.now() + 30 * 86_400_000);
  const pausedUntil =
    opts.pausedUntilInDays != null
      ? new Date(Date.now() + opts.pausedUntilInDays * 86_400_000)
      : null;
  const cancelRequestedAt =
    opts.cancelRequestedAtMinutesAgo != null
      ? new Date(Date.now() - opts.cancelRequestedAtMinutesAgo * 60_000)
      : null;
  const lastPaymentFailedAt =
    opts.lastPaymentFailedAtMinutesAgo != null
      ? new Date(Date.now() - opts.lastPaymentFailedAtMinutesAgo * 60_000)
      : null;

  await getPool().query(
    `INSERT INTO subscriptions
       (id, user_id, stylist_id, plan_type, pending_plan_type, status, frequency,
        stripe_subscription_id, trial_ends_at, current_period_end,
        paused_until, cancel_requested_at, last_payment_failed_at,
        created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())`,
    [
      id,
      opts.userId,
      opts.stylistId ?? null,
      opts.planType ?? "MAJOR",
      opts.pendingPlanType ?? null,
      opts.status ?? "TRIALING",
      opts.frequency ?? "MONTHLY",
      stripeId,
      trialEnd,
      periodEnd,
      pausedUntil,
      cancelRequestedAt,
      lastPaymentFailedAt,
    ],
  );
  return { id, stripeSubscriptionId: stripeId };
}

// ---------------------------------------------------------------------------
// Pending action helpers
// ---------------------------------------------------------------------------

export async function openPendingAction(opts: {
  sessionId: string;
  type:
    | "PENDING_MOODBOARD"
    | "PENDING_STYLEBOARD"
    | "PENDING_CLIENT_FEEDBACK"
    | "PENDING_RESTYLE"
    | "PENDING_STYLIST_RESPONSE"
    | "PENDING_FOLLOWUP"
    | "PENDING_END_APPROVAL";
  dueAtMinutesFromNow?: number;
  boardId?: string;
}): Promise<{ id: string }> {
  const id = randomUUID();
  const dueAt = new Date(
    Date.now() + (opts.dueAtMinutesFromNow ?? 60) * 60_000,
  );
  await getPool().query(
    `INSERT INTO session_pending_actions
       (id, session_id, type, status, due_at, board_id, created_at, updated_at)
     VALUES ($1, $2, $3::"PendingActionType", 'OPEN', $4, $5, NOW(), NOW())`,
    [id, opts.sessionId, opts.type, dueAt, opts.boardId ?? null],
  );
  return { id };
}

export async function getPendingActions(sessionId: string) {
  const { rows } = await getPool().query(
    `SELECT * FROM session_pending_actions WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId],
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Notification preference helpers
// ---------------------------------------------------------------------------

export async function setNotificationPreference(opts: {
  userId: string;
  channel: "EMAIL" | "SMS" | "PUSH";
  category: string;
  isEnabled: boolean;
}): Promise<void> {
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO notification_preferences (id, user_id, channel, category, is_enabled, created_at, updated_at)
     VALUES ($1, $2, $3::"NotificationChannel", $4, $5, NOW(), NOW())
     ON CONFLICT (user_id, channel, category)
       DO UPDATE SET is_enabled = $5, updated_at = NOW()`,
    [id, opts.userId, opts.channel, opts.category, opts.isEnabled],
  );
}

// ---------------------------------------------------------------------------
// Cart / Order / AffiliateClick seeders
// ---------------------------------------------------------------------------

export async function seedCartItem(opts: {
  userId: string;
  sessionId: string;
  inventoryProductId: string;
  quantity?: number;
}): Promise<{ id: string }> {
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO cart_items (id, user_id, session_id, inventory_product_id, quantity, added_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [
      id,
      opts.userId,
      opts.sessionId,
      opts.inventoryProductId,
      opts.quantity ?? 1,
    ],
  );
  return { id };
}

export async function seedAffiliateClick(opts: {
  userId: string;
  inventoryProductId: string;
  retailer?: string;
  url?: string;
  sessionId?: string | null;
  clickedMinutesAgo?: number;
  promptSentAtMinutesAgo?: number | null;
}): Promise<{ id: string }> {
  const id = randomUUID();
  const clickedAt = new Date(
    Date.now() - (opts.clickedMinutesAgo ?? 0) * 60_000,
  );
  const promptSentAt =
    opts.promptSentAtMinutesAgo != null
      ? new Date(Date.now() - opts.promptSentAtMinutesAgo * 60_000)
      : null;
  await getPool().query(
    `INSERT INTO affiliate_clicks
       (id, user_id, inventory_product_id, retailer, url, session_id,
        clicked_at, prompt_sent_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [
      id,
      opts.userId,
      opts.inventoryProductId,
      opts.retailer ?? "Nordstrom",
      opts.url ?? "https://example.com/product",
      opts.sessionId ?? null,
      clickedAt,
      promptSentAt,
    ],
  );
  return { id };
}

export async function seedOrder(opts: {
  userId: string;
  sessionId?: string | null;
  source?: "DIRECT_SALE" | "SELF_REPORTED" | "AFFILIATE_CONFIRMED";
  status?:
    | "PENDING"
    | "ORDERED"
    | "SHIPPED"
    | "ARRIVED"
    | "RETURN_IN_PROCESS"
    | "RETURNED"
    | "CANCELLED";
  retailer?: string;
  totalInCents?: number;
  arrivedAtDaysAgo?: number;
  trackingNumber?: string;
}): Promise<{ id: string }> {
  const id = randomUUID();
  const arrivedAt =
    opts.arrivedAtDaysAgo != null
      ? new Date(Date.now() - opts.arrivedAtDaysAgo * 86_400_000)
      : null;
  await getPool().query(
    `INSERT INTO orders
       (id, user_id, session_id, source, status, retailer, total_in_cents,
        tracking_number, arrived_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4::"OrderSource", $5::"OrderStatus", $6, $7, $8, $9, NOW(), NOW())`,
    [
      id,
      opts.userId,
      opts.sessionId ?? null,
      opts.source ?? "DIRECT_SALE",
      opts.status ?? "ORDERED",
      opts.retailer ?? "Wishi",
      opts.totalInCents ?? 12_000,
      opts.trackingNumber ?? null,
      arrivedAt,
    ],
  );
  return { id };
}

export async function seedOrderItem(opts: {
  orderId: string;
  inventoryProductId?: string;
  title?: string;
  brand?: string;
  imageUrl?: string;
  priceInCents?: number;
}): Promise<{ id: string }> {
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO order_items
       (id, order_id, inventory_product_id, title, brand, image_url, price_in_cents, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [
      id,
      opts.orderId,
      opts.inventoryProductId ?? "test-product",
      opts.title ?? "Seeded item",
      opts.brand ?? "TestBrand",
      opts.imageUrl ?? "https://placehold.co/400x400/png",
      opts.priceInCents ?? 12_000,
    ],
  );
  return { id };
}

// ---------------------------------------------------------------------------
// Worker invocation
// ---------------------------------------------------------------------------

/**
 * Manually fire a worker via /api/admin/workers/[name]/run. Caller must be an
 * authed admin Page. Returns the worker payload (worker, durationMs, ...).
 */
export async function runWorker(
  adminPage: Page,
  name:
    | "affiliate-ingest"
    | "affiliate-prompt"
    | "pending-action-expiry"
    | "stale-cleanup"
    | "loyalty-recalc",
): Promise<Record<string, unknown>> {
  const res = await adminPage.request.post(`/api/admin/workers/${name}/run`);
  if (!res.ok()) {
    throw new Error(
      `worker ${name} failed: ${res.status()} ${await res.text()}`,
    );
  }
  return (await res.json()) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// External-service interceptors
// ---------------------------------------------------------------------------

export interface KlaviyoCall {
  metric: string;
  body: unknown;
}

/**
 * Spy on Klaviyo Events API calls. Returns a getter for captured payloads and
 * a teardown function. The dispatcher fires `fetch` to a.klaviyo.com — context
 * routing intercepts that.
 */
export function interceptKlaviyo(
  ctxOrPage: BrowserContext | Page,
): {
  calls: () => KlaviyoCall[];
  reset: () => void;
  detach: () => Promise<void>;
} {
  const captured: KlaviyoCall[] = [];
  const handler = async (route: Route) => {
    try {
      const reqBody = route.request().postDataJSON() as
        | { data?: { attributes?: { metric?: { data?: { attributes?: { name?: string } } } } } }
        | undefined;
      const metric =
        reqBody?.data?.attributes?.metric?.data?.attributes?.name ?? "unknown";
      captured.push({ metric, body: reqBody });
    } catch {
      captured.push({ metric: "unparseable", body: null });
    }
    await route.fulfill({ status: 202, body: "{}" });
  };
  const pattern = "https://a.klaviyo.com/api/events";
  void ctxOrPage.route(pattern, handler);
  return {
    calls: () => [...captured],
    reset: () => {
      captured.length = 0;
    },
    detach: async () => {
      await ctxOrPage.unroute(pattern, handler);
    },
  };
}

/**
 * Stub /api/products + similar to a 500 — used to assert graceful degradation
 * when the inventory service is unreachable. Routed at context level so
 * `page.request.*` calls are also intercepted.
 */
export async function stubInventoryDown(page: Page): Promise<void> {
  const ctx = page.context();
  await ctx.route("**/api/products**", (route) =>
    route.fulfill({ status: 502, body: '{"error":"inventory down"}' }),
  );
  await ctx.route("**/api/ai/similar-items**", (route) =>
    route.fulfill({ status: 502, body: '{"error":"inventory down"}' }),
  );
}

/**
 * Stub the Twilio token endpoint to 500 so chat falls through to the DB
 * bootstrap path (`useChat` resilience contract). Context-level so
 * `page.request.*` is intercepted as well.
 */
export async function stubTwilioTokenDown(page: Page): Promise<void> {
  await page.context().route("**/api/chat/token**", (route) =>
    route.fulfill({
      status: 500,
      body: '{"error":"twilio down"}',
    }),
  );
}

// ---------------------------------------------------------------------------
// Misc DB helpers
// ---------------------------------------------------------------------------

export async function getSessionRow(sessionId: string) {
  const { rows } = await getPool().query(
    `SELECT * FROM sessions WHERE id = $1`,
    [sessionId],
  );
  return rows[0] ?? null;
}

export async function getMessages(sessionId: string) {
  const { rows } = await getPool().query(
    `SELECT id, kind, system_template, board_id, user_id, text
       FROM messages WHERE session_id = $1
       ORDER BY created_at ASC`,
    [sessionId],
  );
  return rows;
}

export async function getBoards(sessionId: string) {
  const { rows } = await getPool().query(
    `SELECT * FROM boards WHERE session_id = $1 ORDER BY created_at ASC`,
    [sessionId],
  );
  return rows;
}

export async function getOrdersForUser(userId: string) {
  const { rows } = await getPool().query(
    `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return rows;
}

export async function getClosetItemsForUser(userId: string) {
  const { rows } = await getPool().query(
    `SELECT * FROM closet_items WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return rows;
}

export async function getAuditLogs(opts: {
  actorUserId?: string;
  entityType?: string;
  action?: string;
  limit?: number;
}) {
  const { rows } = await getPool().query(
    `SELECT * FROM audit_logs
      WHERE ($1::text IS NULL OR actor_user_id = $1)
        AND ($2::text IS NULL OR entity_type = $2)
        AND ($3::text IS NULL OR action = $3)
      ORDER BY created_at DESC LIMIT $4`,
    [
      opts.actorUserId ?? null,
      opts.entityType ?? null,
      opts.action ?? null,
      opts.limit ?? 25,
    ],
  );
  return rows;
}

export async function getLoyaltyAccount(userId: string) {
  const { rows } = await getPool().query(
    `SELECT * FROM loyalty_accounts WHERE user_id = $1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function getSubscription(userId: string) {
  const { rows } = await getPool().query(
    `SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function getReferralCreditsForUser(userId: string) {
  const { rows } = await getPool().query(
    `SELECT * FROM referral_credits WHERE referrer_user_id = $1 OR referred_user_id = $1`,
    [userId],
  );
  return rows;
}
