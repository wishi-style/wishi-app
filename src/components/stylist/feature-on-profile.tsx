"use client";

// Reusable toggle + style picker used everywhere a stylist decides whether
// a board should also be featured on their public /stylists/[id] profile.
//
// Three surfaces today:
//   1. MoodboardBuilder send dialog (Method 1a)
//   2. SaveLookDialog (Method 1b)
//   3. Sessionless profile-board save dialogs (Method 2a/b) — there it's
//      always-on, picker only.
//
// The style picker offers the canonical 10 labels via Select + a custom
// option that swaps in a free-text Input. `profileStyle` is a plain string
// column on Board, so free-text is allowed at the schema level.

import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CANONICAL_STYLES, isCanonicalStyle } from "@/lib/stylists/styles";

const CUSTOM_KEY = "__custom__";

interface Props {
  enabled: boolean;
  onEnabledChange: (next: boolean) => void;
  style: string;
  onStyleChange: (next: string) => void;
  // When the toggle is fixed-on (sessionless profile-board builders) hide
  // the switch and render only the style picker.
  alwaysOn?: boolean;
  // Style picker is required only when `enabled === true`. The dialog can
  // disable its primary button if `enabled && !style.trim()`.
  disabled?: boolean;
}

export function FeatureOnProfile({
  enabled,
  onEnabledChange,
  style,
  onStyleChange,
  alwaysOn = false,
  disabled = false,
}: Props) {
  const initialIsCustom = style.length > 0 && !isCanonicalStyle(style);
  const [isCustom, setIsCustom] = useState(initialIsCustom);

  const showPicker = alwaysOn || enabled;

  function handleSelect(value: string) {
    if (value === CUSTOM_KEY) {
      setIsCustom(true);
      onStyleChange("");
      return;
    }
    setIsCustom(false);
    onStyleChange(value);
  }

  return (
    <div className="space-y-3 rounded-md border border-muted p-3">
      {!alwaysOn && (
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <Label htmlFor="feature-on-profile" className="font-body text-xs">
              Also feature on my profile
            </Label>
            <p className="font-body text-[11px] text-muted-foreground">
              Visible to clients browsing your public stylist page.
            </p>
          </div>
          <Switch
            id="feature-on-profile"
            checked={enabled}
            onCheckedChange={onEnabledChange}
            disabled={disabled}
          />
        </div>
      )}

      {showPicker && (
        <div className="space-y-1.5">
          <Label htmlFor="feature-style" className="font-body text-xs">
            Style label
            <span className="text-red-600 ml-0.5" aria-hidden>
              *
            </span>
          </Label>
          {isCustom ? (
            <Input
              id="feature-style"
              value={style}
              onChange={(e) => onStyleChange(e.target.value)}
              placeholder="e.g. Coastal grandma"
              maxLength={40}
              className="rounded-sm font-body text-sm"
              disabled={disabled}
            />
          ) : (
            <Select
              value={style && isCanonicalStyle(style) ? style : ""}
              onValueChange={handleSelect}
              disabled={disabled}
            >
              <SelectTrigger
                id="feature-style"
                className="rounded-sm font-body text-sm"
              >
                <SelectValue placeholder="Pick a style" />
              </SelectTrigger>
              <SelectContent>
                {CANONICAL_STYLES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_KEY}>Custom…</SelectItem>
              </SelectContent>
            </Select>
          )}
          {isCustom && (
            <button
              type="button"
              onClick={() => {
                setIsCustom(false);
                onStyleChange("");
              }}
              className="text-[11px] underline text-muted-foreground"
            >
              Pick from list
            </button>
          )}
        </div>
      )}
    </div>
  );
}
