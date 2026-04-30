"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeftIcon,
  SearchIcon,
  PlusIcon,
  XIcon,
  SendIcon,
  Trash2Icon,
  UserIcon,
  ShirtIcon,
  StoreIcon,
  ShoppingBagIcon,
  SparklesIcon,
  LayersIcon,
  ScissorsIcon,
  EraserIcon,
  FlipHorizontalIcon,
  FlipVerticalIcon,
  ArrowUpToLineIcon,
  ArrowDownToLineIcon,
  Loader2Icon,
  CheckIcon,
  Minimize2Icon,
  SquareIcon,
  Maximize2Icon,
  HeartIcon,
  ExternalLinkIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SlidersHorizontalIcon,
  ChevronDownIcon,
} from "lucide-react";
import { removeBackground } from "@/lib/removeBackground";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import ClientDetailPanel from "@/components/stylist/client-detail-panel";
import { ProductDetailDialog } from "@/components/products/product-detail-dialog";
import type { ProductItem } from "@/components/boards/styleboard";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { loyaltyConfig } from "@/data/client-profiles";
import { toast } from "sonner";

type SourceTab = "shop" | "closet" | "inspiration" | "previous" | "store";
type Category = "all" | "tops" | "bottoms" | "outerwear" | "accessories" | "shoes";

type Availability = "in-stock" | "preorder" | "sale" | "final-sale";

type InspoStyle = "boho" | "classic" | "chic" | "minimal" | "edgy" | "romantic" | "streetwear" | "preppy";
type InspoBodyType = "petite" | "tall" | "curvy" | "plus-size" | "athletic" | "pear" | "hourglass" | "apple";

interface InventoryItem {
  id: string;
  image: string;
  brand: string;
  name: string;
  price?: string;
  category: Exclude<Category, "all">;
  subcategory?: string;
  retailer?: string;
  retailerUrl?: string;
  availability?: Availability;
  colors?: string[];
  sizes?: string[];
  styles?: InspoStyle[];
  bodyTypes?: InspoBodyType[];
  designer?: string;
  season?: "spring" | "summer" | "fall" | "winter";
}

const TOPS_SUBCATEGORIES = [
  "Active", "Black", "Blouses", "Boho", "Bralette", "Button Up Shirts",
  "Camisole", "Cropped", "Embellished & Sequined", "Floral", "Graphic Tees",
  "Halter", "Lace", "Leather", "Off The Shoulder", "One Shoulder", "Polo",
  "Puff Sleeve", "Tanks", "Tees", "White",
];

const SUBCATEGORIES_BY_CATEGORY: Partial<Record<Exclude<Category, "all">, string[]>> = {
  tops: TOPS_SUBCATEGORIES,
};

const COLOR_OPTIONS: { key: string; label: string; hex: string }[] = [
  { key: "white", label: "White", hex: "#FFFFFF" },
  { key: "black", label: "Black", hex: "#111111" },
  { key: "grey", label: "Grey", hex: "#9CA3AF" },
  { key: "beige", label: "Beige", hex: "#D9C3A1" },
  { key: "brown", label: "Brown", hex: "#7A4E2D" },
  { key: "navy", label: "Navy", hex: "#1F2A44" },
  { key: "blue", label: "Blue", hex: "#3B82F6" },
  { key: "green", label: "Green", hex: "#4B7F52" },
  { key: "pink", label: "Pink", hex: "#F4C2C2" },
];

const SIZE_OPTIONS = ["XS", "S", "M", "L", "XL", "One size"];

const INSPO_STYLE_OPTIONS: { key: InspoStyle; label: string }[] = [
  { key: "boho", label: "Boho" },
  { key: "classic", label: "Classic" },
  { key: "chic", label: "Chic" },
  { key: "minimal", label: "Minimal" },
  { key: "edgy", label: "Edgy" },
  { key: "romantic", label: "Romantic" },
  { key: "streetwear", label: "Streetwear" },
  { key: "preppy", label: "Preppy" },
];

const INSPO_BODY_TYPE_OPTIONS: { key: InspoBodyType; label: string }[] = [
  { key: "petite", label: "Petite" },
  { key: "tall", label: "Tall" },
  { key: "curvy", label: "Curvy" },
  { key: "plus-size", label: "Plus size" },
  { key: "athletic", label: "Athletic" },
  { key: "pear", label: "Pear" },
  { key: "hourglass", label: "Hourglass" },
  { key: "apple", label: "Apple" },
];

const tabs: { key: SourceTab; label: string; icon: typeof ShirtIcon }[] = [
  { key: "shop", label: "Shop", icon: StoreIcon },
  { key: "store", label: "Store", icon: ShoppingBagIcon },
  { key: "closet", label: "Client closet", icon: ShirtIcon },
  { key: "inspiration", label: "Inspiration", icon: SparklesIcon },
  { key: "previous", label: "Previous Boards", icon: LayersIcon },
];

const categories: { key: Category; label: string }[] = [
  { key: "all", label: "All items" },
  { key: "tops", label: "Tops" },
  { key: "bottoms", label: "Bottoms" },
  { key: "outerwear", label: "Outerwear" },
  { key: "accessories", label: "Accessories" },
  { key: "shoes", label: "Shoes" },
];

interface CanvasItem {
  uid: string;
  itemId: string;
  image: string;
  originalImage: string;
  x: number; // percent 0-100
  y: number; // percent 0-100
  flipH: boolean;
  flipV: boolean;
  bgRemoved: boolean;
  bgRemoving?: boolean;
  crop?: { top: number; right: number; bottom: number; left: number }; // percent insets
}

interface ClientProfile {
  fullName?: string;
  initials?: string;
  loyaltyTier?: string;
  profilePhotoUrl?: string;
  sizes?: Record<string, string>;
  budgets?: Record<string, string>;
}

interface StyleboardBuilderProps {
  boardId: string;
  sessionId: string;
  isRevision: boolean;
  clientId: string;
  clientName: string;
  clientAvatarUrl: string | null;
  clientLoyaltyTier: string | null;
  initialItems: unknown[];
  clientSizesByCategory: Record<string, string>;
  clientBudgetsByCategory: Record<string, [number, number]>;
  directSaleProductIds: string[];
  shopItems: InventoryItem[];
  closetItems: InventoryItem[];
  cartItems: InventoryItem[];
  purchasedItems: InventoryItem[];
  inspirationItems: InventoryItem[];
  previousMoodBoardItems: InventoryItem[];
  previousStyleBoardItems: InventoryItem[];
  storeItems: InventoryItem[];
  clientProfile?: ClientProfile;
}

export function StyleboardBuilder({
  boardId,
  sessionId,
  clientName,
  shopItems,
  closetItems,
  cartItems,
  purchasedItems,
  inspirationItems,
  previousMoodBoardItems,
  previousStyleBoardItems,
  storeItems,
  clientProfile,
}: StyleboardBuilderProps) {
  const router = useRouter();
  const [tab, setTab] = useState<SourceTab>("shop");
  const [category, setCategory] = useState<Category>("all");
  const [selectedSubcategories, setSelectedSubcategories] = useState<Set<string>>(new Set());

  const toggleSubcategory = (s: string) => {
    setSelectedSubcategories((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };
  const [search, setSearch] = useState("");
  const [priceRange, setPriceRange] = useState<string>("any");
  const [gridCols, setGridCols] = useState<3 | 4 | 6>(4);
  const [canvas, setCanvas] = useState<CanvasItem[]>([]);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [cropUid, setCropUid] = useState<string | null>(null);
  const [cropDraft, setCropDraft] = useState<{ top: number; right: number; bottom: number; left: number }>({ top: 0, right: 0, bottom: 0, left: 0 });
  const [clientInfoOpen, setClientInfoOpen] = useState(false);
  const [canvasSize, setCanvasSize] = useState<"min" | "small" | "large">("min");
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedRetailers, setSelectedRetailers] = useState<Set<string>>(new Set());
  const [selectedAvailability, setSelectedAvailability] = useState<Set<Availability>>(new Set());
  const [selectedColors, setSelectedColors] = useState<Set<string>>(new Set());
  const [colorOpen, setColorOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(new Set());
  const [budget, setBudget] = useState<[number, number]>([0, 5000]);
  const [selectedInspoStyles, setSelectedInspoStyles] = useState<Set<InspoStyle>>(new Set());
  const [selectedInspoBodyTypes, setSelectedInspoBodyTypes] = useState<Set<InspoBodyType>>(new Set());

  // Closet-specific filters
  const [closetColorOpen, setClosetColorOpen] = useState(false);
  const [closetDesignerOpen, setClosetDesignerOpen] = useState(false);
  const [closetSeasonOpen, setClosetSeasonOpen] = useState(false);
  const [closetSelectedColors, setClosetSelectedColors] = useState<Set<string>>(new Set());
  const [closetSelectedDesigners, setClosetSelectedDesigners] = useState<Set<string>>(new Set());
  const [closetSelectedSeasons, setClosetSelectedSeasons] = useState<Set<string>>(new Set());
  const [closetSubTab, setClosetSubTab] = useState<"closet" | "cart" | "purchased">("closet");
  const [previousSubTab, setPreviousSubTab] = useState<"mood" | "style">("mood");
  const clientFirstName = clientName.split(" ")[0] || clientName;
  const closetDesigners = useMemo(
    () => Array.from(new Set(closetItems.map((i) => i.designer).filter(Boolean) as string[])).sort(),
    [closetItems]
  );
  const SEASON_OPTIONS: { key: "spring" | "summer" | "fall" | "winter"; label: string }[] = [
    { key: "spring", label: "Spring" },
    { key: "summer", label: "Summer" },
    { key: "fall", label: "Fall" },
    { key: "winter", label: "Winter" },
  ];
  const toggleSetItem = <T,>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, value: T) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const toggleInspoStyle = (s: InspoStyle) => {
    setSelectedInspoStyles((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };
  const toggleInspoBodyType = (b: InspoBodyType) => {
    setSelectedInspoBodyTypes((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      return next;
    });
  };

  // Auto-close Size section ~900ms after the user stops adjusting selections
  useEffect(() => {
    if (!sizeOpen) return;
    const t = setTimeout(() => setSizeOpen(false), 900);
    return () => clearTimeout(t);
  }, [selectedSizes, sizeOpen]);

  // Auto-close Budget section ~900ms after the user stops adjusting the slider
  useEffect(() => {
    if (!budgetOpen) return;
    const t = setTimeout(() => setBudgetOpen(false), 900);
    return () => clearTimeout(t);
  }, [budget, budgetOpen]);

  const toggleAvailability = (a: Availability) => {
    setSelectedAvailability((prev) => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a);
      else next.add(a);
      return next;
    });
  };
  const toggleColor = (c: string) => {
    setSelectedColors((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };
  const toggleSize = (s: string) => {
    setSelectedSizes((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };
  const [pdpItem, setPdpItem] = useState<InventoryItem | null>(null);

  // Save dialog state
  const [saveOpen, setSaveOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveDescription, setSaveDescription] = useState("");
  const [lookName, setLookName] = useState("");
  const [lookNameTouched, setLookNameTouched] = useState(false);
  const [saveDescTouched, setSaveDescTouched] = useState(false);
  const [saveTags, setSaveTags] = useState<{ event: string; bodyType: string; fitPreference: string; highlights: string }>({
    event: "",
    bodyType: "",
    fitPreference: "",
    highlights: "",
  });

  const shopRetailers = useMemo(() => {
    const set = new Set<string>();
    shopItems.forEach((it) => it.retailer && set.add(it.retailer));
    return Array.from(set).sort();
  }, [shopItems]);

  const toggleRetailer = (retailer: string) => {
    setSelectedRetailers((prev) => {
      const next = new Set(prev);
      if (next.has(retailer)) next.delete(retailer);
      else next.add(retailer);
      return next;
    });
  };

  const toggleFavorite = (itemId: string, brand: string, name: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
        toast(`Removed ${brand} ${name} from favorites`);
      } else {
        next.add(itemId);
        toast.success(`Saved ${brand} ${name} to favorites`);
      }
      return next;
    });
  };
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragData = useRef<{ image: string; itemId: string } | null>(null);
  const movingUid = useRef<string | null>(null);

  // Keyboard shortcuts: 1/2/3 to switch canvas size (ignored while typing)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "1") {
        setCanvasSize("min");
        toast("Canvas: minimize");
      } else if (e.key === "2") {
        setCanvasSize("small");
        toast("Canvas: small");
      } else if (e.key === "3") {
        setCanvasSize("large");
        toast("Canvas: large");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const sourceItems = useMemo(() => {
    switch (tab) {
      case "shop": return shopItems;
      case "store": return storeItems;
      case "closet":
        return closetSubTab === "cart" ? cartItems : closetSubTab === "purchased" ? purchasedItems : closetItems;
      case "inspiration": return inspirationItems;
      case "previous":
        return previousSubTab === "style" ? previousStyleBoardItems : previousMoodBoardItems;
    }
  }, [tab, closetSubTab, previousSubTab, shopItems, storeItems, cartItems, purchasedItems, closetItems, inspirationItems, previousStyleBoardItems, previousMoodBoardItems]);

  const filtered = useMemo(() => {
    return sourceItems.filter((it) => {
      if (tab === "shop" && favoritesOnly && !favorites.has(it.id)) return false;
      if (tab === "shop" && selectedRetailers.size > 0 && (!it.retailer || !selectedRetailers.has(it.retailer))) return false;
      if (tab === "shop" && selectedAvailability.size > 0 && (!it.availability || !selectedAvailability.has(it.availability))) return false;
      if (tab === "shop" && selectedColors.size > 0 && (!it.colors || !it.colors.some((c) => selectedColors.has(c)))) return false;
      if (tab === "shop" && selectedSizes.size > 0 && (!it.sizes || !it.sizes.some((s) => selectedSizes.has(s)))) return false;
      if (tab === "inspiration" && selectedInspoStyles.size > 0 && (!it.styles || !it.styles.some((s) => selectedInspoStyles.has(s)))) return false;
      if (tab === "inspiration" && selectedInspoBodyTypes.size > 0 && (!it.bodyTypes || !it.bodyTypes.some((b) => selectedInspoBodyTypes.has(b)))) return false;
      if (tab === "closet" && closetSelectedColors.size > 0 && (!it.colors || !it.colors.some((c) => closetSelectedColors.has(c)))) return false;
      if (tab === "closet" && closetSelectedDesigners.size > 0 && (!it.designer || !closetSelectedDesigners.has(it.designer))) return false;
      if (tab === "closet" && closetSelectedSeasons.size > 0 && (!it.season || !closetSelectedSeasons.has(it.season))) return false;
      if (category !== "all" && it.category !== category) return false;
      if (tab === "shop" && selectedSubcategories.size > 0 && (!it.subcategory || !selectedSubcategories.has(it.subcategory))) return false;
      if (search && !`${it.brand} ${it.name}`.toLowerCase().includes(search.toLowerCase())) return false;
      if (tab === "shop" && it.price) {
        const value = Number(it.price.replace(/[^0-9.]/g, ""));
        if (value < budget[0] || value > budget[1]) return false;
      }
      if (priceRange !== "any" && it.price) {
        const value = Number(it.price.replace(/[^0-9.]/g, ""));
        if (priceRange === "u250" && value >= 250) return false;
        if (priceRange === "250-1000" && (value < 250 || value > 1000)) return false;
        if (priceRange === "1000+" && value < 1000) return false;
      }
      return true;
    });
  }, [sourceItems, category, search, priceRange, tab, favoritesOnly, favorites, selectedRetailers, selectedAvailability, selectedColors, selectedSizes, budget, selectedInspoStyles, selectedInspoBodyTypes, selectedSubcategories, closetSelectedColors, closetSelectedDesigners, closetSelectedSeasons]);

  const removeSetItem = <T,>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, value: T) => {
    setter((prev) => {
      const next = new Set(prev);
      next.delete(value);
      return next;
    });
  };

  type ActiveFilter = { id: string; label: string; swatch?: string; onRemove: () => void };
  const activeFilters = useMemo<ActiveFilter[]>(() => {
    const list: ActiveFilter[] = [];
    if (search.trim()) {
      list.push({ id: "search", label: `Search: "${search.trim()}"`, onRemove: () => setSearch("") });
    }
    if (category !== "all") {
      const c = categories.find((x) => x.key === category);
      list.push({ id: "category", label: c?.label ?? category, onRemove: () => { setCategory("all"); setSelectedSubcategories(new Set()); } });
    }
    selectedSubcategories.forEach((s) => {
      list.push({ id: `sub-${s}`, label: s, onRemove: () => removeSetItem(setSelectedSubcategories, s) });
    });
    if (tab === "shop" && favoritesOnly) {
      list.push({ id: "favs", label: "Favorites only", onRemove: () => setFavoritesOnly(false) });
    }
    if (tab === "shop") {
      selectedRetailers.forEach((r) => list.push({ id: `ret-${r}`, label: r, onRemove: () => removeSetItem(setSelectedRetailers, r) }));
      const availabilityLabels: Record<Availability, string> = { "in-stock": "In-Stock", preorder: "Preorder", sale: "Sale", "final-sale": "Final Sale" };
      selectedAvailability.forEach((a) => list.push({ id: `av-${a}`, label: availabilityLabels[a], onRemove: () => removeSetItem(setSelectedAvailability, a) }));
      selectedColors.forEach((c) => {
        const opt = COLOR_OPTIONS.find((x) => x.key === c);
        list.push({ id: `col-${c}`, label: opt?.label ?? c, swatch: opt?.hex, onRemove: () => removeSetItem(setSelectedColors, c) });
      });
      selectedSizes.forEach((s) => list.push({ id: `sz-${s}`, label: `Size ${s}`, onRemove: () => removeSetItem(setSelectedSizes, s) }));
      if (budget[0] > 0 || budget[1] < 5000) {
        list.push({ id: "budget", label: `$${budget[0].toLocaleString()}–$${budget[1].toLocaleString()}${budget[1] >= 5000 ? "+" : ""}`, onRemove: () => setBudget([0, 5000]) });
      }
    }
    if (priceRange !== "any") {
      const labels: Record<string, string> = { u250: "Under $250", "250-1000": "$250–$1,000", "1000+": "$1,000+" };
      list.push({ id: "price", label: labels[priceRange] ?? priceRange, onRemove: () => setPriceRange("any") });
    }
    if (tab === "inspiration") {
      selectedInspoStyles.forEach((s) => {
        const opt = INSPO_STYLE_OPTIONS.find((x) => x.key === s);
        list.push({ id: `is-${s}`, label: opt?.label ?? s, onRemove: () => removeSetItem(setSelectedInspoStyles, s) });
      });
      selectedInspoBodyTypes.forEach((b) => {
        const opt = INSPO_BODY_TYPE_OPTIONS.find((x) => x.key === b);
        list.push({ id: `ib-${b}`, label: opt?.label ?? b, onRemove: () => removeSetItem(setSelectedInspoBodyTypes, b) });
      });
    }
    if (tab === "closet") {
      closetSelectedColors.forEach((c) => {
        const opt = COLOR_OPTIONS.find((x) => x.key === c);
        list.push({ id: `cc-${c}`, label: opt?.label ?? c, swatch: opt?.hex, onRemove: () => removeSetItem(setClosetSelectedColors, c) });
      });
      closetSelectedDesigners.forEach((d) => {
        list.push({ id: `cd-${d}`, label: d, onRemove: () => removeSetItem(setClosetSelectedDesigners, d) });
      });
      closetSelectedSeasons.forEach((s) => {
        list.push({ id: `cs-${s}`, label: s.charAt(0).toUpperCase() + s.slice(1), onRemove: () => removeSetItem(setClosetSelectedSeasons, s) });
      });
    }
    return list;
  }, [tab, search, category, selectedSubcategories, favoritesOnly, selectedRetailers, selectedAvailability, selectedColors, selectedSizes, budget, priceRange, selectedInspoStyles, selectedInspoBodyTypes, closetSelectedColors, closetSelectedDesigners, closetSelectedSeasons]);

  const clearAllFilters = () => {
    setSearch("");
    setCategory("all");
    setSelectedSubcategories(new Set());
    setFavoritesOnly(false);
    setSelectedRetailers(new Set());
    setSelectedAvailability(new Set());
    setSelectedColors(new Set());
    setSelectedSizes(new Set());
    setBudget([0, 5000]);
    setPriceRange("any");
    setSelectedInspoStyles(new Set());
    setSelectedInspoBodyTypes(new Set());
    setClosetSelectedColors(new Set());
    setClosetSelectedDesigners(new Set());
    setClosetSelectedSeasons(new Set());
  };


  const addToCanvas = (item: InventoryItem, x?: number, y?: number) => {
    if (canvas.length >= 12) {
      toast("Maximum 12 items on canvas");
      return;
    }
    setCanvas((prev) => {
      // Tile size on canvas (% of canvas) — matches render width
      const tile = 24; // overlap threshold in %
      const occupied = (px: number, py: number) =>
        prev.some((c) => Math.abs(c.x - px) < tile && Math.abs(c.y - py) < tile);

      // Candidate grid: 4 cols x 4 rows centered in canvas
      const cols = 4;
      const rows = 4;
      const stepX = 22;
      const stepY = 22;
      const startX = 50 - ((cols - 1) * stepX) / 2;
      const startY = 50 - ((rows - 1) * stepY) / 2;

      const candidates: Array<{ x: number; y: number }> = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          candidates.push({ x: startX + c * stepX, y: startY + r * stepY });
        }
      }

      let finalX: number;
      let finalY: number;
      if (x !== undefined && y !== undefined) {
        // User dropped at a specific spot — nudge if that spot is occupied
        let px = x;
        let py = y;
        if (occupied(px, py)) {
          const free = candidates.find((p) => !occupied(p.x, p.y));
          if (free) {
            px = free.x;
            py = free.y;
          } else {
            // Fallback: small jitter
            px = Math.min(88, Math.max(12, x + 8));
            py = Math.min(88, Math.max(12, y + 8));
          }
        }
        finalX = Math.min(88, Math.max(12, px));
        finalY = Math.min(88, Math.max(12, py));
      } else {
        const free = candidates.find((p) => !occupied(p.x, p.y));
        const fallback = candidates[prev.length % candidates.length];
        const pick = free ?? fallback;
        finalX = pick.x;
        finalY = pick.y;
      }

      return [
        ...prev,
        {
          uid: `${item.id}-${Date.now()}`,
          itemId: item.id,
          image: item.image,
          originalImage: item.image,
          x: finalX,
          y: finalY,
          flipH: false,
          flipV: false,
          bgRemoved: false,
        },
      ];
    });
  };

  const removeFromCanvas = (uid: string) => {
    setCanvas((prev) => prev.filter((c) => c.uid !== uid));
  };

  const clearCanvas = () => {
    setCanvas([]);
    setSelectedUid(null);
    setCropUid(null);
  };

  const updateItem = (uid: string, patch: Partial<CanvasItem>) => {
    setCanvas((prev) => prev.map((c) => (c.uid === uid ? { ...c, ...patch } : c)));
  };

  const sendToBack = (uid: string) => {
    setCanvas((prev) => {
      const idx = prev.findIndex((c) => c.uid === uid);
      if (idx <= 0) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.unshift(item);
      return next;
    });
  };

  const sendToFront = (uid: string) => {
    setCanvas((prev) => {
      const idx = prev.findIndex((c) => c.uid === uid);
      if (idx === -1 || idx === prev.length - 1) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.push(item);
      return next;
    });
  };

  const handleRemoveBg = async (uid: string) => {
    const item = canvas.find((c) => c.uid === uid);
    if (!item || item.bgRemoving) return;
    if (item.bgRemoved) {
      updateItem(uid, { image: item.originalImage, bgRemoved: false });
      return;
    }
    updateItem(uid, { bgRemoving: true });
    try {
      const out = await removeBackground(item.originalImage);
      updateItem(uid, { image: out, bgRemoved: true, bgRemoving: false });
      toast.success("Background removed");
    } catch (err) {
      console.error(err);
      updateItem(uid, { bgRemoving: false });
      toast.error("Couldn't remove background");
    }
  };

  const openCrop = (uid: string) => {
    const item = canvas.find((c) => c.uid === uid);
    if (!item) return;
    setCropUid(uid);
    setCropDraft(item.crop ?? { top: 0, right: 0, bottom: 0, left: 0 });
  };
  const applyCrop = () => {
    if (cropUid) updateItem(cropUid, { crop: cropDraft });
    setCropUid(null);
  };
  const resetCrop = () => {
    if (cropUid) updateItem(cropUid, { crop: undefined });
    setCropUid(null);
  };

  const handleDragStart = (item: InventoryItem) => {
    dragData.current = { image: item.image, itemId: item.id };
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    if (movingUid.current) {
      const uid = movingUid.current;
      setCanvas((prev) => prev.map((c) => (c.uid === uid ? { ...c, x, y } : c)));
      movingUid.current = null;
      return;
    }
    if (dragData.current) {
      const it = sourceItems.find((s) => s.id === dragData.current!.itemId);
      if (it) addToCanvas(it, x, y);
      dragData.current = null;
    }
  };

  const MIN_ITEMS_TO_SAVE = 3;
  const MAX_DESC = 600;
  const MAX_TAG = 60;
  const handleSave = () => {
    if (canvas.length < MIN_ITEMS_TO_SAVE) {
      toast(`Add at least ${MIN_ITEMS_TO_SAVE} items to the canvas before saving`);
      return;
    }
    setSaveOpen(true);
  };

  const confirmSave = async () => {
    const name = lookName.trim();
    const desc = saveDescription.trim();
    if (!name) {
      setLookNameTouched(true);
      toast("Please name the look before saving");
      return;
    }
    if (!desc) {
      setSaveDescTouched(true);
      toast("Please add a description before saving");
      return;
    }

    setIsSaving(true);
    const toastId = toast.loading(`Saving "${name}"…`);
    try {
      const tagList = [saveTags.event, saveTags.bodyType, saveTags.fitPreference, saveTags.highlights]
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await fetch(`/api/styleboards/${boardId}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: name, description: desc, tags: tagList }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Send failed");
      }
      toast.success(`"${name}" saved & sent to ${clientName}`, {
        id: toastId,
        description: "Redirecting to dashboard…",
      });
      setSaveOpen(false);
      // Brief pause so the user sees the success state before routing
      await new Promise((resolve) => setTimeout(resolve, 600));
      router.push(`/stylist/dashboard?session=${sessionId}`);
      router.refresh();
    } catch (err) {
      toast.error("Could not save the look. Please try again.", { id: toastId });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/stylist/dashboard?session=${sessionId}`)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
          {(() => {
            const profile = clientProfile;
            const fullName = profile?.fullName || clientName;
            const initials = profile?.initials || clientName.split(" ").map((n) => n[0]).slice(0, 2).join("");
            const tier = profile?.loyaltyTier;
            const loyalty = tier && tier !== "new" ? loyaltyConfig[tier as keyof typeof loyaltyConfig] : null;
            const LoyaltyIcon = loyalty?.icon;
            return (
              <div className="flex items-center gap-2.5">
                <Avatar className="h-9 w-9">
                  {profile?.profilePhotoUrl && <AvatarImage src={profile.profilePhotoUrl} alt={fullName} />}
                  <AvatarFallback className="font-body text-xs bg-muted text-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <h1 className="font-display text-sm font-semibold leading-tight">{fullName}</h1>
                    {loyalty && LoyaltyIcon && (
                      <Badge
                        variant="secondary"
                        className={cn(
                          "h-5 px-1.5 gap-1 font-body text-[10px] font-medium rounded-sm border-0",
                          loyalty.className
                        )}
                      >
                        <LoyaltyIcon className="h-2.5 w-2.5" />
                        {loyalty.label}
                      </Badge>
                    )}
                  </div>
                  <p className="font-body text-[11px] text-muted-foreground leading-tight">
                    Create a look
                  </p>
                </div>
              </div>
            );
          })()}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setClientInfoOpen(true)}
            className="font-body text-xs h-8 rounded-sm gap-1.5"
          >
            <UserIcon className="h-3.5 w-3.5" />
            Client info
          </Button>
          {canvas.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearCanvas}
              className="font-body text-xs text-muted-foreground h-8 gap-1"
            >
              <Trash2Icon className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={canvas.length < MIN_ITEMS_TO_SAVE}
            size="sm"
            title={canvas.length < MIN_ITEMS_TO_SAVE ? `Add ${MIN_ITEMS_TO_SAVE - canvas.length} more item${MIN_ITEMS_TO_SAVE - canvas.length === 1 ? "" : "s"} to enable` : undefined}
            className="h-8 rounded-sm bg-foreground text-background hover:bg-foreground/90 font-body text-xs gap-1.5"
          >
            <SendIcon className="h-3.5 w-3.5" />
            Save & send{canvas.length < MIN_ITEMS_TO_SAVE ? ` (${canvas.length}/${MIN_ITEMS_TO_SAVE})` : ""}
          </Button>
        </div>
      </div>

      {/* Source tabs */}
      <div className="flex items-center gap-1 px-5 border-b border-border shrink-0">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2.5 font-body text-xs border-b-2 -mb-px transition-colors",
                active
                  ? "border-foreground text-foreground font-semibold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: filter sidebar */}
        {filtersCollapsed ? (
          <aside className="w-10 shrink-0 border-r border-border bg-muted/20 flex flex-col items-center py-3">
            <button
              onClick={() => setFiltersCollapsed(false)}
              title="Show filters"
              aria-label="Show filters"
              className="h-8 w-8 rounded-sm flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <PanelLeftOpenIcon className="h-4 w-4" />
            </button>
            <div className="mt-2 [writing-mode:vertical-rl] rotate-180 font-display text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <SlidersHorizontalIcon className="h-3 w-3" />
              Filters
            </div>
          </aside>
        ) : (
        <aside className="w-[200px] shrink-0 border-r border-border bg-muted/20 p-4 flex flex-col gap-5 overflow-y-auto relative">
          <div className="flex items-center justify-between -mt-1 -mr-1">
            <span className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
              <SlidersHorizontalIcon className="h-3 w-3" /> Filters
            </span>
            <button
              onClick={() => setFiltersCollapsed(true)}
              title="Hide filters"
              aria-label="Hide filters"
              className="h-6 w-6 rounded-sm flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <PanelLeftCloseIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          {tab === "shop" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Filter by retailers
                </h3>
                {selectedRetailers.size > 0 && (
                  <button
                    onClick={() => setSelectedRetailers(new Set())}
                    className="font-body text-[10px] text-muted-foreground hover:text-foreground underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="space-y-0.5 max-h-48 overflow-y-auto pr-1">
                {shopRetailers.map((r) => {
                  const active = selectedRetailers.has(r);
                  return (
                    <button
                      key={r}
                      onClick={() => toggleRetailer(r)}
                      className={cn(
                        "w-full text-left px-2 py-1.5 rounded-sm font-body text-xs transition-colors flex items-center gap-2",
                        active
                          ? "bg-foreground text-background"
                          : "text-foreground hover:bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "h-3 w-3 rounded-sm border flex items-center justify-center shrink-0",
                          active
                            ? "bg-background border-background"
                            : "border-border"
                        )}
                      >
                        {active && <span className="h-1.5 w-1.5 bg-foreground rounded-[1px]" />}
                      </span>
                      <span className="truncate">{r}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "shop" && (
            <div>
              <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Availability
              </h3>
              <div className="space-y-0.5">
                {([
                  { key: "in-stock" as const, label: "In-Stock" },
                  { key: "preorder" as const, label: "Preorder" },
                  { key: "sale" as const, label: "Sale" },
                  { key: "final-sale" as const, label: "Final Sale" },
                ]).map((opt) => {
                  const active = selectedAvailability.has(opt.key);
                  return (
                    <button
                      key={opt.key}
                      onClick={() => toggleAvailability(opt.key)}
                      className={cn(
                        "w-full text-left px-2 py-1.5 rounded-sm font-body text-xs transition-colors flex items-center gap-2",
                        active
                          ? "bg-foreground text-background"
                          : "text-foreground hover:bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "h-3 w-3 rounded-sm border flex items-center justify-center shrink-0",
                          active
                            ? "bg-background border-background"
                            : "border-border"
                        )}
                      >
                        {active && <span className="h-1.5 w-1.5 bg-foreground rounded-[1px]" />}
                      </span>
                      <span className="truncate">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "inspiration" && (
            <>
              {(selectedInspoStyles.size > 0 || selectedInspoBodyTypes.size > 0) && (
                <button
                  onClick={() => {
                    setSelectedInspoStyles(new Set());
                    setSelectedInspoBodyTypes(new Set());
                  }}
                  className="self-start font-body text-[11px] text-foreground hover:text-foreground/80 underline underline-offset-2"
                >
                  Clear all filters
                </button>
              )}
              <div>
                <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Style
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {INSPO_STYLE_OPTIONS.map((opt) => {
                    const active = selectedInspoStyles.has(opt.key);
                    return (
                      <button
                        key={opt.key}
                        onClick={() => toggleInspoStyle(opt.key)}
                        className={cn(
                          "h-7 px-2.5 rounded-sm border font-body text-[11px] transition-colors",
                          active
                            ? "bg-foreground text-background border-foreground"
                            : "bg-background text-foreground border-border hover:bg-muted"
                        )}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Body type
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {INSPO_BODY_TYPE_OPTIONS.map((opt) => {
                    const active = selectedInspoBodyTypes.has(opt.key);
                    return (
                      <button
                        key={opt.key}
                        onClick={() => toggleInspoBodyType(opt.key)}
                        className={cn(
                          "h-7 px-2.5 rounded-sm border font-body text-[11px] transition-colors",
                          active
                            ? "bg-foreground text-background border-foreground"
                            : "bg-background text-foreground border-border hover:bg-muted"
                        )}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {tab !== "inspiration" && (
          <div>
            <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Category
            </h3>
            <div className="space-y-0.5">
              {categories.map((c) => {
                const subs = c.key !== "all" ? SUBCATEGORIES_BY_CATEGORY[c.key as Exclude<Category, "all">] : undefined;
                const isActive = category === c.key;
                return (
                  <div key={c.key}>
                    <button
                      onClick={() => {
                        setCategory(c.key);
                        if (c.key !== category) setSelectedSubcategories(new Set());
                      }}
                      className={cn(
                        "w-full text-left px-2 py-1.5 rounded-sm font-body text-xs transition-colors",
                        isActive
                          ? "bg-foreground text-background"
                          : "text-foreground hover:bg-muted"
                      )}
                    >
                      {c.label}
                    </button>
                    {tab === "shop" && isActive && subs && (
                      <div className="mt-1 ml-2 pl-2 border-l border-border space-y-0.5 max-h-64 overflow-y-auto pr-1">
                        {selectedSubcategories.size > 0 && (
                          <button
                            onClick={() => setSelectedSubcategories(new Set())}
                            className="font-body text-[10px] text-muted-foreground hover:text-foreground underline px-2 py-0.5"
                          >
                            Clear
                          </button>
                        )}
                        {subs.map((s) => {
                          const subActive = selectedSubcategories.has(s);
                          return (
                            <button
                              key={s}
                              onClick={() => toggleSubcategory(s)}
                              className={cn(
                                "w-full text-left px-2 py-1 rounded-sm font-body text-xs transition-colors flex items-center gap-2",
                                subActive
                                  ? "bg-foreground text-background"
                                  : "text-foreground hover:bg-muted"
                              )}
                            >
                              <span
                                className={cn(
                                  "h-3 w-3 rounded-sm border flex items-center justify-center shrink-0",
                                  subActive ? "bg-background border-background" : "border-border"
                                )}
                              >
                                {subActive && <span className="h-1.5 w-1.5 bg-foreground rounded-[1px]" />}
                              </span>
                              <span className="truncate">{s}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          )}


          {tab === "shop" && (
            <>
              <div>
                <button
                  type="button"
                  onClick={() => setColorOpen((v) => !v)}
                  aria-expanded={colorOpen}
                  className="w-full flex items-center justify-between mb-2 group"
                >
                  <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                    Color{selectedColors.size > 0 && ` (${selectedColors.size})`}
                  </h3>
                  <ChevronDownIcon
                    className={cn(
                      "h-3.5 w-3.5 text-muted-foreground transition-transform",
                      colorOpen && "rotate-180"
                    )}
                  />
                </button>
                {colorOpen && (
                  <div className="flex flex-wrap gap-1.5">
                    {COLOR_OPTIONS.map((c) => {
                      const active = selectedColors.has(c.key);
                      return (
                        <button
                          key={c.key}
                          onClick={() => toggleColor(c.key)}
                          title={c.label}
                          aria-label={c.label}
                          aria-pressed={active}
                          className={cn(
                            "h-6 w-6 rounded-full border transition-all",
                            active
                              ? "border-foreground ring-2 ring-foreground ring-offset-1 ring-offset-background"
                              : "border-border hover:border-foreground/60"
                          )}
                          style={{ backgroundColor: c.hex }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setSizeOpen((v) => !v)}
                  aria-expanded={sizeOpen}
                  className="w-full flex items-center justify-between mb-2 group"
                >
                  <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                    Size{selectedSizes.size > 0 && ` (${selectedSizes.size})`}
                  </h3>
                  <ChevronDownIcon
                    className={cn(
                      "h-3.5 w-3.5 text-muted-foreground transition-transform",
                      sizeOpen && "rotate-180"
                    )}
                  />
                </button>
                {sizeOpen && (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {SIZE_OPTIONS.map((s) => {
                        const active = selectedSizes.has(s);
                        return (
                          <button
                            key={s}
                            onClick={() => toggleSize(s)}
                            className={cn(
                              "min-w-8 h-7 px-2 rounded-sm border font-body text-[11px] transition-colors",
                              active
                                ? "bg-foreground text-background border-foreground"
                                : "bg-background text-foreground border-border hover:bg-muted"
                            )}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                    {selectedSizes.size > 0 && (
                      <button
                        onClick={() => setSelectedSizes(new Set())}
                        className="mt-2 font-body text-[11px] text-foreground hover:text-foreground/80 underline underline-offset-2"
                      >
                        Clear size
                      </button>
                    )}
                  </>
                )}
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => setBudgetOpen((v) => !v)}
                  aria-expanded={budgetOpen}
                  className="w-full flex items-center justify-between mb-2 group"
                >
                  <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                    Budget{(budget[0] > 0 || budget[1] < 5000) && " •"}
                  </h3>
                  <ChevronDownIcon
                    className={cn(
                      "h-3.5 w-3.5 text-muted-foreground transition-transform",
                      budgetOpen && "rotate-180"
                    )}
                  />
                </button>
                {budgetOpen && (
                  <>
                    <div className="flex justify-end mb-1">
                      <span className="font-body text-[10px] text-muted-foreground">
                        ${budget[0].toLocaleString()} – ${budget[1].toLocaleString()}{budget[1] >= 5000 ? "+" : ""}
                      </span>
                    </div>
                    <Slider
                      min={0}
                      max={5000}
                      step={50}
                      value={budget}
                      onValueChange={(v) => { const arr = v as readonly number[]; setBudget([arr[0], arr[1]] as [number, number]); }}
                      className="my-2"
                    />
                    {(budget[0] > 0 || budget[1] < 5000) && (
                      <button
                        onClick={() => setBudget([0, 5000])}
                        className="mt-2 font-body text-[11px] text-foreground hover:text-foreground/80 underline underline-offset-2"
                      >
                        Reset budget
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {tab === "closet" && (
            <>
              {/* Colors */}
              <div>
                <button
                  type="button"
                  onClick={() => setClosetColorOpen((v) => !v)}
                  aria-expanded={closetColorOpen}
                  className="w-full flex items-center justify-between mb-2 group"
                >
                  <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                    Colors{closetSelectedColors.size > 0 && ` (${closetSelectedColors.size})`}
                  </h3>
                  <ChevronDownIcon
                    className={cn(
                      "h-3.5 w-3.5 text-muted-foreground transition-transform",
                      closetColorOpen && "rotate-180"
                    )}
                  />
                </button>
                {closetColorOpen && (
                  <div className="flex flex-wrap gap-1.5">
                    {COLOR_OPTIONS.map((c) => {
                      const active = closetSelectedColors.has(c.key);
                      return (
                        <button
                          key={c.key}
                          onClick={() => toggleSetItem(setClosetSelectedColors, c.key)}
                          title={c.label}
                          aria-label={c.label}
                          aria-pressed={active}
                          className={cn(
                            "h-6 w-6 rounded-full border transition-all",
                            active
                              ? "border-foreground ring-2 ring-foreground ring-offset-1 ring-offset-background"
                              : "border-border hover:border-foreground/60"
                          )}
                          style={{ backgroundColor: c.hex }}
                        />
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Designers */}
              <div>
                <button
                  type="button"
                  onClick={() => setClosetDesignerOpen((v) => !v)}
                  aria-expanded={closetDesignerOpen}
                  className="w-full flex items-center justify-between mb-2 group"
                >
                  <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                    Designers{closetSelectedDesigners.size > 0 && ` (${closetSelectedDesigners.size})`}
                  </h3>
                  <ChevronDownIcon
                    className={cn(
                      "h-3.5 w-3.5 text-muted-foreground transition-transform",
                      closetDesignerOpen && "rotate-180"
                    )}
                  />
                </button>
                {closetDesignerOpen && (
                  <div className="flex flex-wrap gap-1.5">
                    {closetDesigners.map((d) => {
                      const active = closetSelectedDesigners.has(d);
                      return (
                        <button
                          key={d}
                          onClick={() => toggleSetItem(setClosetSelectedDesigners, d)}
                          className={cn(
                            "h-7 px-2.5 rounded-sm border font-body text-[11px] transition-colors",
                            active
                              ? "bg-foreground text-background border-foreground"
                              : "bg-background text-foreground border-border hover:bg-muted"
                          )}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Season */}
              <div>
                <button
                  type="button"
                  onClick={() => setClosetSeasonOpen((v) => !v)}
                  aria-expanded={closetSeasonOpen}
                  className="w-full flex items-center justify-between mb-2 group"
                >
                  <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
                    Season{closetSelectedSeasons.size > 0 && ` (${closetSelectedSeasons.size})`}
                  </h3>
                  <ChevronDownIcon
                    className={cn(
                      "h-3.5 w-3.5 text-muted-foreground transition-transform",
                      closetSeasonOpen && "rotate-180"
                    )}
                  />
                </button>
                {closetSeasonOpen && (
                  <div className="flex flex-wrap gap-1.5">
                    {SEASON_OPTIONS.map((s) => {
                      const active = closetSelectedSeasons.has(s.key);
                      return (
                        <button
                          key={s.key}
                          onClick={() => toggleSetItem<string>(setClosetSelectedSeasons, s.key)}
                          className={cn(
                            "h-7 px-2.5 rounded-sm border font-body text-[11px] transition-colors",
                            active
                              ? "bg-foreground text-background border-foreground"
                              : "bg-background text-foreground border-border hover:bg-muted"
                          )}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {(closetSelectedColors.size > 0 || closetSelectedDesigners.size > 0 || closetSelectedSeasons.size > 0) && (
                <button
                  onClick={() => {
                    setClosetSelectedColors(new Set());
                    setClosetSelectedDesigners(new Set());
                    setClosetSelectedSeasons(new Set());
                  }}
                  className="self-start font-body text-[11px] text-foreground hover:text-foreground/80 underline underline-offset-2"
                >
                  Clear all filters
                </button>
              )}
            </>
          )}

          <p className="font-body text-[11px] text-muted-foreground mt-auto">
            Tip: click an item to add or drag it onto the canvas. Drag items already on the canvas to reposition.
          </p>
        </aside>
        )}

        {/* Center: inventory grid */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-border">
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {tab === "shop" && (
                <button
                  onClick={() => setFavoritesOnly((v) => !v)}
                  title={favoritesOnly ? "Showing favorites only" : "Show favorites only"}
                  aria-pressed={favoritesOnly}
                  className={cn(
                    "h-8 inline-flex items-center gap-1.5 px-2.5 rounded-sm font-body text-xs transition-colors border whitespace-nowrap",
                    favoritesOnly
                      ? "bg-foreground text-background border-foreground"
                      : "bg-background text-foreground border-border hover:bg-muted"
                  )}
                >
                  <HeartIcon
                    className={cn(
                      "h-3.5 w-3.5",
                      favoritesOnly ? "fill-background" : "fill-none"
                    )}
                  />
                  Favorites
                  <span
                    className={cn(
                      "font-body text-[10px]",
                      favoritesOnly ? "text-background/70" : "text-muted-foreground"
                    )}
                  >
                    {favorites.size}
                  </span>
                </button>
              )}
              <div className="relative w-full max-w-xs">
                <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search inventory..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 pl-8 font-body text-xs rounded-sm"
                />
              </div>
              <span className="font-body text-sm text-muted-foreground whitespace-nowrap">
                {filtered.length} {filtered.length === 1 ? "item" : "items"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-body text-[11px] text-muted-foreground mr-1">View</span>
              {[3, 4, 6].map((n) => (
                <button
                  key={n}
                  onClick={() => setGridCols(n as 3 | 4 | 6)}
                  className={cn(
                    "h-7 w-7 rounded-sm font-body text-xs transition-colors",
                    gridCols === n
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground hover:font-semibold"
                  )}
                  aria-label={`${n} per row`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          {tab === "closet" && (
            <div className="flex items-center gap-1 px-5 py-2 border-b border-border bg-muted/30">
              {([
                { key: "closet", label: `${clientFirstName}'s Closet` },
                { key: "cart", label: `${clientFirstName}'s Cart` },
                { key: "purchased", label: `${clientFirstName}'s Purchased` },
              ] as const).map((st) => {
                const active = closetSubTab === st.key;
                return (
                  <button
                    key={st.key}
                    onClick={() => setClosetSubTab(st.key)}
                    aria-pressed={active}
                    className={cn(
                      "h-8 px-3 rounded-sm font-body text-xs transition-colors border whitespace-nowrap",
                      active
                        ? "bg-foreground text-background border-foreground"
                        : "bg-background text-foreground border-border hover:bg-muted"
                    )}
                  >
                    {st.label}
                  </button>
                );
              })}
            </div>
          )}
          {tab === "previous" && (
            <div className="flex items-center gap-1 px-5 py-2 border-b border-border bg-muted/30">
              {([
                { key: "mood", label: "Mood Boards" },
                { key: "style", label: "Style Boards" },
              ] as const).map((st) => {
                const active = previousSubTab === st.key;
                return (
                  <button
                    key={st.key}
                    onClick={() => setPreviousSubTab(st.key)}
                    aria-pressed={active}
                    className={cn(
                      "h-8 px-3 rounded-sm font-body text-xs transition-colors border whitespace-nowrap",
                      active
                        ? "bg-foreground text-background border-foreground"
                        : "bg-background text-foreground border-border hover:bg-muted"
                    )}
                  >
                    {st.label}
                  </button>
                );
              })}
            </div>
          )}
          {activeFilters.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap px-5 py-2 border-b border-border bg-muted/20">
              <span className="font-display text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">
                Active filters
              </span>
              {activeFilters.map((f) => (
                <span
                  key={f.id}
                  className="inline-flex items-center gap-1 h-7 pl-2 pr-1 rounded-full border border-foreground bg-foreground text-background font-body text-[11px]"
                >
                  {f.swatch && (
                    <span
                      className="h-3 w-3 rounded-full border border-background/50"
                      style={{ backgroundColor: f.swatch }}
                    />
                  )}
                  <span className="max-w-[160px] truncate">{f.label}</span>
                  <button
                    type="button"
                    onClick={f.onRemove}
                    aria-label={`Remove filter ${f.label}`}
                    className="h-5 w-5 inline-flex items-center justify-center rounded-full hover:bg-background/20 transition-colors"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {activeFilters.length > 1 && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="ml-1 font-body text-[11px] text-foreground hover:text-foreground/80 underline underline-offset-2"
                >
                  Clear all
                </button>
              )}
            </div>
          )}
          <ScrollArea className="flex-1">
            <div
              className={cn(
                "grid gap-3 p-5",
                gridCols === 3 && "grid-cols-2 lg:grid-cols-3",
                gridCols === 4 && "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
                gridCols === 6 && "grid-cols-3 lg:grid-cols-4 xl:grid-cols-6"
              )}
            >
              {filtered.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => handleDragStart(item)}
                  onClick={() => tab === "inspiration" ? addToCanvas(item) : setPdpItem(item)}
                  className="group relative bg-card border border-border rounded-sm overflow-hidden cursor-pointer hover:border-foreground transition-colors"
                >
                  <div className="aspect-square overflow-hidden bg-muted">
                    <Image
                      src={item.image}
                      alt={item.name}
                      width={400}
                      height={400}
                      unoptimized
                      className="w-full h-full object-cover"
                      loading="lazy"
                      draggable={false}
                    />
                  </div>
                  {tab !== "inspiration" && (
                    <div className="p-2 space-y-0.5">
                      <p className="font-body text-[11px] font-medium truncate">{item.brand}</p>
                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        {item.price && (
                          <p className="font-body text-[11px] text-foreground">{item.price}</p>
                        )}
                        {item.retailerUrl && (
                          <a
                            href={item.retailerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title={`Open ${item.retailer ?? "retailer"} in a new tab`}
                            className="inline-flex items-center gap-0.5 font-body text-[10px] text-muted-foreground hover:text-foreground hover:underline truncate max-w-[60%]"
                          >
                            <span className="truncate">{item.retailer ?? "Visit"}</span>
                            <ExternalLinkIcon className="h-2.5 w-2.5 shrink-0" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(item.id, item.brand, item.name);
                      }}
                      aria-label={favorites.has(item.id) ? "Remove from favorites" : "Add to favorites"}
                      title={favorites.has(item.id) ? "Remove from favorites" : "Add to favorites"}
                      className={cn(
                        "h-6 w-6 rounded-full bg-background/90 border border-border flex items-center justify-center transition-opacity",
                        favorites.has(item.id)
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100"
                      )}
                    >
                      <HeartIcon
                        className={cn(
                          "h-3 w-3 transition-colors",
                          favorites.has(item.id)
                            ? "fill-destructive text-destructive"
                            : "text-foreground"
                        )}
                      />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        addToCanvas(item);
                      }}
                      aria-label="Add to canvas"
                      title="Add to canvas"
                      className="h-6 w-6 rounded-full bg-background/90 border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-foreground hover:text-background"
                    >
                      <PlusIcon className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="col-span-full p-12 text-center">
                  <p className="font-body text-sm text-muted-foreground">No items match these filters</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right: canvas */}
        <div
          className={cn(
            "shrink-0 flex flex-col bg-muted/30 transition-[width] duration-200",
            canvasSize === "min" && "w-[160px] p-3",
            canvasSize === "small" && "w-[420px] p-5",
            canvasSize === "large" && "w-[640px] p-5"
          )}
        >
          <div className={cn("flex items-center justify-between gap-2", canvasSize === "min" ? "mb-2" : "mb-3")}>
            {canvasSize !== "min" && (
              <span className="font-display text-sm font-medium">Look canvas</span>
            )}
            <div className={cn("flex items-center gap-2", canvasSize === "min" && "w-full justify-between")}>
              <div className="flex items-center gap-0.5 border border-border rounded-sm p-0.5 bg-background">
                {([
                  { key: "min", icon: Minimize2Icon, label: "Minimize (1)" },
                  { key: "small", icon: SquareIcon, label: "Small (2)" },
                  { key: "large", icon: Maximize2Icon, label: "Large (3)" },
                ] as const).map(({ key, icon: Icon, label }) => (
                  <button
                    key={key}
                    onClick={() => setCanvasSize(key)}
                    aria-label={label}
                    title={label}
                    className={cn(
                      "h-6 w-6 rounded-sm flex items-center justify-center transition-colors",
                      canvasSize === key
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="h-3 w-3" />
                  </button>
                ))}
              </div>
              <span className="font-body text-[11px] text-muted-foreground">
                {canvas.length}/12
              </span>
            </div>
          </div>
          {canvasSize === "min" ? (
            <div
              ref={canvasRef}
              role="button"
              tabIndex={0}
              onClick={() => setCanvasSize("small")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setCanvasSize("small");
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                handleCanvasDrop(e);
                setCanvasSize("small");
              }}
              title="Expand canvas — drop items here to add"
              className="relative aspect-square w-full rounded-sm border border-border bg-background overflow-hidden hover:border-foreground transition-colors cursor-pointer"
            >
              {canvas.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2 pointer-events-none">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center mb-1.5">
                    <PlusIcon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="font-body text-[10px] text-muted-foreground leading-tight">
                    Empty look
                  </p>
                </div>
              ) : (
                canvas.map((c, idx) => {
                  const crop = c.crop ?? { top: 0, right: 0, bottom: 0, left: 0 };
                  const sX = 100 / Math.max(1, 100 - crop.left - crop.right);
                  const sY = 100 / Math.max(1, 100 - crop.top - crop.bottom);
                  return (
                    <div
                      key={c.uid}
                      style={{ left: `${c.x}%`, top: `${c.y}%`, width: "30%", aspectRatio: "1 / 1", zIndex: idx + 1 }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-sm overflow-hidden border border-border bg-card shadow-sm pointer-events-none"
                    >
                      <div
                        className="absolute"
                        style={{
                          top: `${-crop.top * sY}%`,
                          left: `${-crop.left * sX}%`,
                          width: `${sX * 100}%`,
                          height: `${sY * 100}%`,
                          transform: `scale(${c.flipH ? -1 : 1}, ${c.flipV ? -1 : 1})`,
                        }}
                      >
                        <Image src={c.image} alt="" width={400} height={400} unoptimized className="w-full h-full object-cover" draggable={false} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
          <div
            ref={canvasRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleCanvasDrop}
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedUid(null);
            }}
            className="relative aspect-square w-full rounded-sm border-2 border-dashed border-border bg-background overflow-hidden"
          >
            {canvas.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <PlusIcon className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="font-body text-sm text-muted-foreground">
                  Click or drag items here
                </p>
                <p className="font-body text-xs text-muted-foreground/60 mt-1">
                  Build the outfit by adding pieces
                </p>
              </div>
            )}

            {canvas.map((c, idx) => {
              const selected = selectedUid === c.uid;
              const crop = c.crop ?? { top: 0, right: 0, bottom: 0, left: 0 };
              const scaleX = 100 / Math.max(1, 100 - crop.left - crop.right);
              const scaleY = 100 / Math.max(1, 100 - crop.top - crop.bottom);
              return (
                <div
                  key={c.uid}
                  draggable
                  onDragStart={() => {
                    movingUid.current = c.uid;
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedUid(c.uid);
                  }}
                  style={{ left: `${c.x}%`, top: `${c.y}%`, zIndex: idx + 1 }}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                >
                  <div
                    style={{
                      width: canvasSize === "small" ? "26%" : "22%",
                      aspectRatio: "1 / 1",
                    }}
                    className={cn(
                      "relative rounded-sm overflow-hidden bg-card shadow-sm cursor-move border",
                      selected ? "border-foreground ring-2 ring-foreground/20" : "border-border"
                    )}
                  >
                    <div
                      className="absolute"
                      style={{
                        top: `${-crop.top * scaleY}%`,
                        left: `${-crop.left * scaleX}%`,
                        width: `${scaleX * 100}%`,
                        height: `${scaleY * 100}%`,
                        transform: `scale(${c.flipH ? -1 : 1}, ${c.flipV ? -1 : 1})`,
                      }}
                    >
                      <Image
                        src={c.image}
                        alt="Canvas item"
                        width={400}
                        height={400}
                        unoptimized
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    </div>
                    {c.bgRemoving && (
                      <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                        <Loader2Icon className="h-4 w-4 animate-spin text-foreground" />
                      </div>
                    )}
                  </div>

                  {selected && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-1/2 -translate-x-1/2 -top-10 flex items-center gap-0.5 px-1 py-1 rounded-sm bg-popover border border-border shadow-md"
                      style={{ zIndex: 999 }}
                    >
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => handleRemoveBg(c.uid)}
                              className={cn(
                                "h-7 w-7 rounded-sm flex items-center justify-center hover:bg-muted transition-colors",
                                c.bgRemoved && "bg-muted"
                              )}
                              disabled={c.bgRemoving}
                            >
                              <EraserIcon className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">{c.bgRemoved ? "Restore background" : "Remove background"}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => openCrop(c.uid)}
                              className="h-7 w-7 rounded-sm flex items-center justify-center hover:bg-muted transition-colors"
                            >
                              <ScissorsIcon className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">Crop</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => updateItem(c.uid, { flipH: !c.flipH })}
                              className={cn(
                                "h-7 w-7 rounded-sm flex items-center justify-center hover:bg-muted transition-colors",
                                c.flipH && "bg-muted"
                              )}
                            >
                              <FlipHorizontalIcon className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">Flip horizontal</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => updateItem(c.uid, { flipV: !c.flipV })}
                              className={cn(
                                "h-7 w-7 rounded-sm flex items-center justify-center hover:bg-muted transition-colors",
                                c.flipV && "bg-muted"
                              )}
                            >
                              <FlipVerticalIcon className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">Flip vertical</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => sendToBack(c.uid)}
                              className="h-7 w-7 rounded-sm flex items-center justify-center hover:bg-muted transition-colors"
                            >
                              <ArrowDownToLineIcon className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">Send to back</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => sendToFront(c.uid)}
                              className="h-7 w-7 rounded-sm flex items-center justify-center hover:bg-muted transition-colors"
                            >
                              <ArrowUpToLineIcon className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">Bring to front</TooltipContent>
                        </Tooltip>
                        <div className="w-px h-4 bg-border mx-0.5" />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => {
                                removeFromCanvas(c.uid);
                                setSelectedUid(null);
                              }}
                              className="h-7 w-7 rounded-sm flex items-center justify-center hover:bg-destructive/10 hover:text-destructive transition-colors"
                            >
                              <Trash2Icon className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">Remove</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )}
          {selectedUid && (
            <p className="font-body text-[11px] text-muted-foreground mt-2">
              Click an item to edit it. Click empty canvas to deselect.
            </p>
          )}
        </div>
      </div>

      <ClientDetailPanel
        open={clientInfoOpen}
        onOpenChange={setClientInfoOpen}
        sessionId={sessionId || null}
      />

      <ProductDetailDialog
        open={!!pdpItem}
        onOpenChange={(o) => !o && setPdpItem(null)}
        product={
          pdpItem
            ? {
                id: pdpItem.id,
                image: pdpItem.image,
                brand: `${pdpItem.brand} — ${pdpItem.name}`,
                price: pdpItem.price ?? "—",
              }
            : null
        }
        stylistContext={(() => {
          if (!pdpItem) return undefined;
          const profile = clientProfile;
          // Map inventory category → client profile keys
          const sizeKeyMap: Record<string, string> = {
            tops: "Tops",
            bottoms: "Bottoms",
            outerwear: "Outerwear",
            shoes: "Shoes",
            accessories: "",
          };
          const budgetKeyMap: Record<string, string> = {
            tops: "Tops",
            bottoms: "Bottoms",
            outerwear: "Tops",
            shoes: "Shoes",
            accessories: "Accessories",
          };
          const sizeKey = sizeKeyMap[pdpItem.category];
          const budgetKey = budgetKeyMap[pdpItem.category];
          const clientSize = sizeKey && profile?.sizes ? profile.sizes[sizeKey] : undefined;
          const budgetLabel = budgetKey && profile?.budgets ? profile.budgets[budgetKey] : undefined;
          // Parse budget label like "$50–$100" or "$50-$100"
          let budgetRange: [number, number] | undefined;
          if (budgetLabel) {
            const nums = budgetLabel.replace(/,/g, "").match(/\d+/g);
            if (nums && nums.length >= 2) budgetRange = [parseInt(nums[0]), parseInt(nums[1])];
          }
          const productPrice = pdpItem.price ? parseInt(pdpItem.price.replace(/[^0-9]/g, "")) : undefined;
          return {
            clientName,
            clientSize,
            availableSizes: pdpItem.sizes,
            productPrice: isNaN(productPrice as number) ? undefined : productPrice,
            budgetRange,
            budgetLabel,
            categoryLabel: pdpItem.category.charAt(0).toUpperCase() + pdpItem.category.slice(1),
          };
        })()}
        addLabel="Add to canvas"
        onAddToCart={() => {
          if (pdpItem) {
            addToCanvas(pdpItem);
            toast.success(`Added ${pdpItem.brand} to canvas`);
            setPdpItem(null);
          }
        }}
      />

      <Dialog open={!!cropUid} onOpenChange={(o) => !o && setCropUid(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-base">Crop item</DialogTitle>
          </DialogHeader>
          {cropUid && (() => {
            const item = canvas.find((c) => c.uid === cropUid);
            if (!item) return null;
            const sx = 100 / Math.max(1, 100 - cropDraft.left - cropDraft.right);
            const sy = 100 / Math.max(1, 100 - cropDraft.top - cropDraft.bottom);
            return (
              <div className="space-y-4">
                <div className="relative aspect-square w-full rounded-sm overflow-hidden border border-border bg-muted">
                  <div
                    className="absolute"
                    style={{
                      top: `${-cropDraft.top * sy}%`,
                      left: `${-cropDraft.left * sx}%`,
                      width: `${sx * 100}%`,
                      height: `${sy * 100}%`,
                      transform: `scale(${item.flipH ? -1 : 1}, ${item.flipV ? -1 : 1})`,
                    }}
                  >
                    <Image src={item.image} alt="Crop preview" width={400} height={400} unoptimized className="w-full h-full object-cover" />
                  </div>
                </div>
                {(["top", "right", "bottom", "left"] as const).map((side) => (
                  <div key={side}>
                    <div className="flex justify-between font-body text-xs mb-1.5">
                      <span className="capitalize text-muted-foreground">{side}</span>
                      <span className="text-foreground">{Math.round(cropDraft[side])}%</span>
                    </div>
                    <Slider
                      value={[cropDraft[side]]}
                      max={45}
                      step={1}
                      onValueChange={(v) => setCropDraft((d) => ({ ...d, [side]: (v as readonly number[])[0] }))}
                    />
                  </div>
                ))}
              </div>
            );
          })()}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" size="sm" onClick={resetCrop} className="font-body text-xs">
              Reset
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCropUid(null)} className="font-body text-xs">
              Cancel
            </Button>
            <Button size="sm" onClick={applyCrop} className="font-body text-xs gap-1.5">
              <CheckIcon className="h-3.5 w-3.5" />
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={saveOpen} onOpenChange={(o) => { if (isSaving) return; setSaveOpen(o); if (!o) { setSaveDescTouched(false); setLookNameTouched(false); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-foreground">Save look for {clientName}</DialogTitle>
            <DialogDescription className="font-body text-sm text-foreground/70">
              Name your look, explain why you styled it, and add a few tags to capture what the client asked for.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="look-name" className="font-body text-sm font-semibold text-foreground">
                  Look name <span className="text-destructive">*</span>
                </Label>
                <span className="font-body text-xs text-foreground/60">
                  {lookName.length}/80
                </span>
              </div>
              <Input
                id="look-name"
                placeholder="e.g. Sunset rooftop dinner"
                value={lookName}
                onChange={(e) => setLookName(e.target.value.slice(0, 80))}
                onBlur={() => setLookNameTouched(true)}
                className={cn(
                  "h-11 font-body text-base text-foreground rounded-sm",
                  lookNameTouched && !lookName.trim() && "border-destructive focus-visible:ring-destructive"
                )}
              />
              {lookNameTouched && !lookName.trim() && (
                <p className="font-body text-sm text-destructive mt-1.5">
                  A name is required.
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="look-desc" className="font-body text-sm font-semibold text-foreground">
                  Why this look <span className="text-destructive">*</span>
                </Label>
                <span className="font-body text-xs text-foreground/60">
                  {saveDescription.length}/{MAX_DESC}
                </span>
              </div>
              <Textarea
                id="look-desc"
                placeholder="Explain your styling choices for the client (mandatory)…"
                value={saveDescription}
                onChange={(e) => setSaveDescription(e.target.value.slice(0, MAX_DESC))}
                onBlur={() => setSaveDescTouched(true)}
                rows={6}
                className={cn(
                  "font-body text-base text-foreground resize-none",
                  saveDescTouched && !saveDescription.trim() && "border-destructive focus-visible:ring-destructive"
                )}
              />
              {saveDescTouched && !saveDescription.trim() && (
                <p className="font-body text-sm text-destructive mt-1.5">
                  A description is required.
                </p>
              )}
            </div>

            <div>
              <h4 className="font-display text-sm font-semibold uppercase tracking-wider text-foreground mb-3">
                Client brief tags
              </h4>
              <div className="grid grid-cols-2 gap-4">
                {([
                  { key: "event" as const, label: "Event", placeholder: "e.g. Beach wedding" },
                  { key: "bodyType" as const, label: "Body type", placeholder: "e.g. Pear" },
                  { key: "fitPreference" as const, label: "Fit preference", placeholder: "e.g. Relaxed" },
                  { key: "highlights" as const, label: "Highlights", placeholder: "e.g. Show waist" },
                ]).map((t) => (
                  <div key={t.key}>
                    <Label htmlFor={`tag-${t.key}`} className="font-body text-sm font-medium text-foreground">
                      {t.label}
                    </Label>
                    <Input
                      id={`tag-${t.key}`}
                      placeholder={t.placeholder}
                      value={saveTags[t.key]}
                      onChange={(e) =>
                        setSaveTags((prev) => ({ ...prev, [t.key]: e.target.value.slice(0, MAX_TAG) }))
                      }
                      className="h-10 mt-1.5 font-body text-sm text-foreground rounded-sm"
                    />
                  </div>
                ))}
              </div>
              {(saveTags.event || saveTags.bodyType || saveTags.fitPreference || saveTags.highlights) && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {Object.entries(saveTags)
                    .filter(([, v]) => v.trim())
                    .map(([k, v]) => (
                      <Badge key={k} variant="secondary" className="font-body text-xs text-foreground">
                        {v}
                      </Badge>
                    ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setSaveOpen(false)}
              disabled={isSaving}
              className="font-body text-sm text-foreground"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmSave}
              disabled={isSaving || !saveDescription.trim() || !lookName.trim()}
              className="font-body text-sm gap-1.5 bg-foreground text-background hover:bg-foreground/90"
            >
              {isSaving ? (
                <>
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <SendIcon className="h-4 w-4" />
                  Save & send
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Re-export the prior CartItemView shape so page.tsx imports keep compiling.
export interface CartItemView {
  id: string;
  inventoryProductId: string;
  imageUrl: string | null;
  name: string;
  brand: string;
  priceCents: number;
}
