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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SessionStatus, StylistType } from "@/generated/prisma/client";

type Candidate = {
  userId: string;
  stylistType: StylistType;
  name: string;
  email: string;
};

export function SessionActions({
  sessionId,
  status,
  candidates,
}: {
  sessionId: string;
  status: SessionStatus;
  candidates: Candidate[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [reassignId, setReassignId] = useState<string>("");
  const [reassignReason, setReassignReason] = useState("");
  const [freezeReason, setFreezeReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  async function post(path: string, body: unknown, label: string) {
    setPending(label);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        alert(err.error ?? "Action failed");
        return;
      }
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  const canReassign = ["BOOKED", "ACTIVE", "PENDING_END", "FROZEN"].includes(status);
  const canFreeze = ["ACTIVE", "PENDING_END"].includes(status);
  const canUnfreeze = status === "FROZEN";
  const canCancel = !["COMPLETED", "CANCELLED"].includes(status);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Admin actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {canReassign && (
          <div className="space-y-2">
            <Label>Reassign stylist</Label>
            <Select
              value={reassignId}
              onValueChange={(v) => setReassignId(v ?? "")}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a candidate…" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((c) => (
                  <SelectItem key={c.userId} value={c.userId}>
                    {c.name} · {c.stylistType}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={reassignReason}
              onChange={(e) => setReassignReason(e.target.value)}
              placeholder="Reason (visible in match history)"
            />
            <Button
              disabled={
                pending !== null ||
                !reassignId ||
                reassignReason.trim().length === 0
              }
              onClick={() =>
                post(
                  `/api/admin/sessions/${sessionId}/reassign`,
                  { newStylistUserId: reassignId, reason: reassignReason.trim() },
                  "reassign",
                )
              }
            >
              {pending === "reassign" ? "…" : "Reassign"}
            </Button>
          </div>
        )}

        {canFreeze && (
          <div className="space-y-2 border-t border-border pt-4">
            <Label>Freeze</Label>
            <Input
              value={freezeReason}
              onChange={(e) => setFreezeReason(e.target.value)}
              placeholder="Freeze reason"
            />
            <Button
              variant="outline"
              disabled={pending !== null || freezeReason.trim().length === 0}
              onClick={() =>
                post(
                  `/api/admin/sessions/${sessionId}/freeze`,
                  { reason: freezeReason.trim() },
                  "freeze",
                )
              }
            >
              {pending === "freeze" ? "…" : "Freeze"}
            </Button>
          </div>
        )}

        {canUnfreeze && (
          <div className="border-t border-border pt-4">
            <Button
              variant="outline"
              disabled={pending !== null}
              onClick={() =>
                post(`/api/admin/sessions/${sessionId}/unfreeze`, {}, "unfreeze")
              }
            >
              {pending === "unfreeze" ? "…" : "Unfreeze"}
            </Button>
          </div>
        )}

        {canCancel && (
          <div className="space-y-2 border-t border-border pt-4">
            <Label>Cancel</Label>
            <Input
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Cancellation reason (stored in audit log)"
            />
            <Button
              variant="destructive"
              disabled={pending !== null || cancelReason.trim().length === 0}
              onClick={() => {
                if (
                  !confirm(
                    `Cancel session? This cannot be undone. Reason: "${cancelReason.trim()}"`,
                  )
                )
                  return;
                post(
                  `/api/admin/sessions/${sessionId}/cancel`,
                  { reason: cancelReason.trim() },
                  "cancel",
                );
              }}
            >
              {pending === "cancel" ? "…" : "Cancel session"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
