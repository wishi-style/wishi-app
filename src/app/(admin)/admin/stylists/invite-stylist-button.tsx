"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import type { StylistType } from "@/generated/prisma/client";

export function InviteStylistButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState("");
  const [stylistType, setStylistType] = useState<StylistType>("IN_HOUSE");
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setEmail("");
    setStylistType("IN_HOUSE");
    setError(null);
  }

  async function submit() {
    setError(null);
    if (!email.trim()) {
      setError("Email required");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/admin/stylists/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), stylistType }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        setError(body.error ?? "Invite failed");
        return;
      }
      setOpen(false);
      reset();
      router.push("/admin/stylists/invites");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Invite stylist</Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a stylist</DialogTitle>
            <DialogDescription>
              Sends a Clerk-managed signup invitation. On signup the recipient
              is auto-promoted to STYLIST and lands in the onboarding wizard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="stylist@example.com"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="invite-stylist-type">Stylist type</Label>
              <Select
                value={stylistType}
                onValueChange={(v) => setStylistType(v as StylistType)}
              >
                <SelectTrigger id="invite-stylist-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN_HOUSE">
                    In-house — skips Stripe Connect (step 12)
                  </SelectItem>
                  <SelectItem value="PLATFORM">
                    Platform — full 12-step onboarding incl. Stripe Connect
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error ? (
              <p
                className="text-sm text-destructive"
                role="alert"
                data-testid="invite-error"
              >
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Sending…" : "Send invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
