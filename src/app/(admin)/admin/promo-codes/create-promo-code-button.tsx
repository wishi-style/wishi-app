"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PromoCodeCreditType } from "@/generated/prisma/client";

export function CreatePromoCodeButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [code, setCode] = useState("");
  const [creditType, setCreditType] = useState<PromoCodeCreditType>("SESSION");
  const [amountDollars, setAmountDollars] = useState("20");
  const [usageLimit, setUsageLimit] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  async function submit() {
    const amountInCents = Math.round(Number(amountDollars) * 100);
    if (!Number.isInteger(amountInCents) || amountInCents <= 0) {
      alert("Amount must be a positive number of dollars");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/admin/promo-codes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: code.trim() || undefined,
          creditType,
          amountInCents,
          usageLimit: usageLimit.trim() ? Number(usageLimit) : null,
          expiresAt: expiresAt || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        alert(err.error ?? "Create failed");
        return;
      }
      setOpen(false);
      setCode("");
      setAmountDollars("20");
      setUsageLimit("");
      setExpiresAt("");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Create promo code</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
        <DialogHeader>
          <DialogTitle>New promo code</DialogTitle>
          <DialogDescription>
            SESSION codes sync to Stripe Coupons. SHOPPING codes apply at Wishi checkout only.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="code">Code (leave blank to auto-generate)</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="WELCOME20"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="creditType">Credit type</Label>
            <Select value={creditType} onValueChange={(v) => setCreditType(v as PromoCodeCreditType)}>
              <SelectTrigger id="creditType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SESSION">Session (styling)</SelectItem>
                <SelectItem value="SHOPPING">Shopping (cart)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="amount">Amount (USD)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={amountDollars}
              onChange={(e) => setAmountDollars(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="usageLimit">Usage limit</Label>
              <Input
                id="usageLimit"
                type="number"
                placeholder="unlimited"
                value={usageLimit}
                onChange={(e) => setUsageLimit(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="expiresAt">Expires</Label>
              <Input
                id="expiresAt"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
