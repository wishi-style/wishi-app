import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifyEasyPostWebhookSignature,
  trackerStatusToOrderStatus,
  type EasyPostEvent,
} from "@/lib/integrations/easypost";
import {
  nextAllowedStatuses,
  transitionOrderStatus,
} from "@/lib/orders/admin-orders.service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signatureHeader =
    req.headers.get("X-Hmac-Signature") ??
    req.headers.get("x-hmac-signature") ??
    req.headers.get("X-EasyPost-HMAC-Signature");

  const secret = process.env.EASYPOST_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[easypost webhook] EASYPOST_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  if (
    !verifyEasyPostWebhookSignature({
      rawBody,
      signatureHeader,
      secret,
    })
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: EasyPostEvent;
  try {
    event = JSON.parse(rawBody) as EasyPostEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // We only care about tracker updates for now. Everything else is 200-OK'd
  // so EasyPost doesn't keep retrying irrelevant events.
  if (event.description !== "tracker.updated" && event.description !== "tracker.created") {
    return NextResponse.json({ ok: true, ignored: event.description });
  }

  const tracker = event.result;
  if (!tracker?.tracking_code) {
    return NextResponse.json({ ok: true, ignored: "no_tracking_code" });
  }

  // One tracking number can match at most one active Wishi order — we
  // enforce that at admin-set time. If no order matches (e.g. the tracker
  // is for a legacy order, or admin re-typed the number), we no-op cleanly.
  const order = await prisma.order.findFirst({
    where: { trackingNumber: tracker.tracking_code },
    select: { id: true, status: true },
  });
  if (!order) {
    return NextResponse.json({ ok: true, ignored: "no_matching_order" });
  }

  const target = trackerStatusToOrderStatus(tracker.status);
  if (!target) {
    // Exceptional tracker state (return_to_sender, failure). Persist the
    // carrier/eta fields so admin sees fresh data but don't auto-transition.
    await prisma.order.update({
      where: { id: order.id },
      data: {
        carrier: tracker.carrier,
        estimatedDeliveryAt: tracker.est_delivery_date
          ? new Date(tracker.est_delivery_date)
          : undefined,
      },
    });
    return NextResponse.json({ ok: true, orderId: order.id, note: tracker.status });
  }

  // Only advance if the target is actually one of the current status's
  // allowed next states. This keeps webhook replays and out-of-order events
  // idempotent without throwing on redelivery.
  const allowed = nextAllowedStatuses(order.status);
  if (!allowed.includes(target)) {
    await prisma.order.update({
      where: { id: order.id },
      data: {
        carrier: tracker.carrier,
        estimatedDeliveryAt: tracker.est_delivery_date
          ? new Date(tracker.est_delivery_date)
          : undefined,
      },
    });
    return NextResponse.json({
      ok: true,
      orderId: order.id,
      note: `status ${order.status} cannot advance to ${target}`,
    });
  }

  await transitionOrderStatus(order.id, target);
  return NextResponse.json({ ok: true, orderId: order.id, transitionedTo: target });
}
