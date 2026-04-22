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

  // Payouts + payments do NOT cascade from Session, so clear them first.
  const payoutsDeleted = await prisma.payout.deleteMany({
    where: {
      OR: [
        stylistProfileIds.length > 0
          ? { stylistProfileId: { in: stylistProfileIds } }
          : { id: "__never__" },
        sessionIds.length > 0
          ? { sessionId: { in: sessionIds } }
          : { id: "__never__" },
      ],
    },
  });

  const paymentsDeleted = await prisma.payment.deleteMany({
    where: {
      OR: [
        { userId: { in: userIds } },
        sessionIds.length > 0
          ? { sessionId: { in: sessionIds } }
          : { id: "__never__" },
      ],
    },
  });

  // Session-scoped boards only (preserves any profile boards on stylist
  // profiles, which have sessionId=null).
  const boardsDeleted =
    sessionIds.length > 0
      ? await prisma.board.deleteMany({ where: { sessionId: { in: sessionIds } } })
      : { count: 0 };

  // Session delete cascades Message, SessionPendingAction, SessionMatchHistory.
  const sessionsDeleted =
    sessionIds.length > 0
      ? await prisma.session.deleteMany({ where: { id: { in: sessionIds } } })
      : { count: 0 };

  // User-scoped rows (all cascade from User but we keep the User itself).
  const subscriptionsDeleted = await prisma.subscription.deleteMany({
    where: { userId: { in: userIds } },
  });
  const ordersDeleted = await prisma.order.deleteMany({
    where: { userId: { in: userIds } },
  });
  const affiliateClicksDeleted = await prisma.affiliateClick.deleteMany({
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
  const reviewsDeleted = await prisma.stylistReview.deleteMany({
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
