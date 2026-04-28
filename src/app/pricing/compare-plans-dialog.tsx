"use client";

import { useState } from "react";
import { CheckIcon, MinusIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const tiers = ["Mini", "Major", "Lux"] as const;
type Tier = (typeof tiers)[number];

// Side-by-side feature matrix. Edit `features` to keep in sync with the per-
// tier accordions on the main pricing page. Reminder: do NOT add rows for the
// three locked-out features the Loveable source still lists in Lux (founder
// decision 2026-04-07). See the funnel-redesign plan for the strings.
const features: { label: string; mini: boolean | string; major: boolean | string; lux: boolean | string }[] = [
  { label: "1:1 chat with your stylist", mini: true, major: true, lux: true },
  { label: "Mood Board to align on direction", mini: true, major: true, lux: true },
  { label: "Style Boards", mini: "2", major: "5", lux: "8" },
  { label: "Revisions per board", mini: "1", major: "1", lux: "Unlimited" },
  { label: "Access to brands worldwide", mini: true, major: true, lux: true },
  { label: "Closet styling and outfit building", mini: false, major: true, lux: true },
  { label: "Personal style and beauty advice", mini: false, major: true, lux: true },
  { label: "30-min intro video call", mini: false, major: false, lux: true },
  { label: "Priority shipping on Wishi orders", mini: false, major: false, lux: true },
  { label: "Wishi Lux gift bag", mini: false, major: false, lux: true },
];

function CellValue({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return <span className="text-sm font-medium text-foreground">{value}</span>;
  }
  return value ? (
    <CheckIcon className="h-4 w-4 mx-auto text-foreground" aria-label="included" />
  ) : (
    <MinusIcon className="h-4 w-4 mx-auto text-muted-foreground/40" aria-label="not included" />
  );
}

interface Props {
  triggerLabel?: string;
}

export function ComparePlansDialog({ triggerLabel = "Compare plans" }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
      >
        {triggerLabel}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Compare plans</DialogTitle>
        </DialogHeader>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider py-3 pr-4">
                  Feature
                </th>
                {tiers.map((tier) => (
                  <th
                    key={tier}
                    className="font-display text-base text-center py-3 px-3 min-w-[80px]"
                  >
                    {tier}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map((feature) => (
                <tr key={feature.label} className="border-b border-border/60">
                  <td className="text-sm text-foreground py-3 pr-4">{feature.label}</td>
                  {tiers.map((tier) => {
                    const key = tier.toLowerCase() as Lowercase<Tier>;
                    return (
                      <td key={tier} className="text-center py-3 px-3">
                        <CellValue value={feature[key]} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
