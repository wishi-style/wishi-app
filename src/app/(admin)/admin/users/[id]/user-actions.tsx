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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { StylistType, UserRole } from "@/generated/prisma/client";

type ActionUser = {
  id: string;
  role: UserRole;
  stylistProfile: {
    stylistType: StylistType;
    directorPick: string | null;
  } | null;
};

export function UserActions({ user }: { user: ActionUser }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [stylistType, setStylistType] = useState<StylistType>(
    user.stylistProfile?.stylistType ?? "PLATFORM",
  );
  const [directorPick, setDirectorPick] = useState(
    user.stylistProfile?.directorPick ?? "",
  );
  const [noteContent, setNoteContent] = useState("");

  async function post(path: string, body: Record<string, unknown>, label: string) {
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
        <CardTitle>Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!user.stylistProfile ? (
          <div className="space-y-2">
            <Label>Promote to stylist</Label>
            <div className="flex gap-2">
              <Select
                value={stylistType}
                onValueChange={(v) => setStylistType(v as StylistType)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PLATFORM">Platform</SelectItem>
                  <SelectItem value="IN_HOUSE">In-House</SelectItem>
                </SelectContent>
              </Select>
              <Button
                disabled={pending !== null}
                onClick={() =>
                  post(
                    `/api/admin/users/${user.id}/promote`,
                    { stylistType },
                    "promote",
                  )
                }
              >
                {pending === "promote" ? "…" : "Promote"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label>Stylist type</Label>
              <div className="flex gap-2">
                <Select
                  value={stylistType}
                  onValueChange={(v) => setStylistType(v as StylistType)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PLATFORM">Platform</SelectItem>
                    <SelectItem value="IN_HOUSE">In-House</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  disabled={pending !== null}
                  onClick={() =>
                    post(
                      `/api/admin/users/${user.id}/stylist-type`,
                      { stylistType },
                      "stylistType",
                    )
                  }
                >
                  {pending === "stylistType" ? "…" : "Save"}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Director pick copy</Label>
              <Textarea
                value={directorPick}
                onChange={(e) => setDirectorPick(e.target.value)}
                placeholder="Editorial blurb (shown on profile)"
              />
              <Button
                variant="outline"
                disabled={pending !== null}
                onClick={() =>
                  post(
                    `/api/admin/users/${user.id}/director-pick`,
                    { directorPick: directorPick.trim() || null },
                    "directorPick",
                  )
                }
              >
                {pending === "directorPick" ? "…" : "Save director pick"}
              </Button>
            </div>
          </>
        )}

        <div className="space-y-2 border-t border-border pt-4">
          <Label>Add note</Label>
          <Textarea
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder="Internal note — visible to admins only"
          />
          <Button
            variant="outline"
            disabled={pending !== null || noteContent.trim().length === 0}
            onClick={async () => {
              await post(
                `/api/admin/users/${user.id}/notes`,
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
