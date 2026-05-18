// Unit tests for the free-form canvas validators added to
// src/lib/boards/styleboard.service.ts. All three are pure — no DB —
// so this file deliberately stays out of the integration tier and
// runs in milliseconds.

import assert from "node:assert/strict";
import test from "node:test";
import {
  normaliseCanvasRotation,
  validateCanvasWidth,
  validateProcessedImageUrl,
} from "@/lib/boards/styleboard.service";

test("validateCanvasWidth passes through values already in [1, 100]", () => {
  assert.equal(validateCanvasWidth(1), 1);
  assert.equal(validateCanvasWidth(26), 26);
  assert.equal(validateCanvasWidth(100), 100);
});

test("validateCanvasWidth treats null/undefined as null", () => {
  assert.equal(validateCanvasWidth(null), null);
  assert.equal(validateCanvasWidth(undefined), null);
});

test("validateCanvasWidth clamps out-of-range values", () => {
  assert.equal(validateCanvasWidth(0), 1);
  assert.equal(validateCanvasWidth(-5), 1);
  assert.equal(validateCanvasWidth(150), 100);
});

test("validateCanvasWidth rejects non-finite values", () => {
  assert.throws(() => validateCanvasWidth(Number.NaN), /finite/);
  assert.throws(() => validateCanvasWidth(Number.POSITIVE_INFINITY), /finite/);
});

test("normaliseCanvasRotation passes through values already in range", () => {
  assert.equal(normaliseCanvasRotation(0), 0);
  assert.equal(normaliseCanvasRotation(45), 45);
  assert.equal(normaliseCanvasRotation(-180), -180);
  assert.equal(normaliseCanvasRotation(180), -180); // 180 normalises to -180
});

test("normaliseCanvasRotation wraps angles outside [-180, 180)", () => {
  assert.equal(normaliseCanvasRotation(270), -90);
  assert.equal(normaliseCanvasRotation(-270), 90);
  assert.equal(normaliseCanvasRotation(720), 0);
  assert.equal(normaliseCanvasRotation(-720), 0);
});

test("normaliseCanvasRotation treats null/undefined as null", () => {
  assert.equal(normaliseCanvasRotation(null), null);
  assert.equal(normaliseCanvasRotation(undefined), null);
});

test("normaliseCanvasRotation rejects non-finite values", () => {
  assert.throws(() => normaliseCanvasRotation(Number.NaN), /finite/);
});

test("validateProcessedImageUrl accepts canonical processed-image paths", () => {
  const ok = "/api/images/boards/processed/board-123/abc-1700000000000.png";
  assert.equal(validateProcessedImageUrl(ok), ok);
  // With boardId set, the URL must contain that same board id segment.
  assert.equal(validateProcessedImageUrl(ok, "board-123"), ok);
});

test("validateProcessedImageUrl rejects URLs from a different board", () => {
  assert.throws(
    () =>
      validateProcessedImageUrl(
        "/api/images/boards/processed/board-123/abc.png",
        "board-other",
      ),
    /belong to the same board/,
  );
});

test("validateProcessedImageUrl treats null/undefined as null", () => {
  assert.equal(validateProcessedImageUrl(null), null);
  assert.equal(validateProcessedImageUrl(undefined), null);
});

test("validateProcessedImageUrl rejects arbitrary URLs", () => {
  assert.throws(
    () => validateProcessedImageUrl("https://evil.example.com/cutout.png"),
    /must start with/,
  );
  assert.throws(
    () => validateProcessedImageUrl("/api/images/avatars/bad.png"),
    /must start with/,
  );
  assert.throws(
    () => validateProcessedImageUrl("javascript:alert(1)"),
    /must start with/,
  );
});
