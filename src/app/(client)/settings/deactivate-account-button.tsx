"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deactivateAccount } from "./deactivate.action";

export function DeactivateAccountButton() {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleConfirm() {
    startTransition(async () => {
      const result = await deactivateAccount();
      if (!result.ok) {
        toast.error("Couldn't deactivate your account. Please contact support.");
        return;
      }
      toast.success("Your account has been deactivated.");
      router.push("/logout");
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-10 font-body text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
      >
        Deactivate account
      </button>

      <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              Deactivate account?
            </AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              Your account will be deactivated and you&apos;ll be signed out. To
              reactivate, contact support.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-body" disabled={pending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="font-body bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              onClick={handleConfirm}
              disabled={pending}
            >
              {pending ? "Deactivating…" : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
