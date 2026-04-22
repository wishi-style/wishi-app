import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "plain" | "muted" | "cream";

export function Section({
  tone = "plain",
  id,
  className,
  children,
}: {
  tone?: Tone;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "w-full py-16 md:py-24",
        tone === "muted" && "bg-muted/30 border-y border-border",
        tone === "cream" && "bg-cream",
        className,
      )}
    >
      <div className="mx-auto max-w-6xl px-6 md:px-10">{children}</div>
    </section>
  );
}
