"use client";

import { useState } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PricingFeature {
  title: string;
  description: string;
}

export function FeatureAccordion({ feature }: { feature: PricingFeature }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-start gap-3 w-full text-left py-3 text-sm text-foreground"
        aria-expanded={open}
      >
        {open ? (
          <MinusIcon className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
        ) : (
          <PlusIcon className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
        )}
        <span className={cn(open && "font-semibold")}>{feature.title}</span>
      </button>
      {open && (
        <p className="text-sm text-muted-foreground pl-7 pb-4 leading-relaxed">
          {feature.description}
        </p>
      )}
    </li>
  );
}
