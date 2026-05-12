import { prisma } from "@/lib/prisma";

async function main() {
  // Look for any stylist user or matthewcar prefix
  const stylists = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: "matthewcar", mode: "insensitive" } },
        { role: "STYLIST" },
      ],
    },
    select: { id: true, email: true, firstName: true, role: true },
    take: 20,
  });
  console.log(`found ${stylists.length} candidates:`);
  for (const u of stylists) {
    console.log(`  ${u.role.padEnd(8)} | ${u.email} | ${u.firstName} | ${u.id}`);
  }
  console.log("\nDATABASE_URL =", process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@"));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
