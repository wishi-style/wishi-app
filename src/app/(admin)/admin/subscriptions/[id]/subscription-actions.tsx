"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SubscriptionStatus } from "@/generated/prisma/client";

export function SubscriptionActions({
  subscriptionId,
  status,
  isCancelScheduled,
}: {
  subscriptionId: string;
  status: SubscriptionStatus;
  isCancelScheduled: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function post(action: string) {
    const reasonTrimmed = reason.trim();
    if (!reasonTrimmed) {
      alert("Reason required for admin overrides");
      return;
    }
    setPending(action);
    try {
      const res = await fetch(
        `/api/admin/subscriptions/${subscriptionId}/${action}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ reason: reasonTrimmed }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        alert(err.error ?? "Action failed");
        return;
      }
      setReason("");
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  const canPause = status === "ACTIVE";
  const canCancel = !["CANCELLED", "EXPIRED"].includes(status);
  const canReactivate = status === "PAUSED" || isCancelScheduled;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Admin overrides</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-2">
          <Label>Reason (required, audit logged)</Label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you overriding?"
          />
        </div>
        <div className="flex flex-col gap-2">
          {canPause && (
            <Button
              variant="outline"
              disabled={pending !== null || reason.trim().length === 0}
              onClick={() => post("pause")}
            >
              {pending === "pause" ? "…" : "Pause"}
            </Button>
          )}
          {canReactivate && (
            <Button
              variant="outline"
              disabled={pending !== null || reason.trim().length === 0}
              onClick={() => post("reactivate")}
            >
              {pending === "reactivate" ? "…" : "Reactivate"}
            </Button>
          )}
          {canCancel && (
            <Button
              variant="destructive"
              disabled={pending !== null || reason.trim().length === 0}
              onClick={() => {
                if (!confirm("Cancel subscription at period end?")) return;
                post("cancel");
              }}
            >
              {pending === "cancel" ? "…" : "Cancel at period end"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
