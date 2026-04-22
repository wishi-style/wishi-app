// Integration test for src/lib/stylists/favorite-stylist.service.ts.

import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import {
  cleanupE2EUserByEmail,
  cleanupStylistProfile,
  ensureClientUser,
  ensureStylistProfile,
  ensureStylistUser,
  getPool,
} from "./e2e/db";
import {
  favoriteStylist,
  isStylistFavorited,
  listFavoriteStylists,
  unfavoriteStylist,
} from "@/lib/stylists/favorite-stylist.service";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanups.length) {
    const fn = cleanups.pop();
    if (fn) await fn();
  }
});

async function setupClientAndStylist() {
  const suffix = randomUUID().slice(0, 8);
  const clientEmail = `fav-client-${suffix}@example.com`;
  const stylistEmail = `fav-stylist-${suffix}@example.com`;
  const client = await ensureClientUser({
    clerkId: `fav-client-${suffix}`,
    email: clientEmail,
    firstName: "Fav",
    lastName: "Client",
  });
  const stylistUser = await ensureStylistUser({
    clerkId: `fav-stylist-${suffix}`,
    email: stylistEmail,
    firstName: "Fav",
    lastName: "Stylist",
  });
  const profile = await ensureStylistProfile({ userId: stylistUser.id });

  cleanups.push(async () => {
    await cleanupStylistProfile(stylistUser.id);
    await cleanupE2EUserByEmail(stylistEmail);
    await cleanupE2EUserByEmail(clientEmail);
  });

  return { client, stylistUser, profile };
}

test("favoriteStylist + unfavoriteStylist round-trip persists across calls", async () => {
  const { client, profile } = await setupClientAndStylist();

  assert.equal(await isStylistFavorited(client.id, profile.id), false);

  const fav = await favoriteStylist(client.id, profile.id);
  assert.equal(fav.userId, client.id);
  assert.equal(fav.stylistProfileId, profile.id);
  assert.equal(await isStylistFavorited(client.id, profile.id), true);

  // Idempotent — calling favorite twice returns the same row, doesn't throw.
  const again = await favoriteStylist(client.id, profile.id);
  assert.equal(again.id, fav.id);

  const removed = await unfavoriteStylist(client.id, profile.id);
  assert.equal(removed, 1);
  assert.equal(await isStylistFavorited(client.id, profile.id), false);

  // Unfavorite again is a no-op.
  const removedAgain = await unfavoriteStylist(client.id, profile.id);
  assert.equal(removedAgain, 0);
});

test("listFavoriteStylists returns joined stylist profile + name", async () => {
  const { client, profile } = await setupClientAndStylist();
  await favoriteStylist(client.id, profile.id);

  const list = await listFavoriteStylists(client.id);
  assert.equal(list.length, 1);
  assert.equal(list[0].stylistProfileId, profile.id);
  assert.equal(list[0].stylist.name, "Fav Stylist");
  assert.equal(list[0].stylist.isAvailable, true);
});
