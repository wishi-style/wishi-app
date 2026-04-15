"use client";

import { useState, useTransition } from "react";
import { signInForE2E } from "./actions";

export function E2ESignInForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await signInForE2E(formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to sign in");
      }
    });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6">
      <div className="w-full rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-2xl font-medium text-stone-900">E2E Sign In</h1>
        <p className="mb-6 text-sm text-stone-500">
          Test-only sign in for browser automation.
        </p>
        <form action={handleSubmit} className="space-y-4">
          <label className="block text-sm font-medium text-stone-700" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full rounded-xl border border-stone-300 px-4 py-3 text-sm text-stone-900 focus:border-black focus:outline-none"
          />
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {isPending ? "Signing in..." : "Sign In"}
          </button>
        </form>
        {error && (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        )}
      </div>
    </div>
  );
}
