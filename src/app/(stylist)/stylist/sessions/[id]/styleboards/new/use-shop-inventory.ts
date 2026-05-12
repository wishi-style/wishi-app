"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AdaptedInventoryItem, CategoryBucket } from "@/lib/inventory/adapt-product-doc";
import type {
  AppliedSmartDefault,
  ShopInventoryFilters,
  SmartDefaultKind,
} from "@/lib/inventory/shop-inventory.defaults";
import type { ShopInventoryResponse } from "@/lib/inventory/shop-inventory.service";
import type {
  ClientStylingContextSummary,
} from "@/lib/inventory/client-context";
import type { FilterValuesResponse } from "@/lib/inventory/types";

/**
 * Client-side state machine for the LookCreator Shop workspace.
 *
 * Owns:
 *   - The current filter set (chrome-side: query, mode, retailers, colors,
 *     sizes, fabric, fabric tiers, sub-colors, price, in-stock, leather,
 *     gender, sort).
 *   - The set of smart-default kinds the stylist has dismissed for this
 *     session (persisted to sessionStorage so a tab switch doesn't reset).
 *   - The current page of `ShopInventoryResponse` (items, total,
 *     visibleApprox, applied defaults, optional power-mode metadata).
 *   - In-flight request cancellation, debounced query input, a small LRU
 *     cache of recent filter→response pairs.
 *
 * Surfaces high-level methods (`setFilters`, `loadMore`, `reset`,
 * `dismissSmartDefault`, `searchLooksLikeCanvas`, `searchSimilarTo`,
 * `clearPowerMode`) so the builder can stay declarative.
 */

const DEBOUNCE_MS = 250;
const LRU_LIMIT = 10;
const DISMISSED_STORAGE_KEY = (sessionId: string) =>
  `wishi:shop:${sessionId}:dismissed`;

type Status = "idle" | "loading" | "loading-more" | "error";

interface UseShopInventoryOpts {
  sessionId: string;
  initial: ShopInventoryResponse;
  facets: FilterValuesResponse;
  context: ClientStylingContextSummary | null;
  category: CategoryBucket;
}

interface PowerMode {
  kind: "similar" | "direction";
  label: string;
  payload:
    | { kind: "similar"; productId: string }
    | { kind: "direction"; listingIds: string[] };
}

interface FetchInvocation {
  filters: ShopInventoryFilters;
  category: CategoryBucket;
  dismissed: SmartDefaultKind[];
  page: number;
  pageSize: number;
  power?: PowerMode["payload"];
}

function buildCacheKey(inv: FetchInvocation): string {
  return JSON.stringify(inv);
}

function readDismissed(sessionId: string): Set<SmartDefaultKind> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(DISMISSED_STORAGE_KEY(sessionId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as SmartDefaultKind[];
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

function writeDismissed(sessionId: string, set: Set<SmartDefaultKind>) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      DISMISSED_STORAGE_KEY(sessionId),
      JSON.stringify([...set]),
    );
  } catch {
    /* sessionStorage may be unavailable; non-fatal */
  }
}

async function fetchShopInventory(
  sessionId: string,
  inv: FetchInvocation,
  signal: AbortSignal,
): Promise<ShopInventoryResponse> {
  const power = inv.power;
  if (power?.kind === "similar") {
    const url = `/api/stylist/sessions/${encodeURIComponent(
      sessionId,
    )}/shop-inventory/similar/${encodeURIComponent(power.productId)}?limit=${inv.pageSize}`;
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Similar search failed (${res.status})`);
    return (await res.json()) as ShopInventoryResponse;
  }
  if (power?.kind === "direction") {
    const url = `/api/stylist/sessions/${encodeURIComponent(
      sessionId,
    )}/shop-inventory/looks-like`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        listingIds: power.listingIds,
        page: inv.page,
        pageSize: inv.pageSize,
        filters: { ...inv.filters, category: inv.category },
      }),
      signal,
    });
    if (!res.ok) throw new Error(`Looks-like search failed (${res.status})`);
    return (await res.json()) as ShopInventoryResponse;
  }

  const body = {
    ...inv.filters,
    category: inv.category,
    dismissedDefaults: inv.dismissed,
    page: inv.page,
    pageSize: inv.pageSize,
  };
  const res = await fetch(
    `/api/stylist/sessions/${encodeURIComponent(sessionId)}/shop-inventory`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    },
  );
  if (!res.ok) throw new Error(`Shop search failed (${res.status})`);
  return (await res.json()) as ShopInventoryResponse;
}

// Inventory occasionally returns the same product across consecutive pages
// (re-ranking on a moving page boundary). Without dedup, React throws
// "Encountered two children with the same key" and the duplicate row is
// dropped silently. Keep the first occurrence so existing favorites / canvas
// references stay attached to the earlier instance.
function dedupById(
  prev: AdaptedInventoryItem[],
  next: AdaptedInventoryItem[],
): AdaptedInventoryItem[] {
  const seen = new Set(prev.map((it) => it.id));
  const merged = prev.slice();
  for (const it of next) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    merged.push(it);
  }
  return merged;
}

export function useShopInventory(opts: UseShopInventoryOpts) {
  const { sessionId, initial, facets, context } = opts;
  // `category` flows through as a controlled prop. Reseting `size` /
  // `budget` from the dismissed set when the bucket changes happens in the
  // effect below, which observes the prop directly.
  const category = opts.category;

  const [filters, setFiltersState] = useState<ShopInventoryFilters>({});
  const [dismissed, setDismissed] = useState<Set<SmartDefaultKind>>(() =>
    readDismissed(sessionId),
  );

  // Note: dismissed defaults are scoped per-session, not per-category bucket.
  // If the stylist dismisses "Size M tops" then switches to Bottoms, the
  // bucket-scoped resolver already only attaches the size chip when the
  // bucket has a corresponding client size — so dismissing tops won't
  // silence bottoms. "Reset to her profile" wipes the whole set.

  const [response, setResponse] = useState<ShopInventoryResponse>(initial);
  const [items, setItems] = useState<AdaptedInventoryItem[]>(initial.items);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<Error | null>(null);

  const [powerMode, setPowerMode] = useState<PowerMode | null>(null);

  const lruRef = useRef<Map<string, ShopInventoryResponse>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildInvocation = useCallback(
    (overrides: Partial<FetchInvocation>): FetchInvocation => ({
      filters,
      category,
      dismissed: [...dismissed],
      page: 1,
      pageSize: 120,
      power: powerMode?.payload,
      ...overrides,
    }),
    [filters, category, dismissed, powerMode],
  );

  const run = useCallback(
    async (
      inv: FetchInvocation,
      mode: "replace" | "append",
    ): Promise<void> => {
      const key = buildCacheKey(inv);
      const cached = lruRef.current.get(key);
      if (cached) {
        lruRef.current.delete(key);
        lruRef.current.set(key, cached);
        if (mode === "replace") {
          setResponse(cached);
          setItems(cached.items);
        } else {
          setResponse(cached);
          setItems((prev) => dedupById(prev, cached.items));
        }
        setStatus("idle");
        setError(null);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus(mode === "append" ? "loading-more" : "loading");
      setError(null);

      try {
        const result = await fetchShopInventory(sessionId, inv, controller.signal);
        lruRef.current.set(key, result);
        if (lruRef.current.size > LRU_LIMIT) {
          const oldest = lruRef.current.keys().next().value;
          if (oldest !== undefined) lruRef.current.delete(oldest);
        }
        setResponse(result);
        if (mode === "replace") {
          setItems(result.items);
        } else {
          setItems((prev) => dedupById(prev, result.items));
        }
        setStatus("idle");
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus("error");
      }
    },
    [sessionId],
  );

  // Schedule an effect-driven refetch for filter + category + dismissed
  // changes. Query field is debounced; everything else fires immediately.
  const lastRunSignatureRef = useRef<string>("");
  useEffect(() => {
    // Don't run a refetch on initial mount — `initial` is page-1 already.
    const inv = buildInvocation({ page: 1 });
    const sig = buildCacheKey(inv);
    if (sig === lastRunSignatureRef.current) return;
    lastRunSignatureRef.current = sig;

    // Skip the very first signature (matches the SSR initial fetch shape).
    if (
      sig ===
      buildCacheKey({
        filters: {},
        category: opts.category,
        dismissed: [...readDismissed(sessionId)],
        page: 1,
        pageSize: 120,
        power: undefined,
      })
    ) {
      return;
    }

    const queryChanged = !!filters.query;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    if (queryChanged) {
      debounceTimerRef.current = setTimeout(() => {
        void run(inv, "replace");
      }, DEBOUNCE_MS);
      return () => {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      };
    }
    void run(inv, "replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // Stringify so deep change in the filter object actually re-runs the effect
    JSON.stringify(filters),
    category,
    JSON.stringify([...dismissed]),
    JSON.stringify(powerMode?.payload ?? null),
    sessionId,
  ]);

  const setFilters = useCallback(
    (patch: Partial<ShopInventoryFilters>) => {
      setFiltersState((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  const loadMore = useCallback(() => {
    if (status === "loading-more") return;
    if (items.length >= response.total) return;
    const inv = buildInvocation({
      page: response.page + 1,
      pageSize: response.pageSize,
    });
    void run(inv, "append");
  }, [status, items.length, response, buildInvocation, run]);

  const dismissSmartDefault = useCallback(
    (kind: SmartDefaultKind) => {
      setDismissed((prev) => {
        const next = new Set(prev);
        next.add(kind);
        writeDismissed(sessionId, next);
        return next;
      });
    },
    [sessionId],
  );

  const restoreSmartDefaults = useCallback(() => {
    setDismissed(() => {
      const empty = new Set<SmartDefaultKind>();
      writeDismissed(sessionId, empty);
      return empty;
    });
  }, [sessionId]);

  const reset = useCallback(() => {
    setFiltersState({});
    setPowerMode(null);
    restoreSmartDefaults();
  }, [restoreSmartDefaults]);

  const searchLooksLikeCanvas = useCallback(
    (listingIds: string[], label: string) => {
      if (listingIds.length === 0) return;
      setPowerMode({
        kind: "direction",
        label,
        payload: { kind: "direction", listingIds },
      });
    },
    [],
  );

  const searchSimilarTo = useCallback((productId: string, label: string) => {
    setPowerMode({
      kind: "similar",
      label,
      payload: { kind: "similar", productId },
    });
  }, []);

  const clearPowerMode = useCallback(() => {
    setPowerMode(null);
  }, []);

  // Legacy alias kept for backward compatibility with callers that wired
  // `shop.setCategory(...)` directly. Category is now a controlled prop on
  // the hook; this helper just dismisses the per-bucket smart defaults so
  // they re-evaluate against the new bucket. Callers should set the chrome
  // category state themselves immediately after calling this.
  const setActiveCategory = useCallback(
    (_next: CategoryBucket) => {
      setDismissed((prev) => {
        const cleaned = new Set(prev);
        cleaned.delete("size");
        cleaned.delete("budget");
        writeDismissed(sessionId, cleaned);
        return cleaned;
      });
    },
    [sessionId],
  );

  return {
    // Data
    items,
    total: response.total,
    visibleApprox: response.visibleApprox,
    page: response.page,
    pages: response.pages,
    pageSize: response.pageSize,
    appliedSmartDefaults: response.appliedSmartDefaults,
    powerMode: response.powerMode ?? null,
    isLoading: status === "loading",
    isLoadingMore: status === "loading-more",
    error,
    canLoadMore:
      items.length < response.total &&
      items.length < response.visibleApprox &&
      powerMode === null,

    // State
    filters,
    category,
    facets,
    context,

    // Mutations
    setFilters,
    setCategory: setActiveCategory,
    loadMore,
    dismissSmartDefault,
    restoreSmartDefaults,
    reset,
    searchLooksLikeCanvas,
    searchSimilarTo,
    clearPowerMode,
  } as const;
}

export type UseShopInventoryReturn = ReturnType<typeof useShopInventory>;
