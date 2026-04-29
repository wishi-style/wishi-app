"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import Image from "next/image";
import {
  ChevronLeftIcon,
  SunIcon,
  BriefcaseIcon,
  SparklesIcon,
  Trash2Icon,
  PartyPopperIcon,
  PlaneIcon,
  PalmtreeIcon,
  LightbulbIcon,
  MoreHorizontalIcon,
  CheckIcon,
  HeartIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { submitMatchQuiz } from "./actions";

const stepLabels = ["NEEDS", "DEPARTMENT", "BODY TYPE", "STYLE"] as const;

const needsOptions: { label: string; icon: LucideIcon }[] = [
  { label: "Seasonal Refresh", icon: SunIcon },
  { label: "Elevated Everyday", icon: SparklesIcon },
  { label: "Unique Workwear", icon: BriefcaseIcon },
  { label: "Closet Cleanout", icon: Trash2Icon },
  { label: "Special Event", icon: PartyPopperIcon },
  { label: "Travel Outfits", icon: PlaneIcon },
  { label: "Vacation Outfits", icon: PalmtreeIcon },
  { label: "Inspiration", icon: LightbulbIcon },
  { label: "Other", icon: MoreHorizontalIcon },
];

const bodyTypeOptions = [
  "Fit",
  "Average",
  "Curvy",
  "Plus Size",
  "Petite",
  "Tall",
  "Expecting",
  "Postpartum",
];

const styleBoards = [
  { name: "Minimal", board: "/img/style-minimal.png" },
  { name: "Feminine", board: "/img/style-feminine.png" },
  { name: "Chic", board: "/img/style-chic.png" },
  { name: "Classic", board: "/img/style-classic.png" },
  { name: "Bohemian", board: "/img/style-bohemian.png" },
  { name: "Street", board: "/img/style-street.png" },
  { name: "Sexy", board: "/img/style-sexy.png" },
] as const;

const menStyleBoards = [
  { name: "Streetwear", board: "/img/men-streetwear.png" },
  { name: "Rugged", board: "/img/men-rugged.png" },
  { name: "Edgy", board: "/img/men-edgy.png" },
  { name: "Cool", board: "/img/men-cool.png" },
  { name: "Elegant", board: "/img/men-elegant.png" },
] as const;

function StepProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className="w-full max-w-xs mx-auto mb-12">
      <p className="text-xs tracking-[0.3em] text-center text-foreground/70 mb-4 uppercase">
        {stepLabels[current]}
      </p>
      <div className="flex items-center gap-1.5">
        {stepLabels.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-[2px] flex-1 rounded-full transition-all duration-700 ease-out",
              i <= current ? "bg-foreground" : "bg-foreground/15",
            )}
          />
        ))}
      </div>
      <p className="text-[10px] tracking-widest text-foreground/50 text-center mt-3">
        {current + 1} / {total}
      </p>
    </div>
  );
}

function StyleMoodBoard({ src, name }: { src: string; name: string }) {
  return (
    <div className="w-full max-w-[27rem] mx-auto overflow-hidden rounded-lg">
      <Image
        key={src}
        src={src}
        alt={`${name} style mood board`}
        width={432}
        height={432}
        priority
        className="w-full h-auto object-cover animate-in fade-in duration-300"
      />
    </div>
  );
}

function ChipStep({
  title,
  subtitle,
  options,
  selected,
  onToggle,
  onContinue,
  onSkip,
  hideSkip = false,
}: {
  title: string;
  subtitle?: string;
  options: string[];
  selected: string[];
  onToggle: (o: string) => void;
  onContinue: () => void;
  onSkip: () => void;
  hideSkip?: boolean;
}) {
  return (
    <>
      <h1 className="font-display text-3xl md:text-4xl text-center mb-2 max-w-2xl">
        {title}
      </h1>
      {subtitle && (
        <p className="text-sm text-muted-foreground mb-10">{subtitle}</p>
      )}

      <div className="flex flex-wrap justify-center gap-3 max-w-2xl mb-12">
        {options.map((option) => {
          const active = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => onToggle(option)}
              className={cn(
                "rounded-full border-2 px-6 py-3.5 text-sm transition-all duration-200",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-foreground/80 bg-transparent text-foreground hover:bg-foreground/5",
              )}
            >
              {option}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-4 w-full max-w-md">
        {selected.length > 0 && (
          <button
            type="button"
            onClick={onContinue}
            className="w-full rounded-full bg-foreground text-background py-4 text-sm hover:bg-foreground/90 transition-colors"
          >
            Continue
          </button>
        )}
        {!hideSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="w-full rounded-full border-2 border-foreground/80 text-foreground py-4 text-sm hover:bg-foreground/5 transition-colors"
          >
            Skip
          </button>
        )}
      </div>
    </>
  );
}

export function MatchQuizClient({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const { openSignUp } = useClerk();
  const [step, setStep] = useState(0);
  const [needs, setNeeds] = useState<string[]>([]);
  const [department, setDepartment] = useState<"WOMEN" | "MEN" | null>(null);
  const [bodyTypes, setBodyTypes] = useState<string[]>([]);
  const [styleIndex, setStyleIndex] = useState(0);
  const [stylePrefs, setStylePrefs] = useState<Record<string, string>>({});
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [otherNeed, setOtherNeed] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const toggleList = (list: string[], item: string) =>
    list.includes(item) ? list.filter((o) => o !== item) : [...list, item];

  const activeStyleBoards =
    department === "MEN" ? menStyleBoards : styleBoards;

  const goNext = () => setStep((s) => Math.min(s + 1, 3));
  const goBack = () => {
    if (step === 0) {
      router.back();
      return;
    }
    if (step === 3 && department === "MEN") {
      setStep(1);
      return;
    }
    setStep((s) => s - 1);
  };

  const finishOnboarding = (
    finalStylePrefs: Record<string, string> = stylePrefs,
  ) => {
    setSubmitError(null);

    const likedStyles = Object.entries(finalStylePrefs)
      .filter(([, vote]) => vote === "LOVE IT" || vote === "SOMETIMES")
      .map(([style]) => style);

    const answers: Record<string, unknown> = {
      gender_to_style:
        department === "WOMEN"
          ? "FEMALE"
          : department === "MEN"
            ? "MALE"
            : null,
      style_direction: likedStyles,
      occasion: needs[0] ?? null,
      // bonus context — lands in rawAnswers via persistMatchQuizAnswers
      needs,
      other_need: needs.includes("Other") ? otherNeed.trim() : null,
      body_types: bodyTypes,
      style_votes: finalStylePrefs,
    };

    startTransition(async () => {
      try {
        const result = await submitMatchQuiz(answers);
        if (result.signedIn) {
          router.push("/stylist-match");
          return;
        }
        // Guest — open Clerk's modal sign-up. The guestToken in unsafeMetadata
        // tells the user.created webhook to claim the MatchQuizResult row.
        openSignUp({
          unsafeMetadata: { guestToken: result.guestToken },
          forceRedirectUrl: "/stylist-match",
        });
      } catch (err) {
        setSubmitError(
          err instanceof Error
            ? err.message
            : "Couldn't save your answers — try again",
        );
      }
    });
  };

  const handleStyleVote = (vote: string) => {
    if (selectedVote || isPending) return;
    setSelectedVote(vote);
    const styleName = activeStyleBoards[styleIndex].name;
    setTimeout(() => {
      const updated = { ...stylePrefs, [styleName]: vote };
      setStylePrefs(updated);
      setSelectedVote(null);

      if (styleIndex < activeStyleBoards.length - 1) {
        setStyleIndex((i) => i + 1);
      } else {
        finishOnboarding(updated);
      }
    }, 500);
  };

  // signedIn is unused in render today but kept on the API so the page
  // server-component can pass auth state and we can branch on it later
  // (e.g. show "Welcome back" copy for returning logged-in users).
  void signedIn;

  return (
    <div className="relative flex flex-col items-center px-4 py-12 md:py-20">
      {step > 0 && (
        <button
          type="button"
          onClick={goBack}
          className="absolute top-6 left-4 md:left-8 inline-flex items-center gap-1 text-sm text-foreground hover:text-foreground/70 transition-colors z-20"
        >
          <ChevronLeftIcon className="h-4 w-4" />
          Back
        </button>
      )}

      <StepProgress current={step} total={4} />

      {step === 0 && (
        <>
          <h1 className="font-display text-3xl md:text-4xl text-center mb-2 max-w-xl">
            Let&apos;s find your perfect style match
          </h1>
          <p className="text-sm text-muted-foreground mb-10">
            Tell us what you&apos;re after — we&apos;ll handle the rest.
          </p>

          <div className="flex flex-wrap justify-center gap-3 max-w-2xl w-full mb-8">
            {needsOptions.map(({ label, icon: Icon }) => {
              const active = needs.includes(label);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setNeeds(toggleList(needs, label))}
                  className={cn(
                    "rounded-full border-2 px-6 py-3.5 text-sm transition-all duration-200 inline-flex items-center gap-2",
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/80 bg-transparent text-foreground hover:bg-foreground/5",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      active ? "text-background" : "text-foreground",
                    )}
                  />
                  {label}
                </button>
              );
            })}
          </div>

          {needs.includes("Other") && (
            <div className="w-full max-w-md mb-8">
              <input
                type="text"
                autoFocus
                value={otherNeed}
                onChange={(e) => setOtherNeed(e.target.value)}
                placeholder="Tell us what you're looking for…"
                className="w-full rounded-full border-2 border-foreground/80 bg-transparent px-6 py-3.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:border-foreground transition-colors"
              />
            </div>
          )}

          <div className="flex flex-col items-center gap-4 w-full max-w-md">
            {needs.length > 0 ? (
              <button
                type="button"
                onClick={goNext}
                className="w-full rounded-full bg-foreground text-background py-4 text-sm hover:bg-foreground/90 transition-colors"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                className="w-full rounded-full border-2 border-foreground/80 text-foreground py-4 text-sm hover:bg-foreground/5 transition-colors"
              >
                Skip
              </button>
            )}
          </div>
        </>
      )}

      {step === 1 && (
        <>
          <h1 className="font-display text-3xl md:text-4xl text-center mb-2 max-w-xl">
            Great! We have a perfect plan for your needs.
          </h1>
          <p className="text-sm text-muted-foreground mb-10">
            What&apos;s your preferred shopping department?
          </p>

          <div className="flex flex-col sm:flex-row gap-4 max-w-md w-full">
            {(["WOMEN", "MEN"] as const).map((value) => {
              const label = value === "WOMEN" ? "Women" : "Men";
              const active = department === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setDepartment(value);
                    setStyleIndex(0);
                    // Reset department-dependent state so a Women → Back →
                    // Men switch doesn't leak women's body_types or style
                    // votes into the MEN submission. Loveable has the same
                    // latent bug but doesn't persist the result.
                    setBodyTypes([]);
                    setStylePrefs({});
                    try {
                      localStorage.setItem("wishi_department", value);
                    } catch {
                      // localStorage unavailable (private mode, etc.) — proceed silently.
                    }
                    setStep(value === "MEN" ? 3 : 2);
                  }}
                  className={cn(
                    "flex-1 rounded-full border-2 py-6 font-body text-lg font-normal tracking-wide transition-all duration-200",
                    active
                      ? "border-foreground bg-foreground text-background"
                      : "border-foreground/80 bg-transparent text-foreground hover:bg-foreground hover:text-background",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </>
      )}

      {step === 2 && (
        <ChipStep
          title="As stylists, we&apos;ve mastered how to fit every body type. Let&apos;s help you look and feel great!"
          subtitle="Check any that apply:"
          options={bodyTypeOptions}
          selected={bodyTypes}
          onToggle={(o) => setBodyTypes(toggleList(bodyTypes, o))}
          onContinue={goNext}
          onSkip={goNext}
          hideSkip={bodyTypes.length > 0}
        />
      )}

      {step === 3 && (
        <>
          <h1 className="font-display text-2xl md:text-3xl text-center mb-6 transition-opacity duration-300">
            Do you like {activeStyleBoards[styleIndex].name} style?
          </h1>

          <StyleMoodBoard
            src={activeStyleBoards[styleIndex].board}
            name={activeStyleBoards[styleIndex].name}
          />

          <div className="flex items-center justify-center gap-10 mt-6">
            {(["LOVE IT", "SOMETIMES", "NO"] as const).map((vote) => {
              const isSelected = selectedVote === vote;
              const isLove = vote === "LOVE IT";
              const isNo = vote === "NO";
              return (
                <button
                  key={vote}
                  type="button"
                  onClick={() => handleStyleVote(vote)}
                  className="group flex flex-col items-center gap-2"
                  disabled={!!selectedVote || isPending}
                  aria-label={`${vote} for ${activeStyleBoards[styleIndex].name}`}
                >
                  <div
                    className={cn(
                      "h-10 w-10 rounded-full border-2 transition-all duration-300 ease-out flex items-center justify-center",
                      isSelected && isLove
                        ? "border-destructive bg-destructive scale-125"
                        : isSelected && isNo
                          ? "border-foreground/40 bg-foreground/10 scale-95"
                          : isSelected
                            ? "border-foreground bg-foreground scale-110"
                            : "border-foreground/60 group-hover:border-foreground group-hover:bg-foreground/10",
                    )}
                  >
                    {isSelected && isLove && (
                      <HeartIcon className="h-4 w-4 text-destructive-foreground fill-current" />
                    )}
                    {isSelected && isNo && (
                      <XIcon className="h-4 w-4 text-foreground/50" />
                    )}
                    {isSelected && !isLove && !isNo && (
                      <CheckIcon className="h-4 w-4 text-background" />
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-xs tracking-wider transition-colors duration-300",
                      isSelected && isLove
                        ? "text-destructive"
                        : isSelected && isNo
                          ? "text-foreground/40"
                          : isSelected
                            ? "text-foreground"
                            : "text-foreground/80 group-hover:text-foreground",
                    )}
                  >
                    {vote}
                  </span>
                </button>
              );
            })}
          </div>

          {(isPending || submitError) && (
            <p
              className={cn(
                "mt-4 text-xs",
                submitError ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {submitError ?? "Saving your answers…"}
            </p>
          )}
        </>
      )}
    </div>
  );
}
