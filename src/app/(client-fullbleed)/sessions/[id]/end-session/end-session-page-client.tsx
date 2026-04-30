"use client";

import { useRouter } from "next/navigation";
import { PostSessionModal } from "@/components/session/post-session-modal";

export function EndSessionPageClient(props: {
  sessionId: string;
  stylistFirstName: string;
  planPriceCents: number;
  referralCode: string;
}) {
  const router = useRouter();
  return (
    <PostSessionModal
      sessionId={props.sessionId}
      stylistFirstName={props.stylistFirstName}
      planPriceCents={props.planPriceCents}
      referralCode={props.referralCode}
      onClose={() => router.push("/sessions")}
    />
  );
}
