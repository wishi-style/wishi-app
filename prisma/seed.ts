import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { seedPlans } from "./seeds/plans";
import { seedQuizzes } from "./seeds/quizzes";
import { seedDemoUsers } from "./seeds/demo-users";
import { seedInspirations } from "./seeds/inspirations";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for seeding");
  }
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  console.log("Seeding database...");
  await seedPlans(prisma);
  await seedQuizzes(prisma);
  await seedDemoUsers(prisma);
  await seedInspirations(prisma);
  console.log("Done.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
