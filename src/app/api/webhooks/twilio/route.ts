import { NextRequest, NextResponse } from "next/server";
import Twilio from "twilio";
import { handleMessageAdded } from "@/lib/chat/webhook-handlers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error("[twilio-webhook] TWILIO_AUTH_TOKEN not set");
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  const signature = req.headers.get("x-twilio-signature") ?? "";
  const body = await req.text();
  const params = Object.fromEntries(new URLSearchParams(body));

  // Reconstruct the URL Twilio used to call us
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost";
  const webhookUrl =
    process.env.TWILIO_WEBHOOK_URL ?? `${proto}://${host}/api/webhooks/twilio`;

  const isValid = Twilio.validateRequest(authToken, signature, webhookUrl, params);
  if (!isValid) {
    console.warn("[twilio-webhook] Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const eventType = params.EventType;

  try {
    switch (eventType) {
      case "onMessageAdded":
        await handleMessageAdded(params as unknown as Parameters<typeof handleMessageAdded>[0]);
        break;
      default:
        // Acknowledge but ignore other event types
        break;
    }
  } catch (err) {
    console.error(`[twilio-webhook] Error handling ${eventType}:`, err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
