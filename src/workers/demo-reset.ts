/**
 * Daily reset for staging's /demo accounts. Wipes session-scoped data
 * (sessions, boards, messages, payments, payouts, subscriptions, orders,
 * affiliate activity, closet/favorites) so each day of demos starts from a
 * clean slate. Preserves the demo User rows + profiles + quiz answers so the
 * /demo login and auto-matcher keep working without a reseed.
 *
 * Guarded by E2E_AUTH_MODE (same flag that enables /demo) so this worker is a
 * no-op when the demo environment isn't active. Scheduled in
 * infra/modules/workers/main.tf only when enable_demo_mode = true.
 *
 * Delete order matters — several session-referencing FKs do NOT cascade:
 *   - Order.sessionId             → Session  (no cascade)
 *   - AffiliateClick.sessionId    → Session  (no cascade)
 *   - AffiliateClick.orderId      → Order    (no cascade)
 *   - StylistReview.sessionId     → Session  (no cascade)
 *   - Payment.sessionId           → Session  (no cascade)
 *   - Payout.sessionId            → Session  (no cascade)
 *   - Board.sessionId             → Session  (SetNull — safe but would orphan)
 * so every row referencing a demo session must be deleted BEFORE the session.
 * Filters must also cover the crossover case (non-demo user's row pointing at
 * a demo session, e.g. non-demo client books demo stylist).
 */
import { prisma } from "@/lib/prisma";
import { DEMO_CLERK_ID_LIST } from "@/lib/demo/constants";

interface ResetSummary extends Record<string, unknown> {
  skipped?: string;
  usersFound: number;
  sessionsDeleted: number;
  boardsDeleted: number;
  paymentsDeleted: number;
  payoutsDeleted: number;
  subscriptionsDeleted: number;
  ordersDeleted: number;
  affiliateClicksDeleted: number;
  closetItemsDeleted: number;
  favoriteItemsDeleted: number;
  favoriteBoardsDeleted: number;
  favoriteStylistsDeleted: number;
  reviewsDeleted: number;
  waitlistDeleted: number;
  pushSubsDeleted: number;
}

const EMPTY: ResetSummary = {
  usersFound: 0,
  sessionsDeleted: 0,
  boardsDeleted: 0,
  paymentsDeleted: 0,
  payoutsDeleted: 0,
  subscriptionsDeleted: 0,
  ordersDeleted: 0,
  affiliateClicksDeleted: 0,
  closetItemsDeleted: 0,
  favoriteItemsDeleted: 0,
  favoriteBoardsDeleted: 0,
  favoriteStylistsDeleted: 0,
  reviewsDeleted: 0,
  waitlistDeleted: 0,
  pushSubsDeleted: 0,
};

export async function runDemoReset(): Promise<ResetSummary> {
  if (process.env.E2E_AUTH_MODE !== "true") {
    return { ...EMPTY, skipped: "e2e_auth_mode_disabled" };
  }
  if (process.env.DEPLOYED_ENV === "production") {
    return { ...EMPTY, skipped: "production_env" };
  }

  const users = await prisma.user.findMany({
    where: { clerkId: { in: [...DEMO_CLERK_ID_LIST] } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  if (userIds.length === 0) {
    return { ...EMPTY, skipped: "no_demo_users" };
  }

  const sessions = await prisma.session.findMany({
    where: {
      OR: [{ clientId: { in: userIds } }, { stylistId: { in: userIds } }],
    },
    select: { id: true },
  });
  const sessionIds = sessions.map((s) => s.id);

  const stylistProfiles = await prisma.stylistProfile.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const stylistProfileIds = stylistProfiles.map((p) => p.id);

  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { userId: { in: userIds } },
        ...(sessionIds.length > 0 ? [{ sessionId: { in: sessionIds } }] : []),
      ],
    },
    select: { id: true },
  });
  const orderIds = orders.map((o) => o.id);

  // 1. AffiliateClicks before Orders (FK: click.orderId → order).
  //    Catch demo-user clicks + any click against a demo session or demo order
  //    (crossover: non-demo user clicks through a demo session).
  const affiliateClicksDeleted = await prisma.affiliateClick.deleteMany({
    where: {
      OR: [
        { userId: { in: userIds } },
        ...(sessionIds.length > 0 ? [{ sessionId: { in: sessionIds } }] : []),
        ...(orderIds.length > 0 ? [{ orderId: { in: orderIds } }] : []),
      ],
    },
  });

  // 2. Orders (cascades OrderItem). Covers crossover: non-demo client's order
  //    tied to a demo session would otherwise block the session delete.
  const ordersDeleted =
    orderIds.length > 0
      ? await prisma.order.deleteMany({ where: { id: { in: orderIds } } })
      : { count: 0 };

  // 3. StylistReviews — same crossover concern (non-demo client reviews demo
  //    stylist's demo session).
  const reviewsDeleted = await prisma.stylistReview.deleteMany({
    where: {
      OR: [
        { userId: { in: userIds } },
        ...(sessionIds.length > 0 ? [{ sessionId: { in: sessionIds } }] : []),
      ],
    },
  });

  // 4. Payouts (FK to both stylist_profile and session, neither cascade).
  const payoutsDeleted =
    stylistProfileIds.length > 0 || sessionIds.length > 0
      ? await prisma.payout.deleteMany({
          where: {
            OR: [
              ...(stylistProfileIds.length > 0
                ? [{ stylistProfileId: { in: stylistProfileIds } }]
                : []),
              ...(sessionIds.length > 0
                ? [{ sessionId: { in: sessionIds } }]
                : []),
            ],
          },
        })
      : { count: 0 };

  // 5. Payments (covers crossover via sessionId).
  const paymentsDeleted = await prisma.payment.deleteMany({
    where: {
      OR: [
        { userId: { in: userIds } },
        ...(sessionIds.length > 0 ? [{ sessionId: { in: sessionIds } }] : []),
      ],
    },
  });

  // 6. Session-scoped boards (Board.sessionId is SetNull, so deleting sessions
  //    would just orphan them — explicit delete is cleaner). Preserves any
  //    profile boards on stylist profiles (those have sessionId=null).
  const boardsDeleted =
    sessionIds.length > 0
      ? await prisma.board.deleteMany({
          where: { sessionId: { in: sessionIds } },
        })
      : { count: 0 };

  // 7. Sessions (cascades Message, SessionPendingAction, SessionMatchHistory).
  const sessionsDeleted =
    sessionIds.length > 0
      ? await prisma.session.deleteMany({ where: { id: { in: sessionIds } } })
      : { count: 0 };

  // 8. User-scoped rows (cascade from User; we keep the User itself).
  const subscriptionsDeleted = await prisma.subscription.deleteMany({
    where: { userId: { in: userIds } },
  });
  const closetItemsDeleted = await prisma.closetItem.deleteMany({
    where: { userId: { in: userIds } },
  });
  const favoriteItemsDeleted = await prisma.favoriteItem.deleteMany({
    where: { userId: { in: userIds } },
  });
  const favoriteBoardsDeleted = await prisma.favoriteBoard.deleteMany({
    where: { userId: { in: userIds } },
  });
  const favoriteStylistsDeleted = await prisma.favoriteStylist.deleteMany({
    where: { userId: { in: userIds } },
  });
  const waitlistDeleted = await prisma.stylistWaitlistEntry.deleteMany({
    where: { userId: { in: userIds } },
  });
  const pushSubsDeleted = await prisma.pushSubscription.deleteMany({
    where: { userId: { in: userIds } },
  });

  return {
    usersFound: userIds.length,
    sessionsDeleted: sessionsDeleted.count,
    boardsDeleted: boardsDeleted.count,
    paymentsDeleted: paymentsDeleted.count,
    payoutsDeleted: payoutsDeleted.count,
    subscriptionsDeleted: subscriptionsDeleted.count,
    ordersDeleted: ordersDeleted.count,
    affiliateClicksDeleted: affiliateClicksDeleted.count,
    closetItemsDeleted: closetItemsDeleted.count,
    favoriteItemsDeleted: favoriteItemsDeleted.count,
    favoriteBoardsDeleted: favoriteBoardsDeleted.count,
    favoriteStylistsDeleted: favoriteStylistsDeleted.count,
    reviewsDeleted: reviewsDeleted.count,
    waitlistDeleted: waitlistDeleted.count,
    pushSubsDeleted: pushSubsDeleted.count,
  };
}
