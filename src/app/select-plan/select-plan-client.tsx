"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { PlusIcon, MinusIcon } from "lucide-react";
import type { Plan } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";
import { createCheckout } from "@/app/(client)/bookings/new/actions";

type PlanCardCopy = {
  type: "MINI" | "MAJOR" | "LUX";
  label: string;
  name: string;
  accent: string;
  popular?: boolean;
  features: { title: string; description: string }[];
};

const COPY: PlanCardCopy[] = [
  {
    type: "MINI",
    label: "NEW PIECES TO MY CLOSET",
    name: "Wishi Mini",
    accent: "bg-foreground",
    features: [
      {
        title: "1:1 chat with your stylist",
        description:
          "Direct access to a pro stylist trained by Karla Welch. Share what you need, what you like, and what you already own.",
      },
      {
        title: "A Mood Board to define your style direction",
        description:
          "Your stylist starts by creating a custom Mood Board so you align on taste before they shop.",
      },
      {
        title: "2 Style Boards with curated products and shopping links",
        description:
          "Two shoppable Style Boards with fully styled outfits — blends new pieces with items from your closet.",
      },
      {
        title: "Revisions to get it just right",
        description:
          "Request revisions on any board. Your stylist will refine until it matches what you want.",
      },
      {
        title: "Access to brands worldwide",
        description:
          "Your stylist isn't limited to a store list and isn't paid on commission. Any brand available online is fair game.",
      },
    ],
  },
  {
    type: "MAJOR",
    label: "NEW LOOKS FOR THE SEASON",
    name: "Wishi Major",
    accent: "bg-[hsl(0,65%,45%)]",
    popular: true,
    features: [
      {
        title: "1:1 chat with your stylist",
        description:
          "Direct access to a pro stylist trained by Karla Welch.",
      },
      {
        title: "A Mood Board to define your style direction",
        description:
          "A custom Mood Board so you align on taste before any shopping happens.",
      },
      {
        title: "5 Style Boards with curated products and shopping links",
        description:
          "Five shoppable Style Boards tailored to your body, budget, and lifestyle.",
      },
      {
        title: "Revisions to get it just right",
        description:
          "Refine each board until it matches what you want.",
      },
      {
        title: "Access to brands worldwide",
        description:
          "No store-list restrictions, no commission. Any brand online.",
      },
      {
        title: "Closet styling and outfit building",
        description:
          "Add photos of your wardrobe — your stylist incorporates pieces you already own.",
      },
      {
        title: "Personal style and beauty advice",
        description:
          "Ask about fit, proportions, dressing for a work trip, wedding weekend — anything.",
      },
    ],
  },
  {
    type: "LUX",
    label: "TAKE MY WARDROBE TO THE NEXT LEVEL",
    name: "Wishi Lux",
    accent: "bg-[hsl(45,60%,45%)]",
    features: [
      {
        title: "A 30-minute intro call with your stylist",
        description:
          "Connect live to review your lifestyle, goals, schedule, and personal preferences.",
      },
      {
        title: "A Mood Board to define your style direction",
        description: "A custom Mood Board defines your style direction.",
      },
      {
        title: "Up to 8 curated Style Boards",
        description:
          "Up to 8 Style Boards filled with complete outfits, new ideas, and handpicked pieces.",
      },
      {
        title: "Revisions to get it just right",
        description: "Revise each board until your looks feel perfect.",
      },
      {
        title: "Two seasonal capsules",
        description:
          "Two capsule wardrobes built with interchangeable pieces — multiple outfits, fewer purchases.",
      },
      {
        title: "Virtual fitting room for final polish",
        description:
          "Optional 30-minute video call to review looks and get advice on care, tailoring, and sizing.",
      },
      {
        title: "Unlimited messaging",
        description:
          "Send photos, ask for style advice, share dressing-room pics.",
      },
      {
        title: "Free & Priority Shipping",
        description:
          "Concierge support throughout — your expectations and needs are met end-to-end.",
      },
      {
        title: "Closet styling and outfit building",
        description:
          "Get the most out of what you already own.",
      },
      {
        title: "Personal style and beauty advice",
        description:
          "Fit, proportions, dressing for any occasion — ask away.",
      },
    ],
  },
];

interface Props {
  plans: Plan[];
  stylistId: string | null;
  stylistName: string | null;
  stylistAvatarUrl: string | null;
  initialPlan?: "MINI" | "MAJOR" | "LUX";
}

export function SelectPlanClient({
  plans,
  stylistId,
  stylistName,
  stylistAvatarUrl,
  initialPlan,
}: Props) {
  const [selected, setSelected] = useState<"MINI" | "MAJOR" | "LUX">(
    initialPlan ?? "MAJOR",
  );

  const planByType = new Map(plans.map((p) => [p.type, p]));
  const selectedCopy = COPY.find((c) => c.type === selected)!;

  return (
    <main className="bg-background py-10 md:py-16">
      <div className="mx-auto max-w-5xl px-4">
        <div className="text-center mb-8">
          {stylistAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={stylistAvatarUrl}
              alt={stylistName ?? "Your stylist"}
              className="h-16 w-16 rounded-full object-cover mx-auto mb-3 border-2 border-border"
            />
          ) : (
            <div
              aria-hidden="true"
              className="h-16 w-16 rounded-full bg-muted mx-auto mb-3 border-2 border-border"
            />
          )}
          {stylistName && (
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
              Styling with {stylistName}
            </p>
          )}
          <h1 className="font-display text-3xl md:text-4xl mb-6">
            Choose The Right Plan for You!
          </h1>
          <ContinueForm
            stylistId={stylistId}
            selected={selected}
            selectedName={selectedCopy.name}
          />
          <p className="text-xs text-muted-foreground mt-3">
            You won&apos;t be charged until your stylist delivers
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {COPY.map((copy) => {
            const plan = planByType.get(copy.type);
            if (!plan) return null;
            const isSelected = selected === copy.type;
            return (
              <button
                key={copy.type}
                type="button"
                onClick={() => setSelected(copy.type)}
                className={cn(
                  "rounded-xl border-2 bg-card flex flex-col h-full text-left transition-all duration-200 overflow-hidden relative",
                  isSelected
                    ? "border-foreground shadow-lg"
                    : "border-border hover:border-foreground/30 hover:shadow-md",
                )}
              >
                <div className={`h-1.5 ${copy.accent}`} />
                <div className="p-7 flex flex-col h-full">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-4">
                    {copy.label}
                  </p>
                  <h2 className="font-display text-2xl mb-1">{copy.name}</h2>
                  <p className="font-display text-3xl mb-6">
                    ${Math.round(plan.priceInCents / 100)}
                  </p>
                  <ul className="flex-1">
                    {copy.features.map((f) => (
                      <FeatureRow key={f.title} feature={f} />
                    ))}
                  </ul>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-10 text-center">
          <ContinueForm
            stylistId={stylistId}
            selected={selected}
            selectedName={selectedCopy.name}
          />
          <p className="text-xs text-muted-foreground mt-3">
            You won&apos;t be charged until your stylist delivers
          </p>
        </div>
      </div>
    </main>
  );
}

function FeatureRow({
  feature,
}: {
  feature: { title: string; description: string };
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="flex items-start gap-3 w-full text-left py-3 text-sm"
      >
        {open ? (
          <MinusIcon className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
        ) : (
          <PlusIcon className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
        )}
        <span className={open ? "font-semibold" : ""}>{feature.title}</span>
      </button>
      {open && (
        <p className="text-sm text-muted-foreground pl-7 pb-4 leading-relaxed">
          {feature.description}
        </p>
      )}
    </li>
  );
}

function ContinueForm({
  stylistId,
  selected,
  selectedName,
}: {
  stylistId: string | null;
  selected: string;
  selectedName: string;
}) {
  return (
    <form action={createCheckout}>
      <input type="hidden" name="planType" value={selected} />
      <input type="hidden" name="stylistId" value={stylistId ?? ""} />
      <input type="hidden" name="isSubscription" value="false" />
      <ContinueButton selectedName={selectedName} />
    </form>
  );
}

function ContinueButton({ selectedName }: { selectedName: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-foreground text-background py-4 px-12 text-sm font-medium hover:bg-foreground/90 transition-colors disabled:opacity-60"
    >
      {pending ? "Loading…" : `Continue with ${selectedName}`}
    </button>
  );
}
