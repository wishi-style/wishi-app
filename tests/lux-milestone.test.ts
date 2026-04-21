// Integration test for the Lux-milestone payout hook in
// src/lib/boards/styleboard.service.ts `sendStyleboard`. We don't drive the
// full Twilio/chat path — instead we simulate reaching "look 3" by manually
// setting styleboardsSent and calling dispatchPayout directly with the
// milestone trigger. The real sendStyleboard hook just wraps this call.
//
// This verifies the schema/wiring invariant the hook relies on:
//   - `@@unique([sessionId, trigger])` prevents duplicate LUX_THIRD_LOOK rows
//   - a second dispatchPayout for the same (sessionId, LUX_THIRD_LOOK) is a no-op

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import {
  cleanupE2EUserByEmail,
  ensureClientUser,
  ensureStylistUser,
  ensureStylistProfile,
  createSessionForClient,
  getPool,
} from "./e2e/db";

let client: { id: string };
let stylist: { id: string };

afterEach(async () => {
  if (client?.id) {
    await getPool().query(
      "DELETE FROM payouts WHERE session_id IN (SELECT id FROM sessions WHERE client_id = $1)",
      [client.id]
    );
    await cleanupE2EUserByEmail(`lux-client-${client.id}@example.com`);
  }
  if (stylist?.id) {
    await getPool().query("DELETE FROM stylist_profiles WHERE user_id = $1", [stylist.id]);
    await cleanupE2EUserByEmail(`lux-stylist-${stylist.id}@example.com`);
  }
});

test("Lux milestone: first call writes a row, second call is idempotent", async () => {
  const suffix = randomUUID().slice(0, 8);
  client = await ensureClientUser({
    clerkId: `lux_c_${suffix}`,
    email: `lux-client-${suffix}@example.com`,
    firstName: "Lux",
    lastName: "Client",
  });
  stylist = await ensureStylistUser({
    clerkId: `lux_s_${suffix}`,
    email: `lux-stylist-${suffix}@example.com`,
    firstName: "Lux",
    lastName: "Stylist",
  });
  await ensureStylistProfile({ userId: stylist.id });
  await getPool().query(
    `UPDATE stylist_profiles SET stylist_type = 'PLATFORM', stripe_connect_id = 'acct_lux_test', payouts_enabled = true WHERE user_id = $1`,
    [stylist.id]
  );

  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    planType: "LUX",
    status: "ACTIVE",
    amountPaidInCents: 55000,
  });
  await getPool().query("UPDATE sessions SET styleboards_sent = 3 WHERE id = $1", [session.id]);

  const { dispatchPayout } = await import("@/lib/payouts/dispatch.service");
  const first = await dispatchPayout({
    sessionId: session.id,
    trigger: "LUX_THIRD_LOOK",
    deps: { createTransfer: async () => ({ id: "tr_lux_3" }) as never },
  });
  const second = await dispatchPayout({
    sessionId: session.id,
    trigger: "LUX_THIRD_LOOK",
    deps: { createTransfer: async () => ({ id: "tr_lux_3_dup" }) as never },
  });

  assert.equal(first.status, "CREATED");
  assert.deepEqual(second, { status: "SKIPPED", reason: "idempotent" });

  const { rows } = await getPool().query(
    "SELECT amount_in_cents, status, stripe_transfer_id FROM payouts WHERE session_id = $1 AND trigger = 'LUX_THIRD_LOOK'",
    [session.id]
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount_in_cents, 13500);
  assert.equal(rows[0].status, "PROCESSING");
  assert.equal(rows[0].stripe_transfer_id, "tr_lux_3");
});
