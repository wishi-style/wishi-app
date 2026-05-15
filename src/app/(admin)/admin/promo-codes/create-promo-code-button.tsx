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
import type {
  PromoCodeCreditType,
  PromoCodeDiscountType,
} from "@/generated/prisma/client";

export function CreatePromoCodeButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [code, setCode] = useState("");
  const [creditType, setCreditType] = useState<PromoCodeCreditType>("SESSION");
  const [discountType, setDiscountType] =
    useState<PromoCodeDiscountType>("AMOUNT");
  // For AMOUNT we collect dollars (UI), convert to cents at submit.
  // For PERCENT we collect the integer 1–100 directly.
  const [discountInput, setDiscountInput] = useState("20");
  const [usageLimit, setUsageLimit] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  function reset() {
    setCode("");
    setDiscountType("AMOUNT");
    setDiscountInput("20");
    setUsageLimit("");
    setExpiresAt("");
  }

  async function submit() {
    let discountValue: number;
    if (discountType === "AMOUNT") {
      discountValue = Math.round(Number(discountInput) * 100);
      if (!Number.isInteger(discountValue) || discountValue <= 0) {
        alert("Amount must be a positive number of dollars");
        return;
      }
    } else {
      discountValue = Math.round(Number(discountInput));
      if (!Number.isInteger(discountValue) || discountValue < 1 || discountValue > 100) {
        alert("Percent must be an integer between 1 and 100");
        return;
      }
    }
    setPending(true);
    try {
      const res = await fetch("/api/admin/promo-codes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: code.trim() || undefined,
          creditType,
          discountType,
          discountValue,
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
      reset();
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="discountType">Discount type</Label>
                <Select
                  value={discountType}
                  onValueChange={(v) => {
                    const next = v as PromoCodeDiscountType;
                    setDiscountType(next);
                    setDiscountInput(next === "PERCENT" ? "10" : "20");
                  }}
                >
                  <SelectTrigger id="discountType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AMOUNT">Fixed amount ($)</SelectItem>
                    <SelectItem value="PERCENT">Percentage (%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="discountValue">
                  {discountType === "PERCENT" ? "Percent off" : "Amount (USD)"}
                </Label>
                <Input
                  id="discountValue"
                  type="number"
                  step={discountType === "PERCENT" ? "1" : "0.01"}
                  min={discountType === "PERCENT" ? "1" : undefined}
                  max={discountType === "PERCENT" ? "100" : undefined}
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                />
              </div>
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
