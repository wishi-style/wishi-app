import assert from "node:assert/strict";
import test from "node:test";
import { formatRelative } from "../src/lib/notifications/format";

test("formatRelative bucket boundaries", () => {
  const now = new Date("2026-05-13T12:00:00Z");
  assert.equal(formatRelative(new Date("2026-05-13T11:59:30Z"), now), "just now");
  assert.equal(formatRelative(new Date("2026-05-13T11:48:00Z"), now), "12m ago");
  assert.equal(formatRelative(new Date("2026-05-13T11:00:00Z"), now), "1h ago");
  assert.equal(formatRelative(new Date("2026-05-12T12:00:00Z"), now), "1d ago");
  assert.equal(formatRelative(new Date("2026-05-06T12:00:00Z"), now), "May 6");
});
