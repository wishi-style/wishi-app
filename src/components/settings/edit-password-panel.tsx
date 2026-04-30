"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function EditPasswordPanel() {
  const { user, isLoaded } = useUser();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  if (!isLoaded) {
    return (
      <p className="font-body text-sm text-muted-foreground">Loading…</p>
    );
  }

  if (!user?.passwordEnabled) {
    return (
      <p className="font-body text-sm text-muted-foreground">
        You signed in with a social provider — manage your password through
        that provider&apos;s account settings.
      </p>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    if (next !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      await user!.updatePassword({
        newPassword: next,
        currentPassword: current,
        signOutOfOtherSessions: true,
      });
      toast.success("Password updated");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not update password";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-4">
      <div>
        <Label htmlFor="current-password" className="font-body text-xs">
          Current Password
        </Label>
        <Input
          id="current-password"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="new-password" className="font-body text-xs">
          New Password
        </Label>
        <Input
          id="new-password"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          required
          minLength={8}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="confirm-password" className="font-body text-xs">
          Confirm New Password
        </Label>
        <Input
          id="confirm-password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
          minLength={8}
          className="mt-1"
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-foreground px-6 py-2.5 font-body text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:opacity-60"
      >
        {busy ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
