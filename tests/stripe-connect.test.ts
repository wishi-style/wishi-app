import assert from "node:assert/strict";
import test from "node:test";
import { accountIsPayoutReady } from "@/lib/stripe-connect";

test("accountIsPayoutReady requires both charges_enabled and payouts_enabled", () => {
  assert.equal(
    accountIsPayoutReady({ charges_enabled: true, payouts_enabled: true } as never),
    true
  );
  assert.equal(
    accountIsPayoutReady({ charges_enabled: true, payouts_enabled: false } as never),
    false
  );
  assert.equal(
    accountIsPayoutReady({ charges_enabled: false, payouts_enabled: true } as never),
    false
  );
  assert.equal(
    accountIsPayoutReady({ charges_enabled: false, payouts_enabled: false } as never),
    false
  );
});
