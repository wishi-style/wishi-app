"use client";

import * as React from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  /** Stagger delay in milliseconds. */
  delay?: number;
  /** Override the once-only behaviour (fire on every enter) if needed. */
  once?: boolean;
};

/**
 * Motion-backed scroll reveal. Fades + translates the element into place
 * the first time it crosses 15% of the viewport, or fires immediately for
 * visitors with `prefers-reduced-motion: reduce`.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  once = true,
}: RevealProps) {
  const prefersReduced = useReducedMotion();
  const ref = React.useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, {
    amount: 0.15,
    margin: "0px 0px -10% 0px",
    once,
  });

  if (prefersReduced) {
    return <div className={cn(className)}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 12 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
      transition={{
        duration: 0.7,
        delay: delay / 1000,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}
