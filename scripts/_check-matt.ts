import { prisma } from "@/lib/prisma";

async function main() {
  const matt = await prisma.user.findFirst({
    where: { email: { contains: "matthewcar", mode: "insensitive" } },
    select: {
      id: true, email: true, firstName: true, role: true,
      _count: { select: { sessionsAsClient: true, sessionsAsStylist: true } },
    },
  });
  console.log("matt:", matt);
}
main().then(() => process.exit(0));
