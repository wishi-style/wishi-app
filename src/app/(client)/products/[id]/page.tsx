import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getProduct } from "@/lib/inventory/inventory-client";
import { AddToCartButton } from "./add-to-cart-button";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sessionId?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id).catch(() => null);
  if (!product) return { title: "Product — Wishi" };
  const title = [product.brand_name, product.canonical_name]
    .filter(Boolean)
    .join(" · ");
  return { title: `${title} — Wishi` };
}

/**
 * Lightweight in-app PDP. Pulls the canonical product doc from the
 * tastegraph inventory service and renders image / brand / price /
 * description plus two CTAs:
 *   - Add to Cart (when sessionId is present in the query — every entry
 *     point from chat / curated tiles passes it).
 *   - View on retailer (deep-link to the merchant's own page; opens in a
 *     new tab so the user can explore beyond what we surface).
 *
 * The full Loveable-equivalent ProductDetailDialog is tracked under the
 * launch-prep follow-ups; this page is the minimum that makes a curated
 * piece tappable and gives clients somewhere coherent to land.
 */
export default async function ProductPage({ params, searchParams }: Props) {
  const [{ id }, { sessionId }] = await Promise.all([params, searchParams]);
  const [user, product] = await Promise.all([
    getCurrentUser(),
    getProduct(id).catch(() => null),
  ]);
  if (!product) notFound();

  const heroImage =
    product.primary_image_url ?? product.image_urls[0] ?? null;
  const galleryImages = product.image_urls
    .filter((u) => u !== heroImage)
    .slice(0, 3);
  const listing = product.listings.find((l) => l.in_stock) ?? product.listings[0];
  const retailerUrl = listing?.affiliate_url || listing?.product_url || null;
  const merchantName = listing?.merchant_name ?? null;

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: product.currency || "USD",
    minimumFractionDigits:
      product.min_price % 1 === 0 && product.max_price % 1 === 0 ? 0 : 2,
  });
  const priceLabel =
    product.min_price === product.max_price
      ? formatter.format(product.min_price)
      : `${formatter.format(product.min_price)} – ${formatter.format(product.max_price)}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <Link
        href={sessionId ? `/sessions/${sessionId}/chat` : "/cart"}
        className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back
      </Link>

      <div className="grid gap-10 md:grid-cols-2">
        <div className="space-y-3">
          <div className="aspect-square overflow-hidden rounded-lg bg-muted">
            {heroImage ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={heroImage}
                alt={product.canonical_name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                No image
              </div>
            )}
          </div>
          {galleryImages.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              {galleryImages.map((src) => (
                <div
                  key={src}
                  className="aspect-square overflow-hidden rounded-md bg-muted"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-5">
          {product.brand_name && (
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              {product.brand_name}
            </p>
          )}
          <h1 className="font-display text-3xl leading-tight md:text-4xl">
            {product.canonical_name}
          </h1>
          <p className="font-body text-2xl tabular-nums">{priceLabel}</p>
          {!product.in_stock && (
            <p className="text-sm font-medium text-destructive">Sold out</p>
          )}

          {product.canonical_description && (
            <p className="whitespace-pre-line font-body text-sm leading-6 text-foreground/80">
              {product.canonical_description}
            </p>
          )}

          {product.available_sizes.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Sizes
              </p>
              <p className="font-body text-sm">
                {product.available_sizes.join(", ")}
              </p>
            </div>
          )}
          {product.available_colors.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Colors
              </p>
              <p className="font-body text-sm">
                {product.available_colors.join(", ")}
              </p>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-2.5 border-t border-border pt-6">
            {product.in_stock && sessionId && user ? (
              <AddToCartButton
                inventoryProductId={product.id}
                sessionId={sessionId}
              />
            ) : null}
            {retailerUrl && (
              <a
                href={retailerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-foreground"
              >
                {merchantName ? `View on ${merchantName}` : "View on retailer"}
                <ExternalLinkIcon className="h-3.5 w-3.5" />
              </a>
            )}
            {!product.in_stock && !retailerUrl && (
              <p className="text-sm text-muted-foreground">
                This item isn&rsquo;t available right now.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
