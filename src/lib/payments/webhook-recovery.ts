interface RecoverableSession {
  status: string;
  stylistId: string | null;
}

interface CheckoutRecoveryPlanArgs {
  existingSession: RecoverableSession | null;
  explicitStylistUserId?: string | null;
  hasPayment: boolean;
}

interface SessionRecoveryPlanArgs {
  existingSession: RecoverableSession | null;
  explicitStylistUserId?: string | null;
}

export function buildCheckoutRecoveryPlan({
  existingSession,
  explicitStylistUserId,
  hasPayment,
}: CheckoutRecoveryPlanArgs) {
  const session = existingSession ?? {
    status: "BOOKED",
    stylistId: explicitStylistUserId ?? null,
  };

  return {
    shouldCreateSession: !existingSession,
    shouldCreatePayment: !hasPayment,
    shouldAutoMatch: shouldAutoMatchRecoveredSession({
      explicitStylistUserId,
      session,
    }),
  };
}

export function buildSessionRecoveryPlan({
  existingSession,
  explicitStylistUserId,
}: SessionRecoveryPlanArgs) {
  const session = existingSession ?? {
    status: "BOOKED",
    stylistId: explicitStylistUserId ?? null,
  };

  return {
    shouldCreateSession: !existingSession,
    shouldAutoMatch: shouldAutoMatchRecoveredSession({
      explicitStylistUserId,
      session,
    }),
  };
}

export function shouldAutoMatchRecoveredSession({
  explicitStylistUserId,
  session,
}: {
  explicitStylistUserId?: string | null;
  session: RecoverableSession;
}) {
  return !explicitStylistUserId && !session.stylistId && session.status === "BOOKED";
}
