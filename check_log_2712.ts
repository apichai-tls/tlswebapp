import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const logs = await prisma.activityLog.findMany({
    where: { entityId: "2026002712", entityType: "job" },
    select: { action: true, details: true, createdAt: true, userId: true, userName: true },
    orderBy: { createdAt: "asc" }
  });
  
  console.log(`=== Activity Log for Job 2026002712 (${logs.length} entries) ===`);
  logs.forEach(l => {
    console.log(`\n[${l.createdAt?.toISOString()}] ${l.userName} → ${l.action}`);
    if (l.details) console.log("  details:", JSON.stringify(l.details));
  });
}
main().finally(() => prisma.$disconnect());
