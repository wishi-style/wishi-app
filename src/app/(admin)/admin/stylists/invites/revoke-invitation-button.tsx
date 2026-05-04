"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RevokeInvitationButton({
  invitationId,
  emailAddress,
}: {
  invitationId: string;
  emailAddress: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function revoke() {
    if (!confirm(`Revoke invitation for ${emailAddress}?`)) return;
    setPending(true);
    try {
      const res = await fetch(
        `/api/admin/stylists/invitations/${invitationId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        alert(body.error ?? "Revoke failed");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={revoke}
      disabled={pending}
      data-testid={`revoke-${invitationId}`}
    >
      {pending ? "Revoking…" : "Revoke"}
    </Button>
  );
}
