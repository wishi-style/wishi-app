// Thin wrapper around the Stripe Connect surface. Separate from src/lib/stripe.ts
// so Connect calls (accounts, account links, transfers) are auditable in one place
// and Phase 8/9 admin tooling can mock this module in isolation.

import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";

export type CreateAccountLinkInput = {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
  type?: "account_onboarding" | "account_update";
};

export type CreateTransferInput = {
  destination: string;
  amountCents: number;
  transferGroup?: string;
  description?: string;
  metadata?: Record<string, string>;
  currency?: string;
};

export async function createExpressAccount(params: {
  email?: string;
  stylistProfileId: string;
}): Promise<Stripe.Account> {
  return stripe.accounts.create({
    type: "express",
    capabilities: {
      transfers: { requested: true },
    },
    email: params.email,
    metadata: { stylistProfileId: params.stylistProfileId },
  });
}

export async function createAccountLink(
  input: CreateAccountLinkInput
): Promise<Stripe.AccountLink> {
  return stripe.accountLinks.create({
    account: input.accountId,
    refresh_url: input.refreshUrl,
    return_url: input.returnUrl,
    type: input.type ?? "account_onboarding",
  });
}

export async function retrieveAccount(accountId: string): Promise<Stripe.Account> {
  return stripe.accounts.retrieve(accountId);
}

export async function createTransfer(
  input: CreateTransferInput
): Promise<Stripe.Transfer> {
  return stripe.transfers.create({
    destination: input.destination,
    amount: input.amountCents,
    currency: input.currency ?? "usd",
    transfer_group: input.transferGroup,
    description: input.description,
    metadata: input.metadata,
  });
}

export async function retrieveTransfer(transferId: string): Promise<Stripe.Transfer> {
  return stripe.transfers.retrieve(transferId);
}

// The Stripe event payload for `account.updated` carries the full Account object.
// We flip StylistProfile.payoutsEnabled when both flags are true; downstream
// dispatch.service.ts refuses to ship transfers until this flag is true.
export function accountIsPayoutReady(account: Stripe.Account): boolean {
  return Boolean(account.charges_enabled && account.payouts_enabled);
}
