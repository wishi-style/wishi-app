"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export function ImpersonationBanner({ username }: { username?: string }) {
  const router = useRouter();
  const [ending, setEnding] = useState(false);

  async function endImpersonation() {
    setEnding(true);
    await fetch("/api/admin/impersonation/end", { method: "POST" });
    router.push("/admin/dashboard");
    router.refresh();
  }

  return (
    <div className="flex items-center justify-between gap-4 border-b border-amber-500/40 bg-amber-500/10 px-6 py-2 text-sm text-amber-900 dark:text-amber-200">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4" />
        <span>
          You are impersonating {username ? <strong>{username}</strong> : "a user"}.
          Destructive actions are blocked.
        </span>
      </div>
      <Button size="sm" variant="outline" onClick={endImpersonation} disabled={ending}>
        {ending ? "Ending…" : "End session"}
      </Button>
    </div>
  );
}
