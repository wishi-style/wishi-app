"use client";

// Verbatim port of Loveable's `smart-spark-craft/src/pages/StyleQuiz.tsx`.
// Translation notes:
//  - react-router useNavigate -> next/navigation useRouter
//  - Loveable AuthContext (`user.email`) -> server-supplied `userEmail` prop
//  - File blob preview -> S3 presigned PUT via /api/uploads/presigned
//  - localStorage.wishi_quiz_completed -> server action that sets
//    StyleProfile.quizCompletedAt
//  - lucide-react icons get the *Icon suffix (Next 16 / lucide 1.x).
// Everything visible (copy, layout, classes, transitions, auto-advance,
// skip semantics) is intentionally identical to Loveable.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckIcon,
  ChevronLeftIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { submitStyleQuiz, type SubmitContext } from "@/app/style-quiz/submit.action";
import type { LoveableQuizAnswers } from "@/lib/quiz/loveable-style-quiz";
import { filterCities, formatCity } from "@/lib/data/cities";

/* ─── Question data (verbatim from Loveable) ─── */

const shoppingReasons = [
  "A special event",
  "A workwear update",
  "A holiday",
  "A style refresh",
  "A particular piece",
];

const pieceOptions = [
  "Tops",
  "Pants",
  "Jackets",
  "Jumpsuits",
  "Sweaters",
  "Sunglasses",
  "Shoes",
  "Skirts",
  "Dresses",
  "Jeans",
  "Blazers",
  "Coats",
  "Scarves",
  "Jewelry",
  "Hats",
  "Bags",
];

const colorOptions: { label: string; color: string }[] = [
  { label: "Black", color: "#1A1A1A" },
  { label: "White", color: "#FFFFFF" },
  { label: "Gray", color: "#B0B0B0" },
  { label: "Navy Blue", color: "#1B2A6B" },
  { label: "Light Blue", color: "#A4C8E8" },
  { label: "Green", color: "#5C6B2F" },
  { label: "Natural", color: "#F5D6A8" },
  { label: "Brown", color: "#8B5E3C" },
  { label: "Red", color: "#8B1A1A" },
  { label: "Yellow", color: "#F2D14C" },
  { label: "Pink", color: "#F0A0B0" },
  { label: "Orange", color: "#E8972C" },
  { label: "Purple", color: "#B040B0" },
  { label: "Metallic", color: "#C0C0C0" },
  { label: "Anything Goes", color: "" },
];

const patternOptions: { label: string; emoji: string }[] = [
  { label: "Animal Print", emoji: "🐆" },
  { label: "Paisley", emoji: "🌺" },
  { label: "Camo", emoji: "🌿" },
  { label: "Plaid", emoji: "🏁" },
  { label: "Polka Dots", emoji: "⚪" },
  { label: "Stripes", emoji: "📏" },
  { label: "Floral", emoji: "🌸" },
];

const topsSizes = ["Extra small", "Small", "Medium", "Large", "Extra large"];
const bottomsSizes = ["Extra small", "Small", "Medium", "Large", "Extra large"];
const shoeSizes = ["36", "37", "38", "39", "40", "41", "42", "43", "44"];
const jeansSizes = ["24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34"];
const dressesSizes = ["Extra small", "Small", "Medium", "Large", "Extra large"];
const outerwearSizes = ["Extra small", "Small", "Medium", "Large", "Extra large"];

const budgetOptions = ["$50–100", "$100–250", "$250–500", "$500–1000", "$1000+"];

const fitOptions = ["Tight", "Fitted", "Straight", "Loose", "Oversized"];

const accentuateOptions = ["Abs", "Arms", "Back", "Calves", "Cleavage", "Legs", "Rear", "Waist"];

const necklineOptions = [
  "V neck",
  "Halter neck",
  "Turtle neck",
  "Deep V",
  "Round neck",
  "Strapless",
  "Sleeveless",
  "Boat neck",
  "Cowl neck",
];

const bodyAreaOptions = [
  "Arms/Shoulders",
  "Stomach",
  "Rear",
  "Hips",
  "Legs",
  "Chest",
  "Feet",
  "Health Concerns",
  "Something else",
];

const materialAvoidOptions = [
  "Velvet",
  "Leather",
  "Lace",
  "Polyester",
  "Fur",
  "Wool",
  "Dry Clean Only",
  "Linen",
];

const tendToWearOptions = [
  "Mostly dresses and skirts",
  "Mostly jeans and pants",
  "Healthy mix of both",
];

const comfortZoneOptions = [
  "Stay close to my style",
  "Open for a few new items",
  "Up for a new style",
];

const shoppingValuesList = [
  "Quiet Luxury",
  "Uniqueness",
  "Sustainability",
  "Versatility",
  "Comfort",
  "The latest trends",
];

const styleIconOptions = [
  "Beyonce", "Reese Witherspoon", "Carolyn Bessette-Kennedy", "Kaia Gerber",
  "Lilly Aldridge", "Diane Kruger", "Priyanka Chopra-Jonas", "Rosie Huntington-Whiteley",
  "Alessandra Ambrosio", "Amal Clooney", "Hailey Bieber", "Jackie Kennedy", "Angelina Jolie",
  "Annie Bing", "Ashley Benson", "Ashley Graham", "Ashley Olsen", "Audrey Hepburn", "Aya Jones",
  "Bianca Brandolini", "Bree Warren", "Brittany Xavier", "Olivia Palermo", "Elsa Hosk",
  "Emily Ratajkowski", "Eva Mendes", "Gwyneth Paltrow", "Amanda Harlech", "Irina Shayk",
  "Angelica Blick", "Jane Birkin", "Jennifer Aniston", "Jennifer Lopez", "Karlie Kloss",
  "Kate Middleton", "Kate Moss", "Khloe Kardashian", "Kim Kardashian", "Lauren Santo Domingo",
  "Leandra Medine", "Michelle Obama", "Naomi Watts", "Nicole Kidman", "Olivia Wilde",
  "Cindy Crawford", "Rihanna", "Victoria Beckham", "Zoe Kravitz", "Eva Chen", "Meghan Markle",
  "Lily Collins", "Chloe Sevigny", "Chrissy Teigen",
];

const hearAboutUsOptions = [
  "Instagram",
  "Referred by a stylist",
  "Family / Friend",
  "Internet Search",
  "Article / Media",
  "Pinterest",
  "Facebook",
  "Newsletter",
  "I'm a Repeat Customer",
  "Other",
];

const heightOptions = ["Tall", "Average", "Petite"];

const TOTAL_STEPS = 26;

export interface StyleQuizLoveableProps {
  ctx: SubmitContext;
  userEmail?: string;
}

export default function StyleQuizLoveable({ ctx, userEmail }: StyleQuizLoveableProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // ─── State per question ────────────────────────────────────────────
  const [shoppingFor, setShoppingFor] = useState<string | null>(null);
  const [workEnvironment, setWorkEnvironment] = useState<string | null>(null);
  const [workEnvironmentOther, setWorkEnvironmentOther] = useState("");
  const [pieces, setPieces] = useState<string[]>([]);
  const [location, setLocation] = useState("");
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>([]);
  const [sizeTops, setSizeTops] = useState<string[]>([]);
  const [sizeBottoms, setSizeBottoms] = useState<string[]>([]);
  const [sizeShoes, setSizeShoes] = useState<string[]>([]);
  const [sizeJeans, setSizeJeans] = useState<string[]>([]);
  const [sizeDresses, setSizeDresses] = useState<string[]>([]);
  const [sizeOuterwear, setSizeOuterwear] = useState<string[]>([]);
  const [budgetTops, setBudgetTops] = useState<string[]>([]);
  const [budgetBottoms, setBudgetBottoms] = useState<string[]>([]);
  const [budgetShoes, setBudgetShoes] = useState<string[]>([]);
  const [budgetJewelry, setBudgetJewelry] = useState<string[]>([]);
  const [budgetAccessories, setBudgetAccessories] = useState<string[]>([]);
  const [heightPreference, setHeightPreference] = useState<string | null>(null);
  const [fitPreference, setFitPreference] = useState<string | null>(null);
  const [fitBottomPreference, setFitBottomPreference] = useState<string | null>(null);
  const [tendToWear, setTendToWear] = useState<string | null>(null);
  const [accentuate, setAccentuate] = useState<string[]>([]);
  const [necklinesAvoid, setNecklinesAvoid] = useState<string[]>([]);
  const [bodyAreas, setBodyAreas] = useState<string[]>([]);
  const [bodyAreasNotes, setBodyAreasNotes] = useState("");
  const [materialsAvoid, setMaterialsAvoid] = useState<string[]>([]);
  const [comfortZone, setComfortZone] = useState<string | null>(null);
  const [birthday, setBirthday] = useState("1984-01-01");
  const [occupation, setOccupation] = useState("");
  const [styleIcons, setStyleIcons] = useState<string[]>([]);
  const [styleIconsOther, setStyleIconsOther] = useState("");
  const [instagram, setInstagram] = useState("");
  const [pinterest, setPinterest] = useState("");
  const [values, setValues] = useState<string[]>([]);
  const [extraNotes, setExtraNotes] = useState("");
  const [hearAboutUs, setHearAboutUs] = useState<string | null>(null);
  const [hearAboutUsOther, setHearAboutUsOther] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState("+1");
  const [preferredEmail, setPreferredEmail] = useState(userEmail ?? "");

  // Body photo: keep a local blob URL for instant preview AND a remote
  // S3 URL captured from the presigned-PUT response — the remote is what
  // we persist on submit. Blob URLs are revoked when replaced and on
  // unmount so the browser can GC the underlying file.
  const [bodyPhotoPreview, setBodyPhotoPreview] = useState<string | null>(null);
  const [bodyPhotoRemoteUrl, setBodyPhotoRemoteUrl] = useState<string | null>(null);
  const [bodyPhotoUploading, setBodyPhotoUploading] = useState(false);
  const [bodyPhotoError, setBodyPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyPhotoBlobUrlRef = useRef<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (bodyPhotoBlobUrlRef.current) {
        URL.revokeObjectURL(bodyPhotoBlobUrlRef.current);
        bodyPhotoBlobUrlRef.current = null;
      }
    };
  }, []);

  const setPreviewBlob = (file: File | null) => {
    if (bodyPhotoBlobUrlRef.current) {
      URL.revokeObjectURL(bodyPhotoBlobUrlRef.current);
      bodyPhotoBlobUrlRef.current = null;
    }
    if (!file) {
      setBodyPhotoPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    bodyPhotoBlobUrlRef.current = url;
    setBodyPhotoPreview(url);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBodyPhotoError(null);
    setBodyPhotoUploading(true);
    setPreviewBlob(file);
    try {
      const params = new URLSearchParams({
        filename: sanitizeFilename(file.name),
        contentType: file.type || "image/jpeg",
        purpose: "style-quiz-body-photo",
      });
      const presignRes = await fetch(`/api/uploads/presigned?${params.toString()}`);
      if (!presignRes.ok) throw new Error(`Presign failed (${presignRes.status})`);
      const { url, publicUrl } = (await presignRes.json()) as {
        url: string;
        publicUrl: string;
      };
      const putRes = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      if (!putRes.ok) throw new Error(`Upload failed (${putRes.status})`);
      setBodyPhotoRemoteUrl(publicUrl);
    } catch (err) {
      setBodyPhotoError(err instanceof Error ? err.message : "Upload failed");
      setPreviewBlob(null);
      setBodyPhotoRemoteUrl(null);
    } finally {
      setBodyPhotoUploading(false);
    }
  };

  const removePhoto = () => {
    setPreviewBlob(null);
    setBodyPhotoRemoteUrl(null);
    setBodyPhotoError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const toggleIn = (arr: string[], val: string, set: (v: string[]) => void) =>
    set(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);

  const next = () => step < TOTAL_STEPS - 1 && setStep(step + 1);
  const prev = () => step > 0 && setStep(step - 1);

  const finish = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const answers: LoveableQuizAnswers = {
      shoppingFor: shoppingFor as LoveableQuizAnswers["shoppingFor"],
      workEnvironment: workEnvironment as LoveableQuizAnswers["workEnvironment"],
      workEnvironmentOther,
      pieces: pieces as LoveableQuizAnswers["pieces"],
      selectedColors: selectedColors as LoveableQuizAnswers["selectedColors"],
      location,
      selectedPatterns: selectedPatterns as LoveableQuizAnswers["selectedPatterns"],
      heightPreference: heightPreference as LoveableQuizAnswers["heightPreference"],
      sizeTops,
      sizeBottoms,
      sizeShoes,
      sizeJeans,
      sizeDresses,
      sizeOuterwear,
      budgetTops: budgetTops as LoveableQuizAnswers["budgetTops"],
      budgetBottoms: budgetBottoms as LoveableQuizAnswers["budgetBottoms"],
      budgetShoes: budgetShoes as LoveableQuizAnswers["budgetShoes"],
      budgetJewelry: budgetJewelry as LoveableQuizAnswers["budgetJewelry"],
      budgetAccessories: budgetAccessories as LoveableQuizAnswers["budgetAccessories"],
      fitPreference: fitPreference as LoveableQuizAnswers["fitPreference"],
      fitBottomPreference: fitBottomPreference as LoveableQuizAnswers["fitBottomPreference"],
      tendToWear: tendToWear as LoveableQuizAnswers["tendToWear"],
      accentuate: accentuate as LoveableQuizAnswers["accentuate"],
      necklinesAvoid: necklinesAvoid as LoveableQuizAnswers["necklinesAvoid"],
      bodyAreas: bodyAreas as LoveableQuizAnswers["bodyAreas"],
      bodyAreasNotes,
      materialsAvoid: materialsAvoid as LoveableQuizAnswers["materialsAvoid"],
      comfortZone: comfortZone as LoveableQuizAnswers["comfortZone"],
      birthday,
      occupation,
      styleIcons: styleIcons as LoveableQuizAnswers["styleIcons"],
      styleIconsOther,
      instagram,
      pinterest,
      values: values as LoveableQuizAnswers["values"],
      extraNotes,
      bodyPhotoUrl: bodyPhotoRemoteUrl,
      hearAboutUs: hearAboutUs as LoveableQuizAnswers["hearAboutUs"],
      hearAboutUsOther,
      phoneCountryCode: phoneCountryCode as LoveableQuizAnswers["phoneCountryCode"],
      phoneNumber,
      preferredEmail,
    };
    const result = await submitStyleQuiz(answers, ctx);
    if (result.ok) {
      router.push(result.redirectTo);
    } else {
      setSubmitError(humanizeError(result.error));
      setSubmitting(false);
    }
  };

  const canNext = (): boolean => {
    if (step === 0) {
      if (!shoppingFor) return false;
      if (shoppingFor === "A workwear update") {
        if (!workEnvironment) return false;
        if (workEnvironment === "Other" && !workEnvironmentOther.trim()) return false;
      }
      return true;
    }
    if (step === 1) return pieces.length > 0;
    return true;
  };

  // Steps that show a Skip button (verbatim from Loveable).
  const skippableSteps = [
    2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
  ];

  const finalCtaLabel =
    ctx.kind === "session" ? "Continue to my session" : "Finish style quiz";

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center">
          <button
            onClick={step > 0 ? prev : () => router.back()}
            className="mr-4"
            aria-label="Back"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <div className="flex-1 text-center">
            <p className="font-body text-xs text-muted-foreground">
              {step + 1} of {TOTAL_STEPS}
            </p>
            <p className="font-body text-base font-semibold">Your Style Profile</p>
          </div>
          <div className="w-9" />
        </div>
      </div>

      {/* Progress bar */}
      <div className="max-w-lg mx-auto w-full px-4 pt-3">
        <div className="flex gap-1">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-[2px] flex-1 rounded-full transition-all duration-500",
                i <= step ? "bg-foreground" : "bg-foreground/15",
              )}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-lg md:max-w-2xl mx-auto w-full px-4 py-8 flex flex-col overflow-y-auto">
        {/* Step 0: What are you shopping for? */}
        {step === 0 && (
          <div className="flex-1">
            <h2 className="font-display text-3xl mb-1">What are you shopping for?</h2>
            <p className="font-body text-base text-muted-foreground mb-6">Please select one answer</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {shoppingReasons.map((r) => {
                const selected = shoppingFor === r;
                return (
                  <button
                    key={r}
                    onClick={() => {
                      setShoppingFor(r);
                      if (r !== "A workwear update") {
                        setWorkEnvironment(null);
                        setWorkEnvironmentOther("");
                        setTimeout(next, 300);
                      }
                    }}
                    className={cn(
                      "relative rounded-lg border-2 p-4 pb-5 flex items-center gap-3 transition-colors",
                      selected
                        ? "border-foreground bg-foreground/5"
                        : "border-border hover:border-foreground/30",
                    )}
                  >
                    {selected && (
                      <div className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-foreground flex items-center justify-center">
                        <CheckIcon className="h-3 w-3 text-background" />
                      </div>
                    )}
                    <span className="font-body text-base">{r}</span>
                  </button>
                );
              })}
            </div>

            {shoppingFor === "A workwear update" && (
              <div className="mt-8 animate-fade-in">
                <h3 className="font-display text-xl mb-1">What&apos;s your work environment?</h3>
                <p className="font-body text-base text-muted-foreground mb-4">Please select one answer</p>
                <div className="grid grid-cols-2 gap-3">
                  {["Corporate", "Denim friendly", "Anything goes", "Other"].map((env) => {
                    const selected = workEnvironment === env;
                    return (
                      <button
                        key={env}
                        onClick={() => setWorkEnvironment(env)}
                        className={cn(
                          "relative rounded-lg border-2 p-4 text-left transition-colors",
                          selected
                            ? "border-foreground bg-foreground/5"
                            : "border-border hover:border-foreground/30",
                        )}
                      >
                        {selected && (
                          <div className="absolute top-2.5 right-2.5 h-5 w-5 rounded-full bg-foreground flex items-center justify-center">
                            <CheckIcon className="h-3 w-3 text-background" />
                          </div>
                        )}
                        <span className="font-body text-base">{env}</span>
                      </button>
                    );
                  })}
                </div>
                {workEnvironment === "Other" && (
                  <input
                    type="text"
                    autoFocus
                    value={workEnvironmentOther}
                    onChange={(e) => setWorkEnvironmentOther(e.target.value)}
                    placeholder="Tell us about your work environment…"
                    className="mt-3 w-full rounded-md border-2 border-border focus:border-foreground bg-transparent px-4 py-3 font-body text-base focus:outline-none transition-colors"
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 1: What pieces are you looking for? */}
        {step === 1 && (
          <div className="flex-1 flex flex-col">
            <h2 className="font-display text-3xl mb-1">What pieces are you looking for?</h2>
            <p className="font-body text-base text-muted-foreground mb-6">You can select more than one answer</p>
            <div className="flex flex-wrap gap-2.5 mb-auto">
              {pieceOptions.map((p) => (
                <button
                  key={p}
                  onClick={() => toggleIn(pieces, p, setPieces)}
                  className={cn(
                    "relative rounded-md border-2 px-5 py-2.5 font-body text-base transition-colors flex items-center gap-2",
                    pieces.includes(p)
                      ? "border-foreground bg-foreground/5"
                      : "border-border hover:border-foreground/30",
                  )}
                >
                  {pieces.includes(p) && <CheckIcon className="h-3.5 w-3.5 text-foreground" />}
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Colors */}
        {step === 2 && (
          <div className="flex-1 flex flex-col">
            <h2 className="font-display text-3xl mb-1">What colors would you like your stylist to use?</h2>
            <p className="font-body text-base text-muted-foreground mb-6">Select as many as you&apos;d like</p>
            <div className="flex flex-wrap justify-center gap-2.5 mb-4">
              {colorOptions.map((c) => (
                <button
                  key={c.label}
                  onClick={() => {
                    if (c.label === "Anything Goes") {
                      setSelectedColors(
                        selectedColors.includes("Anything Goes")
                          ? []
                          : colorOptions.map((o) => o.label),
                      );
                    } else {
                      toggleIn(selectedColors, c.label, setSelectedColors);
                    }
                  }}
                  className={cn(
                    "rounded-lg border-2 px-5 py-3 flex items-center gap-3 font-body text-base transition-colors",
                    selectedColors.includes(c.label)
                      ? "border-foreground bg-foreground/5"
                      : "border-border hover:border-foreground/30",
                  )}
                >
                  {c.color && (
                    <div
                      className="h-5 w-5 rounded-sm shrink-0"
                      style={{
                        backgroundColor: c.color,
                        border: c.label === "White" ? "1px solid #ddd" : undefined,
                      }}
                    />
                  )}
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Where will you be wearing your purchases? */}
        {step === 3 && (
          <div className="flex-1 flex flex-col">
            <h2 className="font-display text-3xl mb-1">Where will you be wearing your purchases?</h2>
            <p className="font-body text-base text-muted-foreground mb-6">Start typing — pick a city or use your own value.</p>
            <CityAutocomplete value={location} onChange={setLocation} />
          </div>
        )}

        {/* Step 4: Patterns to avoid */}
        {step === 4 && (
          <div className="flex-1 flex flex-col">
            <h2 className="font-display text-3xl mb-1">Which patterns would you like your stylist to avoid?</h2>
            <p className="font-body text-base text-muted-foreground mb-6">Select as many as you&apos;d like</p>
            <div className="flex flex-wrap justify-center gap-2.5 mb-4">
              {patternOptions.map((p) => (
                <button
                  key={p.label}
                  onClick={() => toggleIn(selectedPatterns, p.label, setSelectedPatterns)}
                  className={cn(
                    "rounded-lg border-2 px-5 py-3 flex items-center gap-3 font-body text-base transition-colors",
                    selectedPatterns.includes(p.label)
                      ? "border-foreground bg-foreground/5"
                      : "border-border hover:border-foreground/30",
                  )}
                >
                  <span className="text-base">{p.emoji}</span>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Height */}
        {step === 5 && (
          <div className="flex-1 flex flex-col">
            <h2 className="font-display text-3xl mb-6">What&apos;s your height?</h2>
            <div className="flex flex-wrap gap-2.5">
              {heightOptions.map((h) => (
                <button
                  key={h}
                  onClick={() => {
                    setHeightPreference(h);
                    setTimeout(next, 300);
                  }}
                  className={cn(
                    "rounded-lg border-2 px-8 py-3.5 font-body text-base transition-colors flex items-center gap-2",
                    heightPreference === h
                      ? "border-foreground bg-foreground/5"
                      : "border-border hover:border-foreground/30",
                  )}
                >
                  {heightPreference === h && <CheckIcon className="h-3.5 w-3.5 text-foreground" />}
                  {h}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 6: Sizes */}
        {step === 6 && (
          <div className="flex-1 flex flex-col">
            <h2 className="font-display text-3xl mb-1">What size do you usually wear?</h2>
            <p className="font-body text-base text-muted-foreground mb-6">You can select more than one answer</p>
            <div className="space-y-6">
              <SizeRow label="Tops" options={topsSizes} value={sizeTops} set={setSizeTops} prefix="top" />
              <SizeRow label="Bottoms" options={bottomsSizes} value={sizeBottoms} set={setSizeBottoms} prefix="bot" />
              <SizeRow label="Shoes" options={shoeSizes} value={sizeShoes} set={setSizeShoes} prefix="shoe" />
              <SizeRow label="Jeans" options={jeansSizes} value={sizeJeans} set={setSizeJeans} prefix="jean" />
              <SizeRow label="Dresses" options={dressesSizes} value={sizeDresses} set={setSizeDresses} prefix="dress" />
              <SizeRow label="Outerwear" options={outerwearSizes} value={sizeOuterwear} set={setSizeOuterwear} prefix="outer" />
            </div>
          </div>
        )}

        {/* Step 7: Budget */}
        {step === 7 && (
          <div className="flex-1 flex flex-col">
            <h2 className="font-display text-3xl mb-1">What&apos;s your budget per category?</h2>
            <p className="font-body text-base text-muted-foreground mb-6">You can select more than one answer</p>
            <div className="space-y-6">
              <SizeRow label="Tops" options={budgetOptions} value={budgetTops} set={setBudgetTops} prefix="bt" />
              <SizeRow label="Bottoms" options={budgetOptions} value={budgetBottoms} set={setBudgetBottoms} prefix="bb" />
              <SizeRow label="Shoes" options={budgetOptions} value={budgetShoes} set={setBudgetShoes} prefix="bs" />
              <SizeRow label="Jewelry" options={budgetOptions} value={budgetJewelry} set={setBudgetJewelry} prefix="bj" />
              <SizeRow label="Accessories" options={budgetOptions} value={budgetAccessories} set={setBudgetAccessories} prefix="ba" />
            </div>
          </div>
        )}

        {/* Step 8: Fit top half */}
        {step === 8 && (
          <SingleSelectStep
            heading="How do you prefer clothes to fit your top half?"
            subheading="Please select one answer"
            options={fitOptions}
            value={fitPreference}
            onPick={(v) => {
              setFitPreference(v);
              setTimeout(next, 300);
            }}
          />
        )}

        {/* Step 9: Fit bottom half */}
        {step === 9 && (
          <SingleSelectStep
            heading="How do you prefer clothes to fit your bottom half?"
            subheading="Please select one answer"
            options={fitOptions}
            value={fitBottomPreference}
            onPick={(v) => {
              setFitBottomPreference(v);
              setTimeout(next, 300);
            }}
          />
        )}

        {/* Step 10: What do you tend to wear? */}
        {step === 10 && (
          <SingleSelectStep
            heading="What do you tend to wear?"
            subheading="Please select one answer"
            options={tendToWearOptions}
            value={tendToWear}
            onPick={(v) => {
              setTendToWear(v);
              setTimeout(next, 300);
            }}
          />
        )}

        {/* Step 11: Accentuate */}
        {step === 11 && (
          <div className="flex-1 flex flex-col">
            <h2 className="font-display text-3xl mb-1">What features do you like to accentuate?</h2>
            <p className="font-body text-base text-muted-foreground mb-6">Select as many as you&apos;d like</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {accentuateOptions.map((a) => (
                <button
                  key={a}
                  onClick={() => toggleIn(accentuate, a, setAccentuate)}
                  className={cn(
                    "rounded-lg border-2 px-5 py-4 font-body text-base transition-colors flex items-center justify-center gap-2",
                    accentuate.includes(a)
                      ? "border-foreground bg-foreground/5"
                      : "border-border hover:border-foreground/30",
                  )}
                >
                  {accentuate.includes(a) && <CheckIcon className="h-3.5 w-3.5 text-foreground" />}
                  {a}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 12: Necklines avoid */}
        {step === 12 && (
          <ChipMultiSelectStep
            heading="Which necklines would you like to avoid?"
            subheading="Select as many as you'd like"
            options={necklineOptions}
            value={necklinesAvoid}
            onToggle={(v) => toggleIn(necklinesAvoid, v, setNecklinesAvoid)}
          />
        )}

        {/* Step 13: Body areas */}
        {step === 13 && (
          <div className="flex-1 flex flex-col">
            <h2 className="font-display text-3xl mb-1">Are there any body areas you would like to share more about?</h2>
            <p className="font-body text-base text-muted-foreground mb-6">Select as many as you&apos;d like</p>
            <div className="flex flex-wrap gap-2.5 mb-6">
              {bodyAreaOptions.map((b) => (
                <button
                  key={b}
                  onClick={() => toggleIn(bodyAreas, b, setBodyAreas)}
                  className={cn(
                    "rounded-md border-2 px-5 py-2.5 font-body text-base transition-colors flex items-center gap-2",
                    bodyAreas.includes(b)
                      ? "border-foreground bg-foreground/5"
                      : "border-border hover:border-foreground/30",
                  )}
                >
                  {bodyAreas.includes(b) && <CheckIcon className="h-3.5 w-3.5 text-foreground" />}
                  {b}
                </button>
              ))}
            </div>
            <label className="font-body text-base text-muted-foreground mb-1">Anything else?</label>
            <textarea
              value={bodyAreasNotes}
              onChange={(e) => setBodyAreasNotes(e.target.value)}
              placeholder="Tell us more"
              rows={3}
              className="border border-border rounded-md p-3 font-body text-base focus:outline-none focus:ring-1 focus:ring-foreground transition-colors resize-none"
            />
          </div>
        )}

        {/* Step 14: Materials avoid */}
        {step === 14 && (
          <ChipMultiSelectStep
            heading="Anything you'd like to avoid?"
            subheading="Select as many as you'd like"
            options={materialAvoidOptions}
            value={materialsAvoid}
            onToggle={(v) => toggleIn(materialsAvoid, v, setMaterialsAvoid)}
          />
        )}

        {/* Step 15: Comfort zone */}
        {step === 15 && (
          <SingleSelectStep
            heading="How far out of your comfort zone are you willing to go?"
            subheading="Please select one answer"
            options={comfortZoneOptions}
            value={comfortZone}
            onPick={(v) => {
              setComfortZone(v);
              setTimeout(next, 300);
            }}
          />
        )}

        {/* Step 16: Birthday */}
        {step === 16 && (
          <div className="flex-1 flex flex-col">
            <h2 className="font-display text-3xl mb-1">When&apos;s your birthday?</h2>
            <p className="font-body text-base text-muted-foreground mb-6">
              We love celebrating you — expect a little surprise on your special day 🎁
            </p>
            <input
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              className="border border-border rounded-md px-4 py-3 font-body text-base focus:outline-none focus:ring-1 focus:ring-foreground transition-colors"
            />
          </div>
        )}

        {/* Step 17: Occupation */}
        {step === 17 && (
          <div className="flex-1 flex flex-col">
            <h2 className="font-display text-3xl mb-1">What is your occupation?</h2>
            <p className="font-body text-base text-muted-foreground mb-6">
              This helps your stylist understand your lifestyle and daily activities.
            </p>
            <input
              type="text"
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
              placeholder="Doctor, Artist, Busy Mom, Entrepreneur etc"
              className="border border-border rounded-md px-4 py-3 font-body text-base focus:outline-none focus:ring-1 focus:ring-foreground transition-colors"
            />
          </div>
        )}

        {/* Step 18: Style Icons */}
        {step === 18 && (
          <div className="flex-1 flex flex-col">
            <h2 className="font-display text-3xl mb-1">Who&apos;s your style icon/s?</h2>
            <p className="font-body text-base text-muted-foreground mb-6">(i.e celebrity, fashion blogger/influencer)</p>
            <div className="flex flex-wrap gap-2.5 mb-8">
              {styleIconOptions.map((icon) => (
                <button
                  key={icon}
                  onClick={() => toggleIn(styleIcons, icon, setStyleIcons)}
                  className={cn(
                    "rounded-md border-2 px-5 py-2.5 font-body text-base transition-colors flex items-center gap-2",
                    styleIcons.includes(icon)
                      ? "border-foreground bg-foreground/5"
                      : "border-border hover:border-foreground/30",
                  )}
                >
                  {styleIcons.includes(icon) && <CheckIcon className="h-3.5 w-3.5 text-foreground" />}
                  {icon}
                </button>
              ))}
            </div>
            <label className="font-body text-base text-muted-foreground mb-2">Anything else?</label>
            <textarea
              value={styleIconsOther}
              onChange={(e) => setStyleIconsOther(e.target.value)}
              placeholder=""
              rows={3}
              className="border border-border rounded-md px-4 py-3 font-body text-base focus:outline-none focus:ring-1 focus:ring-foreground transition-colors resize-none"
            />
          </div>
        )}

        {/* Step 19: Instagram */}
        {step === 19 && (
          <div className="flex-1 flex flex-col">
            <h2 className="font-display text-3xl mb-1">Let your stylist know what you like by adding your Instagram account.</h2>
            <p className="font-body text-base text-muted-foreground mb-6">
              Make sure your account is public so your stylist can view your profile.
            </p>
            <input
              type="text"
              value={instagram}
              onChange={(e) => setInstagram(e.target.value)}
              placeholder="e.g. username"
              className="border border-border rounded-md px-4 py-3 font-body text-base focus:outline-none focus:ring-1 focus:ring-foreground transition-colors"
            />
          </div>
        )}

        {/* Step 20: Pinterest */}
        {step === 20 && (
          <div className="flex-1 flex flex-col">
            <h2 className="font-display text-3xl mb-6">Let your stylist know what you like by adding your Pinterest board.</h2>
            <input
              type="text"
              value={pinterest}
              onChange={(e) => setPinterest(e.target.value)}
              placeholder="e.g. https://www.pinterest.com/yourusername/your-board"
              className="border border-border rounded-md px-4 py-3 font-body text-base focus:outline-none focus:ring-1 focus:ring-foreground transition-colors"
            />
          </div>
        )}

        {/* Step 21: Anything important */}
        {step === 21 && (
          <div className="flex-1 flex flex-col">
            <h2 className="font-display text-3xl mb-6">Is there anything that is of particular importance to you?</h2>
            <p className="font-body text-base text-muted-foreground mb-4">Select as many as you&apos;d like</p>
            <div className="flex flex-wrap gap-2.5 mb-8">
              {shoppingValuesList.map((v) => (
                <button
                  key={v}
                  onClick={() => toggleIn(values, v, setValues)}
                  className={cn(
                    "rounded-md border-2 px-5 py-2.5 font-body text-base transition-colors flex items-center gap-2",
                    values.includes(v)
                      ? "border-foreground bg-foreground/5"
                      : "border-border hover:border-foreground/30",
                  )}
                >
                  {values.includes(v) && <CheckIcon className="h-3.5 w-3.5 text-foreground" />}
                  {v}
                </button>
              ))}
            </div>
            <textarea
              value={extraNotes}
              onChange={(e) => setExtraNotes(e.target.value)}
              placeholder="Tell us more"
              rows={3}
              className="border-b border-border py-3 font-body text-base focus:outline-none focus:border-foreground transition-colors resize-none"
            />
          </div>
        )}

        {/* Step 22: Body photo */}
        {step === 22 && (
          <div className="flex-1 flex flex-col">
            <h2 className="font-display text-3xl mb-2">Add a full body photo</h2>
            <p className="font-body text-base text-muted-foreground mb-8">
              If you would like your stylist to provide a more personalised edit, upload a full-body photo of yourself
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />
            {bodyPhotoPreview ? (
              <div className="relative w-48 mx-auto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={bodyPhotoPreview}
                  alt="Full body photo"
                  className="w-48 h-64 object-cover rounded-lg border border-border"
                />
                <button
                  onClick={removePhoto}
                  className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-foreground text-background flex items-center justify-center hover:bg-foreground/80 transition-colors"
                  aria-label="Remove photo"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
                {bodyPhotoUploading && (
                  <p className="mt-3 text-center font-body text-xs text-muted-foreground">
                    Uploading…
                  </p>
                )}
                {bodyPhotoError && (
                  <p className="mt-3 text-center font-body text-xs text-destructive">
                    {bodyPhotoError}
                  </p>
                )}
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-md border-2 border-dashed border-border py-10 font-body text-base font-medium flex flex-col items-center justify-center gap-2 hover:border-foreground/30 transition-colors"
              >
                <UploadIcon className="h-5 w-5 text-muted-foreground" />
                <span>Upload Photo</span>
                <span className="text-xs text-muted-foreground">JPG, PNG up to 20MB</span>
              </button>
            )}
          </div>
        )}

        {/* Step 23: How did you hear about us? */}
        {step === 23 && (
          <div className="flex-1 flex flex-col">
            <h2 className="font-display text-3xl mb-1">How did you hear about us?</h2>
            <p className="font-body text-base text-muted-foreground mb-6">Please select one answer</p>
            <div className="flex flex-wrap gap-2.5">
              {hearAboutUsOptions.map((opt) => (
                <button
                  key={opt}
                  onClick={() => {
                    setHearAboutUs(opt);
                    if (opt !== "Other") setHearAboutUsOther("");
                  }}
                  className={cn(
                    "rounded-md border-2 px-5 py-2.5 font-body text-base transition-colors flex items-center gap-2",
                    hearAboutUs === opt
                      ? "border-foreground bg-foreground/5"
                      : "border-border hover:border-foreground/30",
                  )}
                >
                  {hearAboutUs === opt && <CheckIcon className="h-3.5 w-3.5 text-foreground" />}
                  {opt}
                </button>
              ))}
            </div>
            {hearAboutUs === "Other" && (
              <input
                type="text"
                value={hearAboutUsOther}
                onChange={(e) => setHearAboutUsOther(e.target.value)}
                placeholder="Please specify"
                className="mt-4 border-b border-border py-3 font-body text-base focus:outline-none focus:border-foreground transition-colors"
              />
            )}
          </div>
        )}

        {/* Step 24: Phone */}
        {step === 24 && (
          <div className="flex-1 flex flex-col">
            <h2 className="font-display text-3xl mb-6">
              Please add your phone number to get text messages when your board is ready.
            </h2>
            <p className="font-body text-base text-muted-foreground mb-4">
              You can skip this question if you&apos;d prefer
            </p>
            <div className="flex border border-border rounded-md overflow-hidden">
              <div className="flex items-center gap-1.5 px-3 border-r border-border bg-muted/30">
                <span className="text-base">🇺🇸</span>
                <select
                  value={phoneCountryCode}
                  onChange={(e) => setPhoneCountryCode(e.target.value)}
                  className="font-body text-base bg-transparent focus:outline-none appearance-none pr-4 cursor-pointer"
                  aria-label="Country code"
                >
                  <option value="+1">+1</option>
                  <option value="+44">+44</option>
                  <option value="+972">+972</option>
                  <option value="+61">+61</option>
                  <option value="+33">+33</option>
                  <option value="+49">+49</option>
                  <option value="+39">+39</option>
                  <option value="+34">+34</option>
                  <option value="+81">+81</option>
                  <option value="+86">+86</option>
                  <option value="+91">+91</option>
                  <option value="+55">+55</option>
                  <option value="+52">+52</option>
                </select>
              </div>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder=""
                className="flex-1 px-4 py-3 font-body text-base focus:outline-none"
                aria-label="Phone number"
              />
            </div>
            <p className="font-body text-xs text-muted-foreground mt-3">
              By providing your phone number, you consent to receive SMS notifications whenever a new look from your stylist is available.
            </p>
          </div>
        )}

        {/* Step 25: Confirm email */}
        {step === 25 && (
          <div className="flex-1 flex flex-col">
            <h2 className="font-display text-3xl mb-6">
              Last step! Please confirm this is your preferred email address.
            </h2>
            <input
              type="email"
              value={preferredEmail}
              onChange={(e) => setPreferredEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full rounded-lg border border-border bg-card px-4 py-4 font-body text-base focus:outline-none focus:border-foreground transition-colors"
            />
            {submitError && (
              <p className="mt-3 font-body text-base text-destructive">{submitError}</p>
            )}
          </div>
        )}
      </div>

      {/* Bottom CTA */}
      <div className="border-t border-border px-4 py-4">
        <div className="max-w-lg mx-auto">
          {step === 25 ? (
            <button
              onClick={finish}
              disabled={submitting}
              className={cn(
                "w-full rounded-md py-4 font-body text-base font-medium transition-colors",
                submitting
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-foreground text-background hover:bg-foreground/90",
              )}
            >
              {submitting ? "Saving…" : finalCtaLabel}
            </button>
          ) : step === 0 ? null : (
            <div className="flex gap-3">
              {skippableSteps.includes(step) && (
                <button
                  onClick={next}
                  className="flex-1 rounded-md border-2 border-foreground py-3.5 font-body text-base font-medium hover:bg-muted/50 transition-colors"
                >
                  Skip
                </button>
              )}
              <button
                onClick={next}
                disabled={!canNext()}
                className={cn(
                  "flex-1 rounded-md py-3.5 font-body text-base font-medium transition-colors",
                  canNext()
                    ? "bg-foreground text-background hover:bg-foreground/90"
                    : "bg-muted text-muted-foreground cursor-not-allowed",
                )}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Small composition helpers ─── */

function SizeRow({
  label,
  options,
  value,
  set,
  prefix,
}: {
  label: string;
  options: string[];
  value: string[];
  set: (v: string[]) => void;
  prefix: string;
}) {
  const toggle = (s: string) =>
    set(value.includes(s) ? value.filter((x) => x !== s) : [...value, s]);
  return (
    <div>
      <p className="font-body text-sm uppercase tracking-widest text-muted-foreground mb-2.5">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((s) => (
          <button
            key={`${prefix}-${s}`}
            onClick={() => toggle(s)}
            className={cn(
              "rounded-md border-2 px-4 py-2 font-body text-base transition-colors flex items-center gap-1.5",
              value.includes(s)
                ? "border-foreground bg-foreground/5"
                : "border-border hover:border-foreground/30",
            )}
          >
            {value.includes(s) && <CheckIcon className="h-3.5 w-3.5 text-foreground" />}
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function SingleSelectStep({
  heading,
  subheading,
  options,
  value,
  onPick,
}: {
  heading: string;
  subheading: string;
  options: string[];
  value: string | null;
  onPick: (v: string) => void;
}) {
  return (
    <div className="flex-1 flex flex-col">
      <h2 className="font-display text-3xl mb-1">{heading}</h2>
      <p className="font-body text-base text-muted-foreground mb-6">{subheading}</p>
      <div className="flex flex-wrap gap-2.5">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onPick(o)}
            className={cn(
              "rounded-md border-2 px-5 py-2.5 font-body text-base transition-colors flex items-center gap-2",
              value === o
                ? "border-foreground bg-foreground/5"
                : "border-border hover:border-foreground/30",
            )}
          >
            {value === o && <CheckIcon className="h-3.5 w-3.5 text-foreground" />}
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChipMultiSelectStep({
  heading,
  subheading,
  options,
  value,
  onToggle,
}: {
  heading: string;
  subheading: string;
  options: string[];
  value: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="flex-1 flex flex-col">
      <h2 className="font-display text-3xl mb-1">{heading}</h2>
      <p className="font-body text-base text-muted-foreground mb-6">{subheading}</p>
      <div className="flex flex-wrap gap-2.5">
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onToggle(o)}
            className={cn(
              "rounded-md border-2 px-5 py-2.5 font-body text-base transition-colors flex items-center gap-2",
              value.includes(o)
                ? "border-foreground bg-foreground/5"
                : "border-border hover:border-foreground/30",
            )}
          >
            {value.includes(o) && <CheckIcon className="h-3.5 w-3.5 text-foreground" />}
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function CityAutocomplete({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => filterCities(value), [value]);

  // Close when clicking outside.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Clamp at render time so a stale highlight (matches list just shrank)
  // doesn't fall out of bounds. Synthesised value — no extra useEffect needed.
  const safeHighlight =
    matches.length === 0 ? 0 : Math.min(highlight, matches.length - 1);

  const select = (formatted: string) => {
    onChange(formatted);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || matches.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight(Math.min(matches.length - 1, safeHighlight + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight(Math.max(0, safeHighlight - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            select(formatCity(matches[safeHighlight]));
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="For example: New York"
        autoComplete="off"
        className="w-full border-b border-border py-3 font-body text-base focus:outline-none focus:border-foreground transition-colors"
      />
      {open && matches.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full mt-2 max-h-72 overflow-y-auto rounded-md border border-border bg-white shadow-lg z-10"
        >
          {matches.map((c, i) => {
            const formatted = formatCity(c);
            const isHighlighted = i === safeHighlight;
            return (
              <li
                key={formatted}
                role="option"
                aria-selected={isHighlighted}
                onMouseDown={(e) => {
                  // mousedown (not click) so the input doesn't blur first.
                  e.preventDefault();
                  select(formatted);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  "px-4 py-3 font-body text-base cursor-pointer",
                  isHighlighted ? "bg-muted/60" : "hover:bg-muted/40",
                )}
              >
                <span className="font-medium">{c.name}</span>
                <span className="text-muted-foreground">, {c.country}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
}

function humanizeError(
  code: "unauthenticated" | "session_not_found" | "invalid_payload" | "internal",
): string {
  switch (code) {
    case "unauthenticated":
      return "Your session expired. Please sign in again.";
    case "session_not_found":
      return "We couldn't find your styling session. Please refresh and try again.";
    case "invalid_payload":
      return "Some of your answers didn't look right. Please review and try again.";
    case "internal":
      return "Something went wrong saving your quiz. Please try again.";
  }
}
