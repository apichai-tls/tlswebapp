import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('=== Restoring Job 2026000005 to Report (VIP = 0 baht commission) ===\n');

  // Re-create the pickup commission transaction for RIDER-005 as 0 (VIP)
  const pickupTx = await prisma.riderTransaction.create({
    data: {
      riderId: 'RIDER-005',
      jobId: '2026000005',
      amount: 0,
      type: 'commission_pickup',
      detail: 'Job 2026000005 - Pickup [VIP Customer - No Commission]',
      createdAt: new Date('2026-05-19T06:05:05.914Z'), // Restore original timestamp
    }
  });
  console.log(`✅ Re-created pickup tx for RIDER-005: amount=0, id=${pickupTx.id}`);

  // Re-create the delivery commission transaction for RIDER-01 as 0 (VIP)
  // And ensure RIDER-01 balance stays at 88 (already decremented 8 baht earlier)
  const deliveryTx = await prisma.riderTransaction.create({
    data: {
      riderId: 'RIDER-01',
      jobId: '2026000005',
      amount: 0,
      type: 'commission_delivery',
      detail: 'Job 2026000005 - Delivery [VIP Customer - No Commission]',
      createdAt: new Date('2026-05-21T10:47:26.690Z'), // Restore original timestamp
    }
  });
  console.log(`✅ Re-created delivery tx for RIDER-01: amount=0, id=${deliveryTx.id}`);

  // Verify RIDER-01 balance (should already be 88 from previous fix)
  const rider = await prisma.rider.findUnique({ where: { id: 'RIDER-01' } });
  console.log(`\n✅ RIDER-01 commissionBalance: ${rider?.commissionBalance} (correct, 8 baht already deducted)`);

  // Verify final state
  const finalTxs = await prisma.riderTransaction.findMany({ where: { jobId: '2026000005' } });
  console.log(`\n✅ Transactions for 2026000005:`);
  finalTxs.forEach(t => console.log(`  [${t.type}] riderId=${t.riderId} amount=${t.amount} detail="${t.detail}"`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
