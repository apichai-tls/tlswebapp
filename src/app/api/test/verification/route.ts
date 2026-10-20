import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateJobAction, processTopUpAction } from "@/actions/db";
import { resolveRequestUser } from "@/lib/server-auth";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { user } = await resolveRequestUser(req);
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { testType } = await req.json();

  if (testType === 'OCC_SIMULTANEOUS_EDIT') {
    const testJob = await prisma.job.findFirst({
      where: { status: { in: ['pending', 'pickup', 'wash', 'billing'] } },
      orderBy: { createdAt: 'desc' }
    });
    if (!testJob) {
      return NextResponse.json({ error: "No test job found" }, { status: 404 });
    }

    const originalTime = new Date(testJob.updatedAt).toISOString();

    const saveA = await updateJobAction(testJob.id, {
      remark: `Disjoint edit A - ${Date.now()}`,
      expectedUpdatedAt: originalTime,
      actorId: user.id,
      actorName: user.name || user.email,
    });

    const saveB = await updateJobAction(testJob.id, {
      billNo: `B-${Date.now().toString().slice(-6)}`,
      expectedUpdatedAt: originalTime,
      actorId: user.id,
      actorName: user.name || user.email,
    });

    const refreshed = await prisma.job.findUnique({ where: { id: testJob.id } });
    const disjointSuccess = Boolean(
      refreshed?.remark?.startsWith('Disjoint edit A') &&
      refreshed?.billNo?.startsWith('B-')
    );

    let conflictRejected = false;
    let conflictErrorMsg = '';
    try {
      await updateJobAction(testJob.id, {
        remark: 'Conflicting edit attempt',
        expectedUpdatedAt: originalTime,
        actorId: user.id,
        actorName: user.name || user.email,
      });
    } catch (confErr: any) {
      conflictErrorMsg = confErr?.message || '';
      if (conflictErrorMsg.includes('409') || conflictErrorMsg.includes('Conflict')) {
        conflictRejected = true;
      }
    }

    return NextResponse.json({
      disjointSuccess,
      conflictRejected,
      conflictErrorMsg,
      refreshedRemark: refreshed?.remark,
      refreshedBillNo: refreshed?.billNo,
    });
  }

  if (testType === 'WALLET_IDEMPOTENCY') {
    const testCustomer = await prisma.customer.findFirst({
      orderBy: { createdAt: 'desc' }
    });
    if (!testCustomer) {
      return NextResponse.json({ error: "No test customer found" }, { status: 404 });
    }

    const initialBal = Number(testCustomer.creditBalance || 0);
    const testReceipt = `TEST-RCP-${Date.now()}`;
    const testIdempotencyKey = `IDEMP-${Date.now()}`;

    const res1 = await processTopUpAction({
      receiptNumber: testReceipt,
      customerId: testCustomer.id,
      paidAmount: 500,
      bonusAmount: 0,
      totalCredit: 500,
      paymentChannel: 'Cash',
      idempotencyKey: testIdempotencyKey,
      actorId: user.id,
      actorName: user.name || user.email,
    });

    const res2 = await processTopUpAction({
      receiptNumber: testReceipt,
      customerId: testCustomer.id,
      paidAmount: 500,
      bonusAmount: 0,
      totalCredit: 500,
      paymentChannel: 'Cash',
      idempotencyKey: testIdempotencyKey,
      actorId: user.id,
      actorName: user.name || user.email,
    });

    const checkCust = await prisma.customer.findUnique({ where: { id: testCustomer.id } });
    const expectedBal = initialBal + 500;
    const isBalanceAccurate = Math.abs(Number(checkCust?.creditBalance) - expectedBal) < 0.01;

    const txCount = await prisma.walletTransaction.count({
      where: { customerId: testCustomer.id, referenceId: testReceipt }
    });

    return NextResponse.json({
      firstCallSuccess: res1.success,
      secondCallDuplicate: res2.duplicate === true,
      initialBal,
      finalBal: checkCust?.creditBalance,
      expectedBal,
      isBalanceAccurate,
      walletTxCount: txCount,
    });
  }

  return NextResponse.json({ error: "Unknown testType" }, { status: 400 });
}
