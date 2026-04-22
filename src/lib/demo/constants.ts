// Shared demo-account identifiers. Imported by the seed (prisma/seeds/
// demo-users.ts), the /demo sign-in actions, and the demo-reset worker so all
// three agree on which clerkIds are "demo" accounts.
export const DEMO_CLERK_IDS = {
  client: "demo-client-sasha",
  stylistMaya: "demo-stylist-maya",
  stylistJordan: "demo-stylist-jordan",
  stylistAlex: "demo-stylist-alex",
} as const;

export const DEMO_CLERK_ID_LIST: readonly string[] = Object.values(DEMO_CLERK_IDS);
