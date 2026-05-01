"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckIcon, PencilIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { updateStyleInfo } from "@/app/(client)/settings/actions";

const EMPTY = "—";

export interface StyleInfo {
  // Goals & lifestyle
  shoppingFor: string;
  workEnvironment: string;
  occupation: string;
  location: string;

  // Pieces & categories
  piecesNeeded: string;

  // Fit & body
  height: string;
  bodyType: string;
  fitTops: string;
  fitBottoms: string;
  tendToWear: string;
  accentuate: string;
  necklinesAvoid: string;
  bodyAreasMindful: string;
  bodyAreasNotes: string;

  // Sizes
  topSize: string;
  bottomSize: string;
  jeansSize: string;
  dressSize: string;
  outerwearSize: string;
  shoeSize: string;

  // Budgets per category
  budgetTops: string;
  budgetBottoms: string;
  budgetShoes: string;
  budgetJewelry: string;
  budgetAccessories: string;

  // Style preferences
  styleKeywords: string;
  favoriteColors: string;
  avoidColors: string;
  favoritePatterns: string;
  materialsAvoid: string;
  comfortZone: string;
  shoppingValues: string;

  // Inspiration
  styleIcons: string;
  instagram: string;
  pinterest: string;

  // Brands
  preferredBrands: string;
  avoidBrands: string;

  // Occasions & extras
  occasions: string;
  notes: string;
}

type FieldKey = keyof StyleInfo;

interface SectionDef {
  title: string;
  fields: { key: FieldKey; label: string; multiline?: boolean }[];
}

const SECTIONS: SectionDef[] = [
  {
    title: "Goals & lifestyle",
    fields: [
      { key: "shoppingFor", label: "Shopping for" },
      { key: "workEnvironment", label: "Work environment" },
      { key: "occupation", label: "Occupation" },
      { key: "location", label: "Location" },
    ],
  },
  {
    title: "Pieces & categories",
    fields: [{ key: "piecesNeeded", label: "Pieces needed" }],
  },
  {
    title: "Fit & body",
    fields: [
      { key: "height", label: "Height" },
      { key: "bodyType", label: "Body type" },
      { key: "fitTops", label: "Fit — tops" },
      { key: "fitBottoms", label: "Fit — bottoms" },
      { key: "tendToWear", label: "Tend to wear" },
      { key: "accentuate", label: "Areas to accentuate" },
      { key: "necklinesAvoid", label: "Necklines to avoid" },
      { key: "bodyAreasMindful", label: "Body areas to be mindful of" },
      { key: "bodyAreasNotes", label: "Body notes", multiline: true },
    ],
  },
  {
    title: "Sizes",
    fields: [
      { key: "topSize", label: "Top size" },
      { key: "bottomSize", label: "Bottom size" },
      { key: "jeansSize", label: "Jeans size" },
      { key: "dressSize", label: "Dress size" },
      { key: "outerwearSize", label: "Outerwear size" },
      { key: "shoeSize", label: "Shoe size" },
    ],
  },
  {
    title: "Budget per category",
    fields: [
      { key: "budgetTops", label: "Tops" },
      { key: "budgetBottoms", label: "Bottoms" },
      { key: "budgetShoes", label: "Shoes" },
      { key: "budgetJewelry", label: "Jewelry" },
      { key: "budgetAccessories", label: "Accessories" },
    ],
  },
  {
    title: "Style preferences",
    fields: [
      { key: "styleKeywords", label: "Style keywords" },
      { key: "favoriteColors", label: "Favorite colors" },
      { key: "avoidColors", label: "Colors to avoid" },
      { key: "favoritePatterns", label: "Favorite patterns" },
      { key: "materialsAvoid", label: "Materials to avoid" },
      { key: "comfortZone", label: "Comfort zone" },
      { key: "shoppingValues", label: "Shopping values" },
    ],
  },
  {
    title: "Inspiration",
    fields: [
      { key: "styleIcons", label: "Style icons" },
      { key: "instagram", label: "Instagram" },
      { key: "pinterest", label: "Pinterest" },
    ],
  },
  {
    title: "Brands",
    fields: [
      { key: "preferredBrands", label: "Preferred brands" },
      { key: "avoidBrands", label: "Brands to avoid" },
    ],
  },
  {
    title: "Occasions & notes",
    fields: [
      { key: "occasions", label: "Occasions" },
      { key: "notes", label: "Additional notes", multiline: true },
    ],
  },
];

const COMFORT_ZONE_OPTIONS = [
  "Stay close",
  "A little outside",
  "Push my boundaries",
] as const;

interface Props {
  initial: StyleInfo;
  retakeHref: string;
}

export function StyleInfoPanel({ initial, retakeHref }: Props) {
  const [editing, setEditing] = useState(false);
  const [info, setInfo] = useState<StyleInfo>(initial);
  const [draft, setDraft] = useState<StyleInfo>(initial);
  const [pending, startTransition] = useTransition();

  function startEdit() {
    setDraft(info);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
  }

  function save() {
    startTransition(async () => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(draft)) {
        fd.set(k, v ?? "");
      }
      try {
        await updateStyleInfo(fd);
        setInfo(draft);
        setEditing(false);
        toast.success("Style info updated");
      } catch {
        toast.error("Could not save changes");
      }
    });
  }

  return (
    <div className="space-y-8">
      {!editing ? (
        <>
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="font-display text-base mb-3">{section.title}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {section.fields.map((f) => (
                  <div
                    key={f.key}
                    className={
                      f.multiline ? "sm:col-span-2 lg:col-span-3" : undefined
                    }
                  >
                    <p className="font-body text-xs text-muted-foreground uppercase tracking-wider mb-1">
                      {f.label}
                    </p>
                    <p className="font-body text-sm text-foreground">
                      {info[f.key] || EMPTY}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex items-center gap-1.5 font-body text-sm text-primary hover:underline"
            >
              <PencilIcon className="h-3.5 w-3.5" /> Edit
            </button>
            <span className="text-muted-foreground/40">·</span>
            <Link
              href={retakeHref}
              className="font-body text-sm text-primary hover:underline"
            >
              Retake style quiz
            </Link>
          </div>
        </>
      ) : (
        <>
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="font-display text-base mb-3">{section.title}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {section.fields.map((f) => (
                  <div
                    key={f.key}
                    className={
                      f.multiline ? "sm:col-span-2 lg:col-span-3" : undefined
                    }
                  >
                    <label className="font-body text-xs">{f.label}</label>
                    {f.multiline ? (
                      <textarea
                        value={draft[f.key]}
                        onChange={(e) =>
                          setDraft({ ...draft, [f.key]: e.target.value })
                        }
                        rows={3}
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-body resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    ) : f.key === "comfortZone" ? (
                      <select
                        value={draft.comfortZone}
                        onChange={(e) =>
                          setDraft({ ...draft, comfortZone: e.target.value })
                        }
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-body focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">—</option>
                        {COMFORT_ZONE_OPTIONS.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={draft[f.key]}
                        onChange={(e) =>
                          setDraft({ ...draft, [f.key]: e.target.value })
                        }
                        className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-body focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-5 py-2 text-sm font-body font-medium hover:bg-foreground/90 transition-colors disabled:opacity-50"
            >
              <CheckIcon className="h-3.5 w-3.5" /> {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2 text-sm font-body hover:bg-muted transition-colors disabled:opacity-50"
            >
              <XIcon className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
