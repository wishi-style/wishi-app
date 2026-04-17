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

export async function runAffiliatePrompt(): Promise<PromptSummary> {
  const summary: PromptSummary = { prompted: 0, skipped: 0 };
  const clicks = await findUnpromptedClicks();

  for (const click of clicks) {
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
      summary.prompted += 1;
    } catch (err) {
      summary.skipped += 1;
      console.warn(`[affiliate-prompt] failed click ${click.id}:`, err);
    }
  }
  return summary;
}
