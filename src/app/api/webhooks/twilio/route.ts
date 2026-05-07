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
    // Return 200 with structured logging instead of 500. Twilio retries on
    // 5xx, which can produce a thundering herd of duplicate inserts when a
    // transient DB error is the actual cause. The inline mirror in
    // sendTwilioMessage is the durable write; the webhook is best-effort
    // backup. Logged failures show up in CloudWatch for triage.
    console.error(
      JSON.stringify({
        event: "twilio_webhook_handler_failed",
        eventType,
        messageSid: params.MessageSid ?? null,
        conversationSid: params.ConversationSid ?? null,
        author: params.Author ?? null,
        err: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      }),
    );
  }

  return NextResponse.json({ ok: true });
}
