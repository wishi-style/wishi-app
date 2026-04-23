"use client";

import { useEffect } from "react";

/**
 * Catches errors thrown in the root `layout.tsx` itself. Must render its
 * own <html><body> because the root layout is broken. Kept minimal — no
 * imports from app-level styles or components, since those may be the
 * source of the crash.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    console.error("[app/global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: 0,
          padding: "1.5rem",
          background: "#faf8f5",
          color: "#1a1a1a",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 480 }}>
          <h1 style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#666", marginBottom: "1.5rem" }}>
            Wishi ran into a problem loading this page. Please refresh — if it
            keeps happening, we&apos;re already looking into it.
          </p>
          {error.digest ? (
            <p style={{ fontSize: "0.75rem", color: "#999" }}>
              Reference: <code>{error.digest}</code>
            </p>
          ) : null}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global-error renders outside the root layout; a raw anchor guarantees a fresh page load past whatever broke. */}
          <a
            href="/"
            style={{
              display: "inline-block",
              marginTop: "1rem",
              padding: "0.625rem 1.5rem",
              borderRadius: "9999px",
              background: "#1a1a1a",
              color: "#fff",
              textDecoration: "none",
              fontSize: "0.875rem",
            }}
          >
            Back home
          </a>
        </div>
      </body>
    </html>
  );
}
