/**
 * Every 15 minutes. Finds AffiliateClick rows clicked > 24h ago that have
 * never been prompted and have no linked order. Fires
 * `affiliate.purchase_check` so the user can confirm "yes I bought it",
 * which creates a SELF_REPORTED Order on POST /api/affiliate/self-report.
 *
 * The in-app banner component reads unresolved prompts (promptSentAt set,
 * orderId null) directly, so no separate inbox model is needed.
 */
import {
  findUnpromptedClicks,
  markPromptSent,
} from "@/lib/affiliate/click-service";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { getProduct } from "@/lib/inventory/inventory-client";
import { resolveAppUrl } from "@/lib/app-url";

interface PromptSummary extends Record<string, unknown> {
  prompted: number;
  skipped: number;
}

const PROMPT_CONCURRENCY = 10;

type Click = Awaited<ReturnType<typeof findUnpromptedClicks>>[number];

async function promptOneClick(click: Click): Promise<"prompted" | "skipped"> {
  try {
    const product = await getProduct(click.inventoryProductId);
    const title = product?.canonical_name ?? "your recent find";
    await dispatchNotification({
      event: "affiliate.purchase_check",
      userId: click.userId,
      title: `Did you buy ${title}?`,
      body: `Let us know and we'll add it to your closet so your stylist can style with it.`,
      url: `${resolveAppUrl({ envAppUrl: process.env.APP_URL })}/settings/closet?selfReportClickId=${click.id}`,
    });
    await markPromptSent(click.id);
    return "prompted";
  } catch (err) {
    console.warn(`[affiliate-prompt] failed click ${click.id}:`, err);
    return "skipped";
  }
}

export async function runAffiliatePrompt(): Promise<PromptSummary> {
  const summary: PromptSummary = { prompted: 0, skipped: 0 };
  const clicks = await findUnpromptedClicks();

  for (let i = 0; i < clicks.length; i += PROMPT_CONCURRENCY) {
    const batch = clicks.slice(i, i + PROMPT_CONCURRENCY);
    const results = await Promise.all(batch.map(promptOneClick));
    for (const r of results) summary[r] += 1;
  }
  return summary;
}
