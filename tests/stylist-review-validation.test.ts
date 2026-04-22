import assert from "node:assert/strict";
import test from "node:test";
import {
  validateReviewInput,
  REVIEW_TEXT_MIN,
  REVIEW_TEXT_MAX,
} from "@/lib/stylists/review.service";

test("rejects non-integer rating", () => {
  assert.throws(() => validateReviewInput({ rating: 4.5, reviewText: "Great!" }));
  assert.throws(() => validateReviewInput({ rating: NaN, reviewText: "Great!" }));
});

test("rejects rating outside 1–5", () => {
  assert.throws(() => validateReviewInput({ rating: 0, reviewText: "Great!" }));
  assert.throws(() => validateReviewInput({ rating: 6, reviewText: "Great!" }));
  assert.throws(() => validateReviewInput({ rating: -1, reviewText: "Great!" }));
});

test("accepts integer ratings 1 through 5", () => {
  for (const r of [1, 2, 3, 4, 5]) {
    assert.doesNotThrow(() =>
      validateReviewInput({ rating: r, reviewText: "loved it" }),
    );
  }
});

test("rejects too-short text (after trim)", () => {
  assert.throws(() => validateReviewInput({ rating: 5, reviewText: "" }));
  assert.throws(() => validateReviewInput({ rating: 5, reviewText: "ok" }));
  assert.throws(() => validateReviewInput({ rating: 5, reviewText: "    " }));
});

test("rejects too-long text", () => {
  assert.throws(() =>
    validateReviewInput({
      rating: 5,
      reviewText: "a".repeat(REVIEW_TEXT_MAX + 1),
    }),
  );
});

test("returns trimmed text on success", () => {
  const out = validateReviewInput({
    rating: 5,
    reviewText: "  hello there  ",
  });
  assert.equal(out, "hello there");
});

test("accepts text exactly at the boundaries", () => {
  assert.equal(REVIEW_TEXT_MIN, 5);
  assert.doesNotThrow(() =>
    validateReviewInput({ rating: 3, reviewText: "x".repeat(REVIEW_TEXT_MIN) }),
  );
  assert.doesNotThrow(() =>
    validateReviewInput({ rating: 3, reviewText: "x".repeat(REVIEW_TEXT_MAX) }),
  );
});
