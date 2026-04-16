import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Use DATABASE_URL everywhere. In staging/prod this points at the
    // RDS Proxy endpoint, which is the only endpoint reachable from the
    // ECS task SG. RDS Proxy session-pins on advisory locks so
    // `prisma migrate deploy` operates correctly through it.
    url: process.env.DATABASE_URL || "",
  },
});
