"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Camera, Heart, StickyNote } from "lucide-react";

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}
import { loyaltyConfig, mockClientProfiles } from "@/data/client-profiles";

const s1 = {
  fullName: "Feizhen Li",
  initials: "FL",
  gender: "Female",
  location: "Los Angeles, CA",
  loyaltyTier: "gold",
  totalSessions: 8,
  stylingGoal: "A workwear wardrobe",
  bodyIssues: ["Stomach", "Something else"],
  bodyIssueNotes: "Post partum and I have a large stomach I'd like to hide",
  bodyType: "Pear",
  highlightAreas: ["Shoulders", "Waist"],
  style: ["Classic", "Minimalist", "Polished"],
  styleIcons: ["Meghan Markle", "Amal Clooney"],
  comfortZone: "A little outside",
  typicallyWears: "Mostly jeans and pants",
  sizes: { Tops: "M", Bottoms: "8", Dresses: "8", Shoes: "7.5", Outerwear: "M" },
  budgets: { Tops: "$50–$100", Bottoms: "$60–$120", Dresses: "$100–$200", Shoes: "$80–$150", Accessories: "$30–$80" },
  fitPreferences: { top: "Relaxed", bottom: "Straight" },
  occupation: "Marketing Manager",
  dressCode: "Denim Friendly",
  colorsLike: ["Navy", "Black", "White", "Camel", "Olive"],
  colorsDislike: ["Neon", "Hot Pink", "Orange"],
  fabricsDislike: ["Polyester", "Sequins"],
  patternsDislike: ["Large florals", "Animal print"],
  denimFit: ["Straight", "Wide Leg"],
  dressStyles: ["Midi", "Wrap"],
  heelPreference: "Never",
  jewelryType: ["Gold"],
  socialLinks: { instagram: "@feizhen.style", pinterest: "feizhen_d", facebook: "" },
  favoriteLooks: ["Work Chic Board #2 — Look 3", "Weekend Casual — Look 1"],
  previousBoards: [
    { name: "Work Chic Moodboard", type: "mood" },
    { name: "Work Chic Style Board #1", type: "style" },
    { name: "Work Chic Style Board #2", type: "style" },
  ],
  photos: [],
  notes: "Prefers shopping from Nordstrom and Revolve. Has a capsule wardrobe mindset. Doesn't like oversized fits on top.",
};

const s2 = {
  fullName: "Crystal Stokey",
  initials: "CS",
  gender: "Female",
  location: "Los Angeles, CA",
  loyaltyTier: "silver",
  totalSessions: 4,
  stylingGoal: "Date night and weekend outfits",
  bodyIssues: ["Arms"],
  bodyIssueNotes: "Prefers sleeves or structured shoulders",
  bodyType: "Hourglass",
  highlightAreas: ["Waist", "Legs"],
  style: ["Bohemian", "Romantic"],
  styleIcons: ["Sienna Miller", "Vanessa Hudgens"],
  comfortZone: "Stay close",
  typicallyWears: "Dresses and skirts",
  sizes: { Tops: "S", Bottoms: "4", Dresses: "4", Shoes: "8", Outerwear: "S" },
  budgets: { Tops: "$40–$80", Bottoms: "$50–$100", Dresses: "$80–$160", Shoes: "$60–$120", Accessories: "$20–$60" },
  fitPreferences: { top: "Fitted", bottom: "Slim" },
  occupation: "Freelance Photographer",
  dressCode: "Casual Creative",
  colorsLike: ["Burnt Orange", "Olive", "Warm Brown", "Rust"],
  colorsDislike: ["Cool Gray", "Bright Blue"],
  fabricsDislike: ["Leather"],
  patternsDislike: ["Stripes"],
  denimFit: ["Skinny", "Flare"],
  dressStyles: ["Maxi", "Mini"],
  heelPreference: "Sometimes — low block heels",
  jewelryType: ["Gold", "Mixed metals"],
  socialLinks: { instagram: "@crystal.stokey", pinterest: "cstokey" },
  favoriteLooks: ["Boho Date Night — Look 2"],
  previousBoards: [
    { name: "Boho Date Night Moodboard", type: "mood" },
    { name: "Weekend Vibes Board", type: "style" },
  ],
  photos: [],
  notes: "Loves earthy tones. Very specific about arm coverage.",
};

/* ─── Helpers ─── */
function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-baseline py-1">
      <span className="font-body text-xs text-muted-foreground">{label}</span>
      <span className="font-body text-sm text-right">{value}</span>
    </div>
  );
}

function Tags({ items, variant = "default" }: { items: string[]; variant?: "default" | "destructive" | "accent" }) {
  const colorMap = {
    default: "bg-secondary text-secondary-foreground",
    destructive: "bg-destructive/10 text-destructive",
    accent: "bg-accent/10 text-accent",
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span key={item} className={cn("px-2 py-0.5 rounded-sm font-body text-xs", colorMap[variant])}>
          {item}
        </span>
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-body text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5">{children}</p>;
}

/* ─── Component ─── */
interface ClientDetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string | null;
}

export default function ClientDetailPanel({ open, onOpenChange, sessionId }: ClientDetailPanelProps) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const sections = [
    { id: "needs", label: "Needs" },
    { id: "body", label: "Body" },
    { id: "style", label: "Style" },
    { id: "sizes", label: "Sizes" },
    { id: "colors", label: "Colors" },
    { id: "favorites", label: "Favorites" },
    { id: "photos", label: "Photos" },
    { id: "notes", label: "Notes" },
  ];

  const scrollToSection = (id: string) => {
    const el = document.getElementById(`client-section-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const profile = sessionId ? mockClientProfiles[sessionId] : null;

  if (!profile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-[400px] sm:w-[440px] p-0">
          <div className="flex items-center justify-center h-full">
            <p className="font-body text-sm text-muted-foreground">No client profile available</p>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  const loyalty = loyaltyConfig[profile.loyaltyTier];
  const LoyaltyIcon = loyalty.icon;

  const hasSocial = profile.socialLinks.instagram || profile.socialLinks.pinterest || profile.socialLinks.facebook;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[440px] p-0">
        {/* ─── Header ─── */}
        <SheetHeader className="px-6 pt-6 pb-5 border-b border-border">
          {/* Name + avatar row */}
          <div className="flex items-center gap-3.5">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-secondary text-secondary-foreground font-display text-base">
                {profile.initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <SheetTitle className="font-display text-lg leading-tight">{profile.fullName}</SheetTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge className={cn("rounded-sm text-[10px] font-body border-0 cursor-default", loyalty.className)}>
                  {loyalty.label}
                </Badge>
              </div>
            </div>
          </div>

          {/* Meta grid */}
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 font-body text-sm">
            <div>
              <span className="text-muted-foreground text-xs">Gender</span>
              <p>{profile.gender}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Location</span>
              <p>{profile.location}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Occupation</span>
              <p>{profile.occupation}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Dress code</span>
              <p>{profile.dressCode}</p>
            </div>
          </div>

          {/* Social links */}
          {hasSocial && (
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
              {profile.socialLinks.instagram && (
                <span className="flex items-center gap-1.5 font-body text-xs text-muted-foreground">
                  <InstagramIcon className="h-3.5 w-3.5" /> {profile.socialLinks.instagram}
                </span>
              )}
              {profile.socialLinks.pinterest && (
                <span className="font-body text-xs text-muted-foreground">
                  📌 {profile.socialLinks.pinterest}
                </span>
              )}
            </div>
          )}
        </SheetHeader>

        {/* ─── Quick Nav ─── */}
        <div className="px-6 py-2.5 border-b border-border bg-background sticky top-0 z-10 overflow-x-auto">
          <div className="flex gap-1.5">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                className="px-2.5 py-1 rounded-sm font-body text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors whitespace-nowrap"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <ScrollArea className="h-[calc(100vh-15.5rem)]">
          <Accordion
            multiple
            defaultValue={["needs", "body", "style", "sizes", "colors"]}
            className="px-6"
          >
            {/* ─── What They Need ─── */}
            <AccordionItem value="needs" id="client-section-needs">
              <AccordionTrigger className="font-body text-sm font-medium py-3">What they need</AccordionTrigger>
              <AccordionContent className="pb-4 space-y-2">
                <p className="font-body text-sm font-medium">{profile.stylingGoal}</p>
                <p className="font-body text-xs text-muted-foreground">
                  Typically wears: {profile.typicallyWears}
                </p>
                <Detail label="Comfort zone" value={profile.comfortZone} />
              </AccordionContent>
            </AccordionItem>

            {/* ─── Body Profile ─── */}
            <AccordionItem value="body" id="client-section-body">
              <AccordionTrigger className="font-body text-sm font-medium py-3">Body profile</AccordionTrigger>
              <AccordionContent className="pb-4 space-y-3">
                <Detail label="Body type" value={profile.bodyType} />
                <div>
                  <SectionLabel>Concerns</SectionLabel>
                  <Tags items={profile.bodyIssues} variant="destructive" />
                  {profile.bodyIssueNotes && (
                    <p className="font-body text-xs text-muted-foreground mt-1.5 italic">
                      &ldquo;{profile.bodyIssueNotes}&rdquo;
                    </p>
                  )}
                </div>
                <div>
                  <SectionLabel>Highlight</SectionLabel>
                  <Tags items={profile.highlightAreas} variant="accent" />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ─── Style ─── */}
            <AccordionItem value="style" id="client-section-style">
              <AccordionTrigger className="font-body text-sm font-medium py-3">Style preferences</AccordionTrigger>
              <AccordionContent className="pb-4 space-y-3">
                <div>
                  <SectionLabel>Style</SectionLabel>
                  <Tags items={profile.style} />
                </div>
                <Detail label="Style icons" value={profile.styleIcons.join(", ")} />
                <div className="grid grid-cols-2 gap-x-4">
                  <Detail label="Top fit" value={profile.fitPreferences.top} />
                  <Detail label="Bottom fit" value={profile.fitPreferences.bottom} />
                </div>
                <div>
                  <SectionLabel>Denim fit</SectionLabel>
                  <Tags items={profile.denimFit} />
                </div>
                <div>
                  <SectionLabel>Dress styles</SectionLabel>
                  <Tags items={profile.dressStyles} />
                </div>
                <Detail label="Heels" value={profile.heelPreference} />
                <div>
                  <SectionLabel>Jewelry</SectionLabel>
                  <Tags items={profile.jewelryType} variant="accent" />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ─── Sizes & Budget ─── */}
            <AccordionItem value="sizes" id="client-section-sizes">
              <AccordionTrigger className="font-body text-sm font-medium py-3">Sizes & budget</AccordionTrigger>
              <AccordionContent className="pb-4 space-y-3">
                <div>
                  <SectionLabel>Sizes</SectionLabel>
                  <div className="grid grid-cols-3 gap-x-4 gap-y-1">
                    {Object.entries(profile.sizes).map(([cat, size]) => (
                      <div key={cat} className="font-body text-sm">
                        <span className="text-muted-foreground text-xs">{cat}</span>{" "}
                        <span className="font-medium">{size}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <Separator />
                <div>
                  <SectionLabel>Budget per category</SectionLabel>
                  <div className="grid grid-cols-1 gap-y-0.5">
                    {Object.entries(profile.budgets).map(([cat, budget]) => (
                      <Detail key={cat} label={cat} value={budget} />
                    ))}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ─── Colors, Fabrics, Patterns ─── */}
            <AccordionItem value="colors" id="client-section-colors">
              <AccordionTrigger className="font-body text-sm font-medium py-3">Colors, fabrics & patterns</AccordionTrigger>
              <AccordionContent className="pb-4 space-y-3">
                <div>
                  <SectionLabel>Likes</SectionLabel>
                  <Tags items={profile.colorsLike} variant="accent" />
                </div>
                <div>
                  <SectionLabel>Dislikes</SectionLabel>
                  <Tags items={profile.colorsDislike} variant="destructive" />
                </div>
                <div>
                  <SectionLabel>Fabrics to avoid</SectionLabel>
                  <Tags items={profile.fabricsDislike} variant="destructive" />
                </div>
                <div>
                  <SectionLabel>Patterns to avoid</SectionLabel>
                  <Tags items={profile.patternsDislike} variant="destructive" />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* ─── Favorites & Boards ─── */}
            <AccordionItem value="favorites" id="client-section-favorites">
              <AccordionTrigger className="font-body text-sm font-medium py-3">Favorites & boards</AccordionTrigger>
              <AccordionContent className="pb-4 space-y-3">
                {profile.favoriteLooks.length > 0 && (
                  <div>
                    <SectionLabel>Favorite looks</SectionLabel>
                    <div className="space-y-1">
                      {profile.favoriteLooks.map((look) => (
                        <div key={look} className="flex items-center gap-1.5">
                          <Heart className="h-3 w-3 text-accent shrink-0" />
                          <span className="font-body text-sm">{look}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {profile.previousBoards.length > 0 && (
                  <div>
                    <SectionLabel>Previous boards</SectionLabel>
                    <div className="space-y-1">
                      {profile.previousBoards.map((board) => (
                        <div key={board.name} className="flex items-center gap-2">
                          <Badge variant="outline" className="rounded-sm text-[9px] font-body px-1.5 shrink-0">
                            {board.type === "mood" ? "Mood" : "Style"}
                          </Badge>
                          <span className="font-body text-sm">{board.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* ─── Photos ─── */}
            <AccordionItem value="photos" id="client-section-photos">
              <AccordionTrigger className="font-body text-sm font-medium py-3">Photos</AccordionTrigger>
              <AccordionContent className="pb-4">
                {profile.photos.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {profile.photos.map((url, i) => (
                      <div key={i} className="aspect-square rounded-sm bg-muted overflow-hidden">
                        <img src={url} alt={`Client photo ${i + 1}`} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-4 text-muted-foreground">
                    <Camera className="h-8 w-8 mb-2 opacity-40" />
                    <p className="font-body text-xs">No photos uploaded yet</p>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* ─── Notes ─── */}
            <AccordionItem value="notes" id="client-section-notes">
              <AccordionTrigger className="font-body text-sm font-medium py-3">Stylist notes</AccordionTrigger>
              <AccordionContent className="pb-4">
                {editingNotes ? (
                  <div className="space-y-2">
                    <Textarea
                      value={notesDraft}
                      onChange={(e) => setNotesDraft(e.target.value)}
                      placeholder="Add notes about this client..."
                      className="font-body text-sm min-h-[100px]"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-8 rounded-sm font-body text-xs bg-accent hover:bg-accent/90 text-accent-foreground"
                        onClick={() => setEditingNotes(false)}
                      >
                        Save
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-sm font-body text-xs"
                        onClick={() => { setNotesDraft(profile.notes); setEditingNotes(false); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {profile.notes ? (
                      <p className="font-body text-sm leading-relaxed">{profile.notes}</p>
                    ) : (
                      <p className="font-body text-sm text-muted-foreground italic">No notes yet</p>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 mt-3 rounded-sm font-body text-xs gap-1"
                      onClick={() => { setNotesDraft(profile.notes); setEditingNotes(true); }}
                    >
                      <StickyNote className="h-3 w-3" />
                      {profile.notes ? "Edit notes" : "Add notes"}
                    </Button>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
