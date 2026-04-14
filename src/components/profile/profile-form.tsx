"use client";

import { useActionState } from "react";
import { updateProfile } from "@/app/(client)/settings/actions";
import { AvatarUpload } from "./avatar-upload";

type ProfileFormProps = {
  user: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    avatarUrl: string | null;
  };
};

export function ProfileForm({ user }: ProfileFormProps) {
  const [, formAction, pending] = useActionState(
    async (_prev: unknown, formData: FormData) => {
      await updateProfile(formData);
      return { success: true };
    },
    null,
  );

  return (
    <div className="space-y-8">
      <AvatarUpload currentUrl={user.avatarUrl} />

      <form action={formAction} className="space-y-6">
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="space-y-2">
            <label
              htmlFor="firstName"
              className="text-sm font-medium text-foreground"
            >
              First name
            </label>
            <input
              id="firstName"
              name="firstName"
              type="text"
              defaultValue={user.firstName}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="lastName"
              className="text-sm font-medium text-foreground"
            >
              Last name
            </label>
            <input
              id="lastName"
              name="lastName"
              type="text"
              defaultValue={user.lastName}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="email"
            className="text-sm font-medium text-foreground"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={user.email}
            disabled
            className="w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground"
          />
          <p className="text-xs text-muted-foreground">
            Email is managed by your sign-in provider.
          </p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="phone"
            className="text-sm font-medium text-foreground"
          >
            Phone (optional)
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={user.phone ?? ""}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save changes"}
        </button>
      </form>
    </div>
  );
}
