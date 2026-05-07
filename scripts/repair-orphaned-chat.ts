/**
 * Repair orphaned chat sessions.
 *
 * Finds sessions that should have a Twilio Conversation but don't:
 *   - status ∈ {ACTIVE, PENDING_END, PENDING_END_APPROVAL, FROZEN}
 *   - both clientId and stylistId set
 *   - twilioChannelSid is NULL
 *
 * For each, runs `createChatConversation` (which is idempotent — it'll reuse
 * an existing Twilio conversation by `uniqueName: session-<id>` if one exists,
 * or create a fresh one) and writes the SID back to the row.
 *
 * Run:
 *   npx tsx --env-file=.env scripts/repair-orphaned-chat.ts            # report only
 *   npx tsx --env-file=.env scripts/repair-orphaned-chat.ts --apply    # actually heal
 *
 * Required env: DATABASE_URL, TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID,
 * TWILIO_API_KEY_SECRET, TWILIO_CONVERSATIONS_SERVICE_SID.
 */

import { prisma } from "@/lib/prisma";
import { createChatConversation } from "@/lib/chat/create-conversation";

const APPLY = process.argv.includes("--apply");

interface Outcome {
  sessionId: string;
  status: string;
  result: "healed" | "skipped" | "failed";
  channelSid?: string;
  reason?: string;
}

async function main() {
  const candidates = await prisma.session.findMany({
    where: {
      twilioChannelSid: null,
      status: { in: ["ACTIVE", "PENDING_END", "PENDING_END_APPROVAL", "FROZEN"] },
      clientId: { not: undefined },
      stylistId: { not: null },
      deletedAt: null,
    },
    select: {
      id: true,
      status: true,
      stylistId: true,
      clientId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(
    `[repair-orphaned-chat] Found ${candidates.length} orphaned session(s) (mode=${APPLY ? "APPLY" : "DRY-RUN"})`,
  );

  if (candidates.length === 0) return;

  if (!APPLY) {
    for (const s of candidates) {
      console.log(
        `  - session=${s.id} status=${s.status} created=${s.createdAt.toISOString()}`,
      );
    }
    console.log("\nRun with --apply to actually heal.");
    return;
  }

  const outcomes: Outcome[] = [];
  for (const s of candidates) {
    try {
      const sid = await createChatConversation(s.id);
      outcomes.push({
        sessionId: s.id,
        status: s.status,
        result: "healed",
        channelSid: sid,
      });
      console.log(`  ✓ ${s.id} → ${sid}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outcomes.push({
        sessionId: s.id,
        status: s.status,
        result: "failed",
        reason: message,
      });
      console.error(`  ✗ ${s.id} — ${message}`);
    }
  }

  const healed = outcomes.filter((o) => o.result === "healed").length;
  const failed = outcomes.filter((o) => o.result === "failed").length;
  console.log(`\nRepaired ${healed}/${candidates.length}, failed ${failed}.`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
