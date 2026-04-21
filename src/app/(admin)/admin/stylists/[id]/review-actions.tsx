"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function StylistReviewActions({
  stylistUserId,
  matchEligible,
  waitlistCount,
}: {
  stylistUserId: string;
  matchEligible: boolean;
  waitlistCount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState("");

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Match eligibility</CardTitle>
        <CardDescription>
          {matchEligible
            ? "This stylist is already match-eligible."
            : waitlistCount > 0
              ? `${waitlistCount} client${waitlistCount === 1 ? "" : "s"} waiting.`
              : "No clients waiting."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!matchEligible && (
          <Button
            disabled={pending !== null}
            onClick={() => {
              if (
                !confirm(
                  "Approve this stylist as match-eligible? Waitlisted clients will be notified.",
                )
              )
                return;
              post(
                `/api/admin/stylists/${stylistUserId}/approve`,
                {},
                "approve",
              );
            }}
          >
            {pending === "approve" ? "…" : "Approve match-eligibility"}
          </Button>
        )}

        <div className="space-y-2 border-t border-border pt-4">
          <Label>Request changes</Label>
          <Textarea
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder="Explain what the stylist needs to change. Saved as an internal note."
          />
          <Button
            variant="outline"
            disabled={pending !== null || noteContent.trim().length === 0}
            onClick={async () => {
              await post(
                `/api/admin/users/${stylistUserId}/notes`,
                { content: noteContent.trim() },
                "note",
              );
              setNoteContent("");
            }}
          >
            {pending === "note" ? "…" : "Save note"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
