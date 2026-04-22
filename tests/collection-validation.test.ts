import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCollectionName,
  COLLECTION_NAME_MAX,
} from "@/lib/collections/collection.service";

test("rejects empty / whitespace-only names", () => {
  assert.throws(() => validateCollectionName(""));
  assert.throws(() => validateCollectionName("   "));
});

test("enforces max length", () => {
  assert.throws(() => validateCollectionName("x".repeat(COLLECTION_NAME_MAX + 1)));
  assert.doesNotThrow(() => validateCollectionName("x".repeat(COLLECTION_NAME_MAX)));
});

test("trims surrounding whitespace", () => {
  assert.equal(validateCollectionName("  Spring Capsule  "), "Spring Capsule");
});
