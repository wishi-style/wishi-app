/**
 * End-to-end walkthrough of the Phase 12 stylist surfaces.
 *
 * Focused on the authoring surfaces introduced in PR #58 that aren't
 * exercised by `scripts/e2e-full-walkthrough.ts`:
 *
 *  - Dashboard queue fetch (GET /stylist/dashboard)
 *  - Workspace render (GET /stylist/sessions/:id/workspace)
 *  - ClientProfileView resolver (GET /api/stylist/clients/:id/profile)
 *  - StylistPrivateNote PUT/GET
 *  - LookCreator canvas items with x/y/zIndex + flip/crop
 *  - Styleboard send gate (<3 items → 400)
 *  - Inventory favorites POST/DELETE
 *  - Previous looks aggregation
 *  - Dashboard right-rail GET /api/sessions/:id/messages
 *
 * Run: `npm run dev:e2e` in one terminal, then:
 *   npx tsx --env-file=.env scripts/e2e-stylist-walkthrough.ts
 */

import { randomUUID } from "node:crypto";
import {
  cleanupE2EUserById,
  cleanupStylistProfile,
  createSessionForClient,
  disconnectTestDb,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
} from "../tests/e2e/db";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3001";
const CLERK_E2E_COOKIE = "wishi_e2e_clerk_id";
const ROLE_E2E_COOKIE = "wishi_e2e_role";

type StepResult = { name: string; ok: boolean; detail: string };
const results: StepResult[] = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  const mark = ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
  console.log(`  ${mark} ${name}  ${detail}`);
}

function authHeaders(clerkId: string, role: "STYLIST" | "CLIENT" | "ADMIN") {
  return {
    "Content-Type": "application/json",
    Cookie: `${CLERK_E2E_COOKIE}=${clerkId}; ${ROLE_E2E_COOKIE}=${role}`,
  };
}

async function get(url: string, headers: Record<string, string>) {
  const res = await fetch(`${BASE}${url}`, { headers });
  return res;
}
async function request(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  headers: Record<string, string>,
  body?: unknown,
) {
  return fetch(`${BASE}${url}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function main() {
  const ts = Date.now();
  const clientEmail = `phase12-walk-client-${ts}@e2e.wishi.test`;
  const stylistEmail = `phase12-walk-stylist-${ts}@e2e.wishi.test`;
  const clientClerkId = `e2e_phase12_walk_c_${ts}`;
  const stylistClerkId = `e2e_phase12_walk_s_${ts}`;

  const client = await ensureClientUser({
    clerkId: clientClerkId,
    email: clientEmail,
    firstName: "Phase12",
    lastName: "Client",
  });
  const stylist = await ensureStylistUser({
    clerkId: stylistClerkId,
    email: stylistEmail,
    firstName: "Phase12",
    lastName: "Stylist",
  });
  const stylistProfile = await ensureStylistProfile({ userId: stylist.id });
  const session = await createSessionForClient({
    clientId: client.id,
    stylistId: stylist.id,
    status: "ACTIVE",
    planType: "MAJOR",
  });
  await getPool().query(
    `UPDATE sessions SET twilio_channel_sid = $1 WHERE id = $2`,
    [`CH_e2e_phase12_walk_${ts}`, session.id],
  );

  const stylistAuth = authHeaders(stylistClerkId, "STYLIST");

  try {
    console.log("\n▸ Dashboard + workspace page loads");
    {
      const r = await get("/stylist/dashboard", stylistAuth);
      record("GET /stylist/dashboard", r.ok, `HTTP ${r.status}`);
    }
    {
      const r = await get(
        `/stylist/sessions/${session.id}/workspace`,
        stylistAuth,
      );
      record(
        `GET /stylist/sessions/${session.id}/workspace`,
        r.ok,
        `HTTP ${r.status}`,
      );
    }

    console.log("\n▸ ClientProfileView resolver");
    {
      const r = await get(
        `/api/stylist/clients/${client.id}/profile`,
        stylistAuth,
      );
      const body = (await r.json()) as {
        profile?: { fullName?: string; totalSessions?: number };
      };
      record(
        `GET /api/stylist/clients/${client.id}/profile`,
        r.ok && body.profile?.fullName === "Phase12 Client",
        `fullName=${body.profile?.fullName}, totalSessions=${body.profile?.totalSessions}`,
      );
    }

    console.log("\n▸ StylistPrivateNote PUT + GET");
    {
      const noteBody = `Walkthrough note ${ts}`;
      const putRes = await request(
        "PUT",
        `/api/stylist/clients/${client.id}/note`,
        stylistAuth,
        { body: noteBody },
      );
      const getRes = await get(
        `/api/stylist/clients/${client.id}/note`,
        stylistAuth,
      );
      const getBody = (await getRes.json()) as { body?: string };
      record(
        "PUT + GET stylist private note round-trip",
        putRes.ok && getBody.body === noteBody,
        `body=${getBody.body}`,
      );
    }

    console.log("\n▸ LookCreator canvas styleboard");
    const boardId = randomUUID();
    await getPool().query(
      `INSERT INTO boards (id, type, session_id, stylist_profile_id, is_revision, created_at, updated_at)
       VALUES ($1, 'STYLEBOARD', $2, $3, false, NOW(), NOW())`,
      [boardId, session.id, stylistProfile.id],
    );
    {
      const drops = [
        { url: "https://example.com/item-a", x: 30, y: 40, zIndex: 1 },
        { url: "https://example.com/item-b", x: 60, y: 55, zIndex: 2 },
      ];
      let okCount = 0;
      for (const d of drops) {
        const r = await request(
          "POST",
          `/api/styleboards/${boardId}/items`,
          stylistAuth,
          {
            source: "WEB_ADDED",
            webItemUrl: d.url,
            x: d.x,
            y: d.y,
            zIndex: d.zIndex,
          },
        );
        if (r.ok) okCount++;
      }
      record("POST /items (x/y/zIndex)", okCount === drops.length, `${okCount}/${drops.length} ok`);

      // PATCH flip + crop
      const firstItem = await getPool().query(
        `SELECT id FROM board_items WHERE board_id = $1 ORDER BY order_index ASC LIMIT 1`,
        [boardId],
      );
      const firstId = firstItem.rows[0]?.id as string | undefined;
      if (firstId) {
        const r = await request(
          "PATCH",
          `/api/styleboards/${boardId}/items/${firstId}`,
          stylistAuth,
          { flipH: true, cropTop: 10, cropBottom: 10 },
        );
        const row = await getPool().query(
          `SELECT flip_h, crop_top, crop_bottom FROM board_items WHERE id = $1`,
          [firstId],
        );
        record(
          "PATCH /items (flip + crop)",
          r.ok &&
            row.rows[0].flip_h === true &&
            Number(row.rows[0].crop_top) === 10,
          `flip_h=${row.rows[0].flip_h}, crop_top=${row.rows[0].crop_top}`,
        );
      }

      // Send gate: <3 items → 400
      const sendRes = await request(
        "POST",
        `/api/styleboards/${boardId}/send`,
        stylistAuth,
        {
          title: "Walkthrough look",
          description: "Walkthrough description",
          tags: ["walk"],
        },
      );
      record(
        "POST /send rejects <3 items",
        sendRes.status === 400,
        `HTTP ${sendRes.status}`,
      );
    }

    console.log("\n▸ Inventory favorites POST + DELETE");
    {
      const productId = `walkthrough-product-${ts}`;
      const post = await request(
        "POST",
        "/api/favorites/items",
        stylistAuth,
        { inventoryProductId: productId },
      );
      const del = await request(
        "DELETE",
        `/api/favorites/items?inventoryProductId=${encodeURIComponent(productId)}`,
        stylistAuth,
      );
      record(
        "favorites POST + DELETE round-trip",
        post.ok && del.ok,
        `POST=${post.status} DELETE=${del.status}`,
      );
    }

    console.log("\n▸ Previous looks aggregation");
    {
      const r = await get(
        `/api/stylist/previous-looks?clientId=${client.id}`,
        stylistAuth,
      );
      const body = (await r.json()) as { items?: unknown[] };
      record(
        `GET /api/stylist/previous-looks`,
        r.ok && Array.isArray(body.items),
        `items=${body.items?.length ?? "?"} (draft styleboard not sent, so expect 0)`,
      );
    }

    console.log("\n▸ Dashboard right-rail message fetch");
    {
      const r = await get(
        `/api/sessions/${session.id}/messages?limit=10`,
        stylistAuth,
      );
      const body = (await r.json()) as { messages?: unknown[] };
      record(
        `GET /api/sessions/${session.id}/messages`,
        r.ok && Array.isArray(body.messages),
        `messages=${body.messages?.length ?? "?"}`,
      );
    }

    console.log("\n▸ Cleanup");
    await getPool().query(`DELETE FROM board_items WHERE board_id = $1`, [
      boardId,
    ]);
    await getPool().query(`DELETE FROM boards WHERE id = $1`, [boardId]);
    await cleanupStylistProfile(stylist.id);
    await cleanupE2EUserById(client.id);
    await cleanupE2EUserById(stylist.id);
  } finally {
    await disconnectTestDb();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n── Summary: ${results.length - failed.length}/${results.length} ok`,
  );
  if (failed.length > 0) {
    for (const f of failed) console.log(`  ✗ ${f.name} — ${f.detail}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
