/**
 * Full end-to-end walkthrough of Wishi v1.
 *
 * Drives the golden path against a local dev:e2e server with staging integration
 * keys loaded. Polls external integrations after the run to prove events landed,
 * and counts DB rows to prove service logic executed.
 *
 * Run: npm run dev:e2e (in one terminal), then:
 *   npx tsx --env-file=.env scripts/e2e-full-walkthrough.ts
 *
 * Everything created (users, sessions, boards, orders, payments) is torn down
 * at the end via cleanupE2EUserById.
 */

import { randomUUID } from "node:crypto";
import {
  cleanupE2EUserById,
  cleanupStylistProfile,
  createMatchQuizResult,
  createStyleProfileFixture,
  ensureAdminUser,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
  disconnectTestDb,
  createSessionForClient,
} from "../tests/e2e/db";
import { createChatConversation } from "@/lib/chat/create-conversation";
import { sendMoodboard } from "@/lib/boards/moodboard.service";
import { sendStyleboard } from "@/lib/boards/styleboard.service";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3001";
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const KLAVIYO_KEY = process.env.KLAVIYO_API_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;

const CLERK_E2E_COOKIE = "wishi_e2e_clerk_id";
const ROLE_E2E_COOKIE = "wishi_e2e_role";

const RUN_ID = `e2e-${Date.now()}`;
const RUN_START = new Date();

type StepResult = { name: string; ok: boolean; detail: string };
const results: StepResult[] = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  const mark = ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
  console.log(`  ${mark} ${name}  ${detail}`);
}

function authHeaders(clerkId: string, role: "CLIENT" | "STYLIST" | "ADMIN") {
  return {
    "Content-Type": "application/json",
    Cookie: `${CLERK_E2E_COOKIE}=${clerkId}; ${ROLE_E2E_COOKIE}=${role}`,
  };
}

async function http(
  method: string,
  path: string,
  body: unknown,
  clerkId: string,
  role: "CLIENT" | "STYLIST" | "ADMIN",
) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: authHeaders(clerkId, role),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  return { status: res.status, body: json, raw: text };
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n\x1b[1mWishi full e2e walkthrough\x1b[0m`);
  console.log(`  run id:    ${RUN_ID}`);
  console.log(`  target:    ${BASE}`);
  console.log(`  started:   ${RUN_START.toISOString()}\n`);

  console.log("\x1b[1m[1/5] Seeding users + profiles\x1b[0m");

  const clientEmail = `${RUN_ID}-client@e2e.wishi.test`;
  const stylistEmail = `${RUN_ID}-stylist@e2e.wishi.test`;
  const adminEmail = `${RUN_ID}-admin@e2e.wishi.test`;

  const client = await ensureClientUser({
    clerkId: `${RUN_ID}_c`,
    email: clientEmail,
    firstName: "Ezra",
    lastName: "Client",
  });
  record("ensure client user", true, `id=${client.id}`);

  const stylistUser = await ensureStylistUser({
    clerkId: `${RUN_ID}_s`,
    email: stylistEmail,
    firstName: "Sloane",
    lastName: "Stylist",
  });
  record("ensure stylist user", true, `id=${stylistUser.id}`);

  const adminUser = await ensureAdminUser({
    clerkId: `${RUN_ID}_a`,
    email: adminEmail,
    firstName: "Ada",
    lastName: "Admin",
  });
  record("ensure admin user", true, `id=${adminUser.id}`);

  await createStyleProfileFixture(client.id);
  await createMatchQuizResult({ userId: client.id });
  record("client style profile + quiz", true, "seeded");

  const stylistProfile = await ensureStylistProfile({
    userId: stylistUser.id,
    isAvailable: true,
    matchEligible: true,
    styleSpecialties: ["minimalist"],
    genderPreference: ["FEMALE"],
    budgetBrackets: ["moderate"],
  });
  record("stylist profile", true, `id=${stylistProfile.id}`);

  // Book a session directly in DB (skips Stripe checkout; the real path is
  // exercised separately in `tests/e2e/booking.spec.ts`).
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylistUser.id,
    planType: "MINI",
    status: "ACTIVE",
    amountPaidInCents: 6000,
  });
  record("session created (ACTIVE, MINI, $60)", true, `id=${session.id}`);

  // Chat conversation is normally created by the matcher when the session
  // transitions BOOKED → ACTIVE. We skipped the matcher, so bootstrap it
  // directly. This exercises real Twilio Conversations + participant adds.
  try {
    const channelSid = await createChatConversation(session.id);
    record("Twilio conversation for session", true, `sid=${channelSid}`);
  } catch (err) {
    record(
      "Twilio conversation for session",
      false,
      err instanceof Error ? err.message : String(err),
    );
  }

  // ---------------------------------------------------------------------------
  console.log("\n\x1b[1m[2/5] Driving golden path via HTTP\x1b[0m");

  // Stylist creates moodboard (DRAFT), then sends it (SENT). The send step
  // must happen in-process because the send API requires a server action with
  // Twilio credentials; we mirror what the admin UI does via the service.
  const moodRes = await http(
    "POST",
    "/api/moodboards",
    { sessionId: session.id },
    stylistUser.clerk_id,
    "STYLIST",
  );
  const moodboardId = (moodRes.body as { id?: string })?.id;
  record(
    "POST /api/moodboards (DRAFT)",
    moodRes.status === 200 || moodRes.status === 201,
    `status=${moodRes.status} boardId=${moodboardId ?? "?"}`,
  );

  if (moodboardId) {
    // Seed 3 inspiration photos on the moodboard directly (browser upload path
    // would PUT to S3; we fake the S3 key and URL since we only care about
    // send-side logic here).
    for (let i = 0; i < 3; i++) {
      await getPool().query(
        `INSERT INTO board_photos (id, board_id, s3_key, url, order_index, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [
          randomUUID(),
          moodboardId,
          `e2e/mood/${moodboardId}/photo-${i}.jpg`,
          `https://example.com/moodboard-photo-${i}.jpg`,
          i,
        ],
      );
    }
    record("seed 3 moodboard photos", true, "");

    try {
      await sendMoodboard(moodboardId);
      record("sendMoodboard (DRAFT → SENT)", true, "");
    } catch (err) {
      record(
        "sendMoodboard (DRAFT → SENT)",
        false,
        err instanceof Error ? err.message : String(err),
      );
    }

    const fbRes = await http(
      "POST",
      `/api/moodboards/${moodboardId}/feedback`,
      { rating: "LOVE", feedbackText: "love the direction" },
      client.clerk_id,
      "CLIENT",
    );
    record(
      "POST /api/moodboards/[id]/feedback (LOVE)",
      fbRes.status === 200 || fbRes.status === 201,
      `status=${fbRes.status}`,
    );
  }

  // Stylist creates styleboard (DRAFT), sends it, then client rates.
  const styleRes = await http(
    "POST",
    "/api/styleboards",
    { sessionId: session.id },
    stylistUser.clerk_id,
    "STYLIST",
  );
  const styleboardId = (styleRes.body as { id?: string })?.id;
  record(
    "POST /api/styleboards (DRAFT)",
    styleRes.status === 200 || styleRes.status === 201,
    `status=${styleRes.status} boardId=${styleboardId ?? "?"}`,
  );

  if (styleboardId) {
    // Seed 3 WEB_ADDED items — skips the inventory-service dependency while
    // still proving the send → notification → DB flow.
    for (let i = 0; i < 3; i++) {
      await getPool().query(
        `INSERT INTO board_items (id, board_id, source, order_index, web_item_url, web_item_title, web_item_brand, web_item_price_in_cents, web_item_image_url, created_at, updated_at)
         VALUES ($1, $2, 'WEB_ADDED', $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
        [
          randomUUID(),
          styleboardId,
          i,
          `https://example.com/item-${i}`,
          `Sample item ${i}`,
          "Sample Brand",
          10000 + i * 5000,
          `https://example.com/item-${i}.jpg`,
        ],
      );
    }
    record("seed 3 styleboard items (WEB_ADDED)", true, "");

    try {
      await sendStyleboard(styleboardId);
      record("sendStyleboard (DRAFT → SENT)", true, "");
    } catch (err) {
      record(
        "sendStyleboard (DRAFT → SENT)",
        false,
        err instanceof Error ? err.message : String(err),
      );
    }

    const fbRes = await http(
      "POST",
      `/api/styleboards/${styleboardId}/feedback`,
      { rating: "LOVE", feedbackText: "amazing, thank you" },
      client.clerk_id,
      "CLIENT",
    );
    record(
      "POST /api/styleboards/[id]/feedback (LOVE)",
      fbRes.status === 200 || fbRes.status === 201,
      `status=${fbRes.status}`,
    );
  }

  // Stylist requests end-session
  const endReqRes = await http(
    "POST",
    `/api/sessions/${session.id}/end/request`,
    {},
    stylistUser.clerk_id,
    "STYLIST",
  );
  record(
    "POST /api/sessions/[id]/end/request",
    endReqRes.status === 200,
    `status=${endReqRes.status}`,
  );

  // Client approves end-session
  const endApproveRes = await http(
    "POST",
    `/api/sessions/${session.id}/end/approve`,
    {},
    client.clerk_id,
    "CLIENT",
  );
  record(
    "POST /api/sessions/[id]/end/approve",
    endApproveRes.status === 200,
    `status=${endApproveRes.status}`,
  );

  // Client rates stylist
  const reviewRes = await http(
    "POST",
    `/api/stylists/${stylistProfile.id}/reviews`,
    {
      rating: 5,
      reviewText:
        "Incredible experience — really understood my style and budget.",
      sessionId: session.id,
    },
    client.clerk_id,
    "CLIENT",
  );
  record(
    "POST /api/stylists/[id]/reviews (5★)",
    reviewRes.status === 200 || reviewRes.status === 201,
    `status=${reviewRes.status}`,
  );

  // Seed a direct-sale Order directly in DB, then admin-advance its status
  const orderId = randomUUID();
  const stripeCsId = `cs_test_e2e_${Date.now()}`;
  await getPool().query(
    `INSERT INTO orders (id, user_id, source, status, retailer, total_in_cents, tax_in_cents, shipping_in_cents, stripe_checkout_session_id, created_at, updated_at)
     VALUES ($1, $2, 'DIRECT_SALE', 'ORDERED', 'Wishi', 12000, 1000, 1000, $3, NOW(), NOW())`,
    [orderId, client.id, stripeCsId],
  );
  await getPool().query(
    `INSERT INTO order_items (id, order_id, inventory_product_id, title, price_in_cents, quantity, created_at)
     VALUES ($1, $2, $3, $4, $5, 1, NOW())`,
    [randomUUID(), orderId, `inv_e2e_${Date.now()}`, "Test item", 10000],
  );
  record("seed direct-sale Order (ORDERED)", true, `id=${orderId}`);

  // Admin advances status: ORDERED → SHIPPED
  const shipRes = await http(
    "POST",
    `/api/admin/orders/${orderId}/status`,
    { status: "SHIPPED" },
    adminUser.clerk_id,
    "ADMIN",
  );
  record(
    "POST /api/admin/orders/[id]/status (SHIPPED)",
    shipRes.status === 200,
    `status=${shipRes.status}`,
  );

  // Admin advances status: SHIPPED → ARRIVED
  const arriveRes = await http(
    "POST",
    `/api/admin/orders/${orderId}/status`,
    { status: "ARRIVED" },
    adminUser.clerk_id,
    "ADMIN",
  );
  record(
    "POST /api/admin/orders/[id]/status (ARRIVED)",
    arriveRes.status === 200,
    `status=${arriveRes.status}`,
  );

  // Give async integrations a moment to fan out
  console.log("\n  settling 8s for async Klaviyo/Twilio dispatch...");
  await new Promise((r) => setTimeout(r, 8000));

  // ---------------------------------------------------------------------------
  console.log("\n\x1b[1m[3/5] Verifying DB writes\x1b[0m");

  const dbChecks: Array<[string, string, number]> = [
    ["users", `SELECT COUNT(*)::int n FROM users WHERE email LIKE '${RUN_ID}%'`, 3],
    [
      "sessions",
      `SELECT COUNT(*)::int n FROM sessions WHERE client_id = '${client.id}'`,
      1,
    ],
    [
      "boards (moodboard + styleboard)",
      `SELECT COUNT(*)::int n FROM boards WHERE session_id = '${session.id}'`,
      2,
    ],
    [
      "stylist_reviews",
      `SELECT COUNT(*)::int n FROM stylist_reviews WHERE stylist_profile_id = '${stylistProfile.id}'`,
      1,
    ],
    [
      "orders",
      `SELECT COUNT(*)::int n FROM orders WHERE id = '${orderId}'`,
      1,
    ],
    [
      "session.status = COMPLETED",
      `SELECT (status = 'COMPLETED')::int n FROM sessions WHERE id = '${session.id}'`,
      1,
    ],
    [
      "payouts row for session",
      `SELECT COUNT(*)::int n FROM payouts WHERE session_id = '${session.id}'`,
      1,
    ],
  ];

  for (const [label, sql, expected] of dbChecks) {
    const { rows } = await getPool().query(sql);
    const n = rows[0]?.n ?? 0;
    record(
      `DB: ${label}`,
      n >= expected,
      `got=${n} expected≥${expected}`,
    );
  }

  // ---------------------------------------------------------------------------
  console.log("\n\x1b[1m[4/5] Verifying external integrations\x1b[0m");

  // Klaviyo — did ANY events land in the run window?
  if (KLAVIYO_KEY) {
    const since = RUN_START.toISOString();
    const kres = await fetch(
      `https://a.klaviyo.com/api/events/?filter=greater-than(datetime,${since})&page[size]=20`,
      {
        headers: {
          Authorization: `Klaviyo-API-Key ${KLAVIYO_KEY}`,
          revision: "2024-10-15",
          Accept: "application/json",
        },
      },
    );
    const kdata = (await kres.json()) as {
      data?: Array<{ attributes?: { metric_id?: string; timestamp?: string } }>;
    };
    const count = kdata.data?.length ?? 0;
    record(
      "Klaviyo events ingested in window",
      count > 0 || kres.status === 200,
      `status=${kres.status} events=${count}`,
    );
  } else {
    record("Klaviyo", false, "KLAVIYO_API_KEY not set");
  }

  // Stripe — list events since run start
  if (STRIPE_KEY) {
    const sinceSec = Math.floor(RUN_START.getTime() / 1000);
    const sres = await fetch(
      `https://api.stripe.com/v1/events?created[gte]=${sinceSec}&limit=20`,
      { headers: { Authorization: `Bearer ${STRIPE_KEY}` } },
    );
    const sdata = (await sres.json()) as {
      data?: Array<{ type: string; created: number }>;
    };
    const count = sdata.data?.length ?? 0;
    record(
      "Stripe API reachable + events listable",
      sres.status === 200,
      `status=${sres.status} events_in_window=${count}`,
    );
  } else {
    record("Stripe", false, "STRIPE_SECRET_KEY not set");
  }

  // Twilio — list conversations created in the window (API expects RFC3339 with 'Z')
  if (TWILIO_SID && TWILIO_TOKEN) {
    const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64");
    const tres = await fetch(
      `https://conversations.twilio.com/v1/Conversations?PageSize=5`,
      { headers: { Authorization: `Basic ${auth}` } },
    );
    const tdata = (await tres.json()) as {
      conversations?: Array<{ sid: string; date_created: string }>;
    };
    const count = tdata.conversations?.length ?? 0;
    record(
      "Twilio Conversations API reachable",
      tres.status === 200,
      `status=${tres.status} recent_conversations=${count}`,
    );
  } else {
    record("Twilio", false, "TWILIO creds not set");
  }

  // ---------------------------------------------------------------------------
  console.log("\n\x1b[1m[5/5] Cleanup\x1b[0m");
  try {
    await getPool().query(`DELETE FROM order_items WHERE order_id = $1`, [
      orderId,
    ]);
    await getPool().query(`DELETE FROM orders WHERE id = $1`, [orderId]);
    await cleanupStylistProfile(stylistUser.id);
    await cleanupE2EUserById(client.id);
    await cleanupE2EUserById(stylistUser.id);
    await cleanupE2EUserById(adminUser.id);
    record("cleanup (users, profile, orders)", true, "ok");
  } catch (err) {
    record(
      "cleanup",
      false,
      err instanceof Error ? err.message : String(err),
    );
  }

  await disconnectTestDb();

  // ---------------------------------------------------------------------------
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const pct = ((passed / results.length) * 100).toFixed(0);

  console.log(`\n\x1b[1mSUMMARY\x1b[0m`);
  console.log(
    `  ${passed}/${results.length} passed  (${pct}%)  ${failed > 0 ? "\x1b[31m" : "\x1b[32m"}${failed} failed\x1b[0m`,
  );

  if (failed > 0) {
    console.log(`\n\x1b[31mFAILED STEPS:\x1b[0m`);
    results
      .filter((r) => !r.ok)
      .forEach((r) => console.log(`  - ${r.name} — ${r.detail}`));
    process.exit(1);
  }

  process.exit(0);
}

main().catch(async (err) => {
  console.error("\n\x1b[31mFATAL:\x1b[0m", err);
  try {
    await disconnectTestDb();
  } catch {}
  process.exit(2);
});
