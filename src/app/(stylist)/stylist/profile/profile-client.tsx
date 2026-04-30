"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { StylistLayout } from "@/components/stylist/StylistLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { CameraIcon, CheckIcon, CheckCircle2Icon, CircleIcon, CloudOffIcon, ImagePlusIcon, Loader2Icon, PencilIcon, PlusIcon, XIcon } from "lucide-react";

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}
import { LookLibraryPicker } from "@/components/stylist/LookLibraryPicker";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

const STORAGE_KEY = "stylist_profile_v1";
const DRAFT_KEY = "stylist_profile_draft_v1";
const DRAFT_TS_KEY = "stylist_profile_draft_ts_v1";

const WOMEN_STYLES = [
  "Classic",
  "Minimal",
  "Romantic",
  "Edgy",
  "Bohemian",
  "Streetwear",
  "Preppy",
  "Glam",
];

const MEN_STYLES = [
  "Classic",
  "Minimal",
  "Smart Casual",
  "Streetwear",
  "Rugged",
  "Preppy",
  "Athleisure",
  "Tailored",
];

interface StyleBoardEntry {
  style: string;
  imageUrl: string;
}

interface StylistProfileData {
  fullName: string;
  location: string;
  profilePic: string;
  moodBoardImage: string;
  philosophy: string;
  directorsPick: string;
  bio: string;
  instagram: string;
  womenBoards: StyleBoardEntry[];
  menBoards: StyleBoardEntry[];
}

const emptyProfile: StylistProfileData = {
  fullName: "",
  location: "",
  profilePic: "",
  moodBoardImage: "",
  philosophy: "",
  directorsPick: "",
  bio: "",
  instagram: "",
  womenBoards: [],
  menBoards: [],
};

function loadProfile(): StylistProfileData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StylistProfileData;
  } catch {
    return null;
  }
}

function loadDraft(): { data: StylistProfileData; savedAt: Date } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as StylistProfileData;
    const tsRaw = localStorage.getItem(DRAFT_TS_KEY);
    const savedAt = tsRaw ? new Date(tsRaw) : new Date();
    return { data, savedAt };
  } catch {
    return null;
  }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
  localStorage.removeItem(DRAFT_TS_KEY);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// ===== Image validation =====
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const SQUARE_TOLERANCE = 0.02; // 2%

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = dataUrl;
  });
}

async function validateAndReadImage(
  file: File,
  opts: { requireSquare?: boolean; label?: string } = {}
): Promise<string | null> {
  const label = opts.label ?? "Image";
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    toast.error(`${label}: only JPG, PNG or WEBP are allowed`);
    return null;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    toast.error(`${label}: file must be under 5 MB`);
    return null;
  }
  const dataUrl = await fileToDataUrl(file);
  try {
    const { width, height } = await getImageDimensions(dataUrl);
    if (width < 400 || height < 400) {
      toast.error(`${label}: minimum size is 400×400 pixels`);
      return null;
    }
    if (opts.requireSquare) {
      const ratio = Math.abs(width - height) / Math.max(width, height);
      if (ratio > SQUARE_TOLERANCE) {
        toast.error(`${label}: must be a square image (got ${width}×${height})`);
        return null;
      }
    }
  } catch {
    toast.error(`${label}: could not read image`);
    return null;
  }
  return dataUrl;
}

export default function StylistProfile(props: { initialProfile?: StylistProfileData | null } = {}) {
  const router = useRouter();
  const existing = useMemo(
    () => loadProfile() ?? props.initialProfile ?? null,
    [props.initialProfile],
  );
  const draft = useMemo(() => loadDraft(), []);
  const isCreating = !existing;
  // Restore the most recent unsaved draft if there is one; otherwise the
  // published profile; otherwise empty.
  const initialData: StylistProfileData = draft?.data ?? existing ?? emptyProfile;
  // Open in edit mode when there's no published profile yet, OR when an
  // unsaved draft exists from a previous visit.
  const initialEditing = isCreating || !!draft;

  const [editing, setEditing] = useState<boolean>(initialEditing);
  const [data, setData] = useState<StylistProfileData>(initialData);
  const [genderTab, setGenderTab] = useState<"women" | "men">("women");

  // Auto-save state
  type SaveStatus = "idle" | "saving" | "saved" | "error";
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(
    draft?.savedAt ?? (existing ? new Date() : null)
  );
  const [draftRestored, setDraftRestored] = useState<boolean>(!!draft);
  const isFirstRun = useRef(true);
  const savedTimerRef = useRef<number | null>(null);

  // file refs
  const profilePicRef = useRef<HTMLInputElement>(null);
  const moodBoardRef = useRef<HTMLInputElement>(null);

  // Debounced auto-save while editing
  useEffect(() => {
    if (!editing) return;
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaveStatus("saving");
    const handle = window.setTimeout(() => {
      try {
        const now = new Date();
        localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
        localStorage.setItem(DRAFT_TS_KEY, now.toISOString());
        setLastSavedAt(now);
        setSaveStatus("saved");
        if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
        savedTimerRef.current = window.setTimeout(() => setSaveStatus("idle"), 2000);
      } catch {
        setSaveStatus("error");
      }
    }, 800);
    return () => window.clearTimeout(handle);
  }, [data, editing]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    };
  }, []);

  const update = <K extends keyof StylistProfileData>(key: K, value: StylistProfileData[K]) => {
    setData((d) => ({ ...d, [key]: value }));
  };

  const handleImage = async (
    e: React.ChangeEvent<HTMLInputElement>,
    onLoaded: (url: string) => void,
    opts: { requireSquare?: boolean; label?: string } = {}
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const url = await validateAndReadImage(file, opts);
    if (url) onLoaded(url);
  };

  const handleAddStyleBoardFromLibrary = (
    gender: "women" | "men",
    style: string,
    look: { id: string; name: string; imageUrl: string }
  ) => {
    setData((d) => {
      const key = gender === "women" ? "womenBoards" : "menBoards";
      const list = d[key].filter((b) => b.style !== style);
      return { ...d, [key]: [...list, { style, imageUrl: look.imageUrl }] };
    });
    toast.success(`"${look.name}" added to ${style}`);
  };

  const removeStyleBoard = (gender: "women" | "men", style: string) => {
    setData((d) => {
      const key = gender === "women" ? "womenBoards" : "menBoards";
      return { ...d, [key]: d[key].filter((b) => b.style !== style) };
    });
  };

  type FieldKey =
    | "fullName"
    | "location"
    | "profilePic"
    | "moodBoardImage"
    | "philosophy"
    | "directorsPick"
    | "bio"
    | "instagram";

  const [submitAttempted, setSubmitAttempted] = useState(false);

  const validateAll = (): Partial<Record<FieldKey, string>> => {
    const errors: Partial<Record<FieldKey, string>> = {};
    if (!data.fullName.trim()) errors.fullName = "Full name is required";
    else if (data.fullName.trim().length > 80)
      errors.fullName = "Keep it under 80 characters";
    if (!data.location.trim()) errors.location = "Location is required";
    else if (data.location.trim().length > 80)
      errors.location = "Keep it under 80 characters";
    if (!data.profilePic) errors.profilePic = "Profile picture is required";
    if (!data.moodBoardImage) errors.moodBoardImage = "Mood board image is required";
    if (!data.philosophy.trim()) errors.philosophy = "Philosophy is required";
    else if (data.philosophy.trim().length > 500)
      errors.philosophy = "Keep it under 500 characters";
    if (!data.directorsPick.trim())
      errors.directorsPick = "Style Director's Pick is required";
    else if (data.directorsPick.trim().length > 500)
      errors.directorsPick = "Keep it under 500 characters";
    if (!data.bio.trim()) errors.bio = "Bio is required";
    else if (data.bio.trim().length > 1000)
      errors.bio = "Keep it under 1000 characters";
    if (data.instagram.trim()) {
      try {
        const u = new URL(data.instagram.trim());
        if (!/instagram\.com$/i.test(u.hostname) && !/\.instagram\.com$/i.test(u.hostname))
          errors.instagram = "Must be an instagram.com link";
      } catch {
        errors.instagram = "Enter a valid URL (https://instagram.com/…)";
      }
    }
    return errors;
  };

  const errors = validateAll();
  const errorCount = Object.keys(errors).length;
  // Only surface errors after the first submit attempt
  const visibleErrors: Partial<Record<FieldKey, string>> = submitAttempted ? errors : {};

  const handleSave = () => {
    setSubmitAttempted(true);
    if (errorCount > 0) {
      toast.error(
        errorCount === 1
          ? "Please fix 1 field before saving"
          : `Please fix ${errorCount} fields before saving`
      );
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    clearDraft();
    setDraftRestored(false);
    toast.success(isCreating ? "Profile created" : "Profile updated");
    setEditing(false);
    setSubmitAttempted(false);
  };

  const handleCancel = () => {
    clearDraft();
    setDraftRestored(false);
    if (isCreating) {
      router.push("/stylist/dashboard");
      return;
    }
    setData(existing ?? emptyProfile);
    setEditing(false);
  };

  const handleDiscardDraft = () => {
    clearDraft();
    setDraftRestored(false);
    setData(existing ?? emptyProfile);
    setLastSavedAt(existing ? new Date() : null);
    isFirstRun.current = true; // suppress immediate auto-save re-trigger
    if (!existing) router.push("/stylist/dashboard");
    toast.success("Draft discarded");
  };

  // ===== VIEW MODE =====
  if (!editing && !isCreating) {
    return (
      <StylistLayout>
        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-8 sm:py-12">
          <div className="flex items-start justify-between gap-4 mb-8">
            <div>
              <h1 className="font-display text-3xl sm:text-4xl tracking-tight">My Profile</h1>
              <p className="text-sm text-muted-foreground mt-1 font-body">
                How clients see you on Wishi
              </p>
            </div>
            <Button onClick={() => setEditing(true)} variant="outline" className="gap-2">
              <PencilIcon className="h-4 w-4" /> Edit profile
            </Button>
          </div>

          {/* Hero: mood board + identity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            <div className="aspect-square w-full overflow-hidden rounded-md border border-border bg-muted">
              {data.moodBoardImage && (
                <Image
                  src={data.moodBoardImage}
                  alt={`${data.fullName} mood board`}
                  width={800}
                  height={800}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="flex flex-col justify-center">
              <Avatar className="h-24 w-24 mb-4">
                <AvatarImage src={data.profilePic} alt={data.fullName} />
                <AvatarFallback className="font-display text-xl">
                  {data.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                </AvatarFallback>
              </Avatar>
              <h2 className="font-display text-2xl sm:text-3xl">{data.fullName}</h2>
              <p className="text-sm text-muted-foreground font-body mt-1">{data.location}</p>
              {data.instagram && (
                <a
                  href={data.instagram}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-body mt-3 text-accent hover:underline"
                >
                  <InstagramIcon className="h-4 w-4" /> Instagram
                </a>
              )}
            </div>
          </div>

          {/* Text sections */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <ProfileTextBlock label="Philosophy" value={data.philosophy} />
            <ProfileTextBlock label="Style Director's Pick" value={data.directorsPick} />
            <ProfileTextBlock label="Bio" value={data.bio} />
          </div>

          {/* Style boards */}
          <section>
            <h3 className="font-display text-xl mb-4">Style boards</h3>
            <Tabs value={genderTab} onValueChange={(v) => setGenderTab(v as "women" | "men")}>
              <TabsList>
                <TabsTrigger value="women">Women ({data.womenBoards.length})</TabsTrigger>
                <TabsTrigger value="men">Men ({data.menBoards.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="women" className="mt-6">
                <StyleBoardGrid boards={data.womenBoards} />
              </TabsContent>
              <TabsContent value="men" className="mt-6">
                <StyleBoardGrid boards={data.menBoards} />
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </StylistLayout>
    );
  }

  // ===== EDIT / CREATE MODE =====
  return (
    <StylistLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8 sm:py-12">
        <div className="mb-8">
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight">
            {isCreating ? "Build your stylist profile" : "Edit your profile"}
          </h1>
          <p className="text-sm text-muted-foreground mt-2 font-body max-w-2xl">
            This is what clients see when they discover you on Wishi. Keep it expressive and on-brand.
          </p>
        </div>

        {draftRestored && (
          <div className="mb-6 rounded-md border border-border bg-secondary/50 p-4 flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row">
            <div className="flex items-start gap-3">
              <CheckCircle2Icon className="h-5 w-5 text-accent shrink-0 mt-0.5" />
              <div>
                <p className="font-body text-sm">
                  We restored your unsaved draft
                  {lastSavedAt
                    ? ` from ${lastSavedAt.toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}`
                    : ""}
                  .
                </p>
                <p className="font-body text-xs text-muted-foreground mt-0.5">
                  Keep editing or discard to start over.
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDiscardDraft}
              className="font-body"
            >
              Discard draft
            </Button>
          </div>
        )}

        <ProfileChecklist data={data} className="mb-10" />

        <div className="space-y-10">
          {/* Identity */}
          <Section title="Identity">
            <div className="flex items-start gap-6 mb-6">
              <div className="relative">
                <Avatar
                  className={`h-24 w-24 ${visibleErrors.profilePic ? "ring-2 ring-destructive ring-offset-2 ring-offset-background" : ""}`}
                >
                  <AvatarImage src={data.profilePic} />
                  <AvatarFallback className="font-display text-lg bg-muted">
                    <CameraIcon className="h-6 w-6 text-muted-foreground" />
                  </AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  onClick={() => profilePicRef.current?.click()}
                  className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-foreground text-background flex items-center justify-center border-2 border-background"
                  aria-label="Upload profile picture"
                >
                  <CameraIcon className="h-4 w-4" />
                </button>
                <input
                  ref={profilePicRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) =>
                    handleImage(e, (url) => update("profilePic", url), {
                      requireSquare: true,
                      label: "Profile picture",
                    })
                  }
                />
                {visibleErrors.profilePic && (
                  <p className="font-body text-xs text-destructive mt-2 w-32" role="alert">
                    {visibleErrors.profilePic}
                  </p>
                )}
              </div>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Full name" required error={visibleErrors.fullName}>
                  <Input
                    value={data.fullName}
                    onChange={(e) => update("fullName", e.target.value)}
                    placeholder="e.g. Mika Kowalski"
                    aria-invalid={!!visibleErrors.fullName}
                    maxLength={80}
                  />
                </Field>
                <Field label="Location" required error={visibleErrors.location}>
                  <Input
                    value={data.location}
                    onChange={(e) => update("location", e.target.value)}
                    placeholder="City, Country"
                    aria-invalid={!!visibleErrors.location}
                    maxLength={80}
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field
                    label="Instagram link"
                    hint="Optional"
                    error={visibleErrors.instagram}
                  >
                    <div className="relative">
                      <InstagramIcon className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={data.instagram}
                        onChange={(e) => update("instagram", e.target.value)}
                        placeholder="https://instagram.com/yourhandle"
                        className="pl-9"
                        aria-invalid={!!visibleErrors.instagram}
                      />
                    </div>
                  </Field>
                </div>
              </div>
            </div>
          </Section>

          {/* Mood board */}
          <Section
            title="Mood board"
            description="A square image collage that captures your aesthetic universe."
          >
            <button
              type="button"
              onClick={() => moodBoardRef.current?.click()}
              aria-invalid={!!visibleErrors.moodBoardImage}
              className={`aspect-square w-full max-w-md mx-auto block rounded-md border-2 border-dashed bg-muted/30 hover:bg-muted/50 transition-colors overflow-hidden relative group ${
                visibleErrors.moodBoardImage ? "border-destructive" : "border-border"
              }`}
            >
              {data.moodBoardImage ? (
                <>
                  <Image
                    src={data.moodBoardImage}
                    alt="Mood board"
                    width={800}
                    height={800}
                    unoptimized
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/40 transition-colors flex items-center justify-center">
                    <span className="opacity-0 group-hover:opacity-100 text-background font-body text-sm flex items-center gap-2">
                      <ImagePlusIcon className="h-4 w-4" /> Replace image
                    </span>
                  </div>
                </>
              ) : (
                <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground">
                  <ImagePlusIcon className="h-8 w-8 mb-2" />
                  <span className="font-body text-sm">Upload square mood board</span>
                  <span className="font-body text-xs mt-1">JPG, PNG or WEBP · square · max 5 MB</span>
                </div>
              )}
            </button>
            <input
              ref={moodBoardRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) =>
                handleImage(e, (url) => update("moodBoardImage", url), {
                  requireSquare: true,
                  label: "Mood board",
                })
              }
            />
            {visibleErrors.moodBoardImage && (
              <p className="font-body text-xs text-destructive mt-2 text-center" role="alert">
                {visibleErrors.moodBoardImage}
              </p>
            )}
          </Section>

          {/* Voice */}
          <Section title="Your Bio">
            <div className="space-y-4">
              <Field label="Philosophy" required error={visibleErrors.philosophy}>
                <Textarea
                  value={data.philosophy}
                  onChange={(e) => update("philosophy", e.target.value)}
                  rows={3}
                  placeholder="What you stand for as a stylist."
                  aria-invalid={!!visibleErrors.philosophy}
                  maxLength={500}
                />
              </Field>
              <Field
                label="Style Director's Pick"
                required
                error={visibleErrors.directorsPick}
              >
                <Textarea
                  value={data.directorsPick}
                  onChange={(e) => update("directorsPick", e.target.value)}
                  rows={3}
                  placeholder="A signature look or item you'd recommend right now."
                  aria-invalid={!!visibleErrors.directorsPick}
                  maxLength={500}
                />
              </Field>
              <Field label="Bio" required error={visibleErrors.bio}>
                <Textarea
                  value={data.bio}
                  onChange={(e) => update("bio", e.target.value)}
                  rows={5}
                  placeholder="A short bio about your background and approach."
                  aria-invalid={!!visibleErrors.bio}
                  maxLength={1000}
                />
              </Field>
            </div>
          </Section>

          {/* Style boards */}
          <Section
            title="Style boards"
            description="Add a board image for each style you cover, for both Women and Men."
          >
            <Tabs value={genderTab} onValueChange={(v) => setGenderTab(v as "women" | "men")}>
              <TabsList>
                <TabsTrigger value="women">Women</TabsTrigger>
                <TabsTrigger value="men">Men</TabsTrigger>
              </TabsList>
              <TabsContent value="women" className="mt-6">
                <StyleBoardEditor
                  gender="women"
                  styles={WOMEN_STYLES}
                  boards={data.womenBoards}
                  onPickFromLibrary={handleAddStyleBoardFromLibrary}
                  onRemove={removeStyleBoard}
                />
              </TabsContent>
              <TabsContent value="men" className="mt-6">
                <StyleBoardEditor
                  gender="men"
                  styles={MEN_STYLES}
                  boards={data.menBoards}
                  onPickFromLibrary={handleAddStyleBoardFromLibrary}
                  onRemove={removeStyleBoard}
                />
              </TabsContent>
            </Tabs>
          </Section>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 pt-4 border-t border-border flex-col sm:flex-row">
            <SaveIndicator status={saveStatus} lastSavedAt={lastSavedAt} />
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={handleCancel}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                {isCreating ? "Create profile" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </StylistLayout>
  );
}

// ============== Subcomponents ==============

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="font-display text-xl">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground font-body mt-1">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  error,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="font-body text-sm flex items-center gap-2">
        {label}
        {required && <span className="text-destructive">*</span>}
        {hint && (
          <span className="text-xs text-muted-foreground font-normal">({hint})</span>
        )}
      </Label>
      {children}
      {error && (
        <p className="font-body text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function ProfileTextBlock({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5 bg-muted/30 border-border">
      <p className="font-body text-[10px] tracking-widest uppercase text-muted-foreground mb-2">
        {label}
      </p>
      <p className="font-body text-sm whitespace-pre-line leading-relaxed">{value}</p>
    </Card>
  );
}

function StyleBoardGrid({ boards }: { boards: StyleBoardEntry[] }) {
  if (boards.length === 0) {
    return (
      <p className="text-sm text-muted-foreground font-body py-8 text-center">
        No style boards added yet.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {boards.map((b) => (
        <div key={b.style} className="space-y-2">
          <div className="aspect-square overflow-hidden rounded-md border border-border bg-muted">
            <Image src={b.imageUrl} alt={b.style} width={400} height={400} unoptimized className="h-full w-full object-cover" />
          </div>
          <p className="font-body text-sm">{b.style}</p>
        </div>
      ))}
    </div>
  );
}

function StyleBoardEditor({
  gender,
  styles,
  boards,
  onPickFromLibrary,
  onRemove,
}: {
  gender: "women" | "men";
  styles: string[];
  boards: StyleBoardEntry[];
  onPickFromLibrary: (
    gender: "women" | "men",
    style: string,
    look: { id: string; name: string; imageUrl: string }
  ) => void;
  onRemove: (gender: "women" | "men", style: string) => void;
}) {
  const [pickerStyle, setPickerStyle] = useState<string | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {styles.map((style) => {
          const board = boards.find((b) => b.style === style);
          return (
            <div key={style} className="space-y-2">
              <button
                type="button"
                onClick={() => setPickerStyle(style)}
                aria-label={board ? `Replace ${style} look` : `Add ${style} look`}
                className="aspect-square w-full block rounded-md border-2 border-dashed border-border bg-muted/30 hover:bg-muted/50 transition-colors overflow-hidden relative cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {board ? (
                  <>
                    <Image
                      src={board.imageUrl}
                      alt={style}
                      width={400}
                      height={400}
                      unoptimized
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/40 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 text-background font-body text-xs">
                        Replace look
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground">
                    <PlusIcon className="h-5 w-5 mb-1" />
                    <span className="font-body text-xs">Add look</span>
                  </div>
                )}
              </button>
              {board && (
                <button
                  type="button"
                  onClick={() => onRemove(gender, style)}
                  className="font-body text-[11px] text-muted-foreground hover:text-destructive transition-colors inline-flex items-center gap-1"
                >
                  <XIcon className="h-3 w-3" /> Remove
                </button>
              )}
              <p className="font-body text-sm">{style}</p>
            </div>
          );
        })}
      </div>

      <LookLibraryPicker
        open={pickerStyle !== null}
        onOpenChange={(o) => !o && setPickerStyle(null)}
        contextLabel={pickerStyle ?? undefined}
        initialQuery={pickerStyle ?? ""}
        onSelect={(look) => {
          if (pickerStyle) onPickFromLibrary(gender, pickerStyle, look);
        }}
      />
    </>
  );
}

function ProfileChecklist({
  data,
  className,
}: {
  data: StylistProfileData;
  className?: string;
}) {
  const items: { label: string; done: boolean }[] = [
    { label: "Add your full name and location", done: !!data.fullName.trim() && !!data.location.trim() },
    { label: "Upload a profile picture", done: !!data.profilePic },
    { label: "Upload a square mood board image", done: !!data.moodBoardImage },
    {
      label: "Write your philosophy, Director's Pick and bio",
      done: !!data.philosophy.trim() && !!data.directorsPick.trim() && !!data.bio.trim(),
    },
    { label: "Add at least one Women style board", done: data.womenBoards.length > 0 },
    { label: "Add at least one Men style board", done: data.menBoards.length > 0 },
    { label: "Optional: link your Instagram", done: !!data.instagram.trim() },
  ];

  const required = items.slice(0, 6);
  const doneCount = required.filter((i) => i.done).length;
  const percent = Math.round((doneCount / required.length) * 100);
  const allDone = doneCount === required.length;

  return (
    <div
      className={`rounded-md border border-border bg-muted/30 p-5 sm:p-6 ${className ?? ""}`}
    >
      <div className="flex items-start sm:items-center justify-between gap-4 flex-col sm:flex-row mb-4">
        <div>
          <p className="font-body text-[10px] tracking-widest uppercase text-muted-foreground mb-1">
            Profile checklist
          </p>
          <h3 className="font-display text-lg">
            {allDone ? "You're ready to publish" : "What to fill in next"}
          </h3>
        </div>
        <div className="text-right">
          <p className="font-body text-sm text-muted-foreground">
            {doneCount} of {required.length} complete
          </p>
          <Progress value={percent} className="w-40 h-1.5 mt-2" />
        </div>
      </div>

      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.label}
            className="flex items-start gap-3 font-body text-sm"
          >
            {item.done ? (
              <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-accent text-accent-foreground flex items-center justify-center">
                <CheckIcon className="h-3 w-3" />
              </span>
            ) : (
              <CircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
            )}
            <span className={item.done ? "text-muted-foreground line-through" : "text-foreground"}>
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SaveIndicator({
  status,
  lastSavedAt,
}: {
  status: "idle" | "saving" | "saved" | "error";
  lastSavedAt: Date | null;
}) {
  const formatTime = (d: Date) =>
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-2 font-body text-xs text-muted-foreground">
        <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
        Saving…
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-2 font-body text-xs text-accent">
        <CheckCircle2Icon className="h-3.5 w-3.5" />
        Saved {lastSavedAt ? `at ${formatTime(lastSavedAt)}` : ""}
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-2 font-body text-xs text-destructive">
        <CloudOffIcon className="h-3.5 w-3.5" />
        Couldn&apos;t auto-save
      </span>
    );
  }
  // idle
  if (lastSavedAt) {
    return (
      <span className="font-body text-xs text-muted-foreground">
        Last saved at {formatTime(lastSavedAt)}
      </span>
    );
  }
  return (
    <span className="font-body text-xs text-muted-foreground">
      Changes save automatically as you type
    </span>
  );
}
