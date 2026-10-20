import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  updateJobAction,
  processTopUpAction,
  addCustomerAction,
  getCustomerCouponsAction,
  getWalletTransactionsAction,
  recordJobPaymentAction,
  unlockPaidJobAction,
} from "@/actions/db";
import { getRoles, createRole } from "@/actions/roles";
import { getDepartments, createDepartment } from "@/actions/departments";
import { getUsers, createUser } from "@/actions/users";
import { getTasks, createTask } from "@/actions/tasks";
import { getUserNotifications } from "@/actions/notifications";
import { checkJobOnlinePaymentStatusAction } from "@/actions/online-payment";
import { resolveRequestUser, signStaffSessionToken, runWithSessionToken } from "@/lib/server-auth";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { user } = await resolveRequestUser(req);
  if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionToken = signStaffSessionToken({
    id: user.id,
    role: user.role,
    branchId: user.branchId,
  });

  const { testType } = await req.json();

  if (testType === 'OCC_SIMULTANEOUS_EDIT') {
    const fixtureJobId = `DISP-OCC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    try {
      // Create a disposable staging job fixture
      const createdFixture = await prisma.job.create({
        data: {
          id: fixtureJobId,
          type: "full_service",
          scheduledAt: new Date(),
          customerName: "DISPOSABLE OCC TEST",
          customerPhone: "0899990000",
          pickupLocation: "Test Pickup",
          dropoffLocation: "Test Dropoff",
          pickupLat: 13.7,
          pickupLng: 100.5,
          dropoffLat: 13.7,
          dropoffLng: 100.5,
          distance: 1,
          fee: 0,
          status: "pending",
          remark: "Initial remark",
          billNo: "INIT-000",
          adminNotesJson: JSON.stringify({
            notes: [{ id: "n0", text: "Initial note", timestamp: new Date().toISOString() }],
            payments: [],
          }),
        },
      });

      const originalTime = new Date(createdFixture.updatedAt).toISOString();
      const targetRemark = `Concurrent edit A - ${Date.now()}`;
      const targetBillNo = `B-${Date.now().toString().slice(-6)}`;

      // 1. Genuinely concurrent non-conflicting edits + concurrent adminNotesJson merges
      const [saveA, saveB] = await Promise.all([
        runWithSessionToken(sessionToken, () =>
          updateJobAction(fixtureJobId, {
            remark: targetRemark,
            adminNotesJson: JSON.stringify({
              notes: [
                { id: "n0", text: "Initial note", timestamp: originalTime },
                { id: "nA", text: "Staff A concurrent note", timestamp: new Date().toISOString() },
              ],
              payments: [],
            }),
            expectedUpdatedAt: originalTime,
          })
        ),
        runWithSessionToken(sessionToken, () =>
          updateJobAction(fixtureJobId, {
            billNo: targetBillNo,
            adminNotesJson: JSON.stringify({
              notes: [
                { id: "n0", text: "Initial note", timestamp: originalTime },
                { id: "nB", text: "Staff B concurrent note", timestamp: new Date().toISOString() },
              ],
              payments: [],
            }),
            expectedUpdatedAt: originalTime,
          })
        ),
      ]);

      const refreshed = await prisma.job.findUnique({ where: { id: fixtureJobId } });
      const parsedNotes = refreshed?.adminNotesJson ? JSON.parse(refreshed.adminNotesJson) : { notes: [] };
      const noteIds = new Set((parsedNotes.notes || []).map((n: any) => n.id));

      const disjointSuccess = Boolean(
        refreshed?.remark === targetRemark &&
        refreshed?.billNo === targetBillNo &&
        noteIds.has("n0") &&
        noteIds.has("nA") &&
        noteIds.has("nB")
      );

      // 2. Genuinely concurrent conflicting edits on the SAME field (remark) from the same snapshot
      const snapshotAfterDisjoint = new Date(refreshed!.updatedAt).toISOString();
      const conflictResults = await Promise.allSettled([
        runWithSessionToken(sessionToken, () =>
          updateJobAction(fixtureJobId, {
            remark: "Concurrent conflict value 1",
            expectedUpdatedAt: snapshotAfterDisjoint,
          })
        ),
        runWithSessionToken(sessionToken, () =>
          updateJobAction(fixtureJobId, {
            remark: "Concurrent conflict value 2",
            expectedUpdatedAt: snapshotAfterDisjoint,
          })
        ),
      ]);

      const fulfilledCount = conflictResults.filter((r) => r.status === "fulfilled").length;
      const rejectedReasons = conflictResults
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map((r) => r.reason?.message || String(r.reason));

      const conflictRejected =
        fulfilledCount === 1 &&
        rejectedReasons.length === 1 &&
        (rejectedReasons[0].includes("409") || rejectedReasons[0].includes("Conflict"));

      return NextResponse.json({
        disjointSuccess,
        bothAdminNotesPreserved: noteIds.has("nA") && noteIds.has("nB"),
        conflictRejected,
        fulfilledCount,
        conflictErrorMsg: rejectedReasons[0] || "",
        refreshedRemark: refreshed?.remark,
        refreshedBillNo: refreshed?.billNo,
        saveAId: saveA?.id,
        saveBId: saveB?.id,
      });
    } finally {
      await prisma.activityLog.deleteMany({ where: { entityId: fixtureJobId } }).catch(() => {});
      await prisma.job.deleteMany({ where: { id: fixtureJobId } }).catch(() => {});
    }
  }

  if (testType === 'WALLET_IDEMPOTENCY') {
    const fixtureCustomerId = `DISP-CUST-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const testReceipt = `DISP-RCP-${Date.now()}`;
    const testIdempotencyKey = `DISP-IDEMP-${Date.now()}`;

    try {
      const testCustomer = await prisma.customer.create({
        data: {
          id: fixtureCustomerId,
          name: "DISPOSABLE WALLET TEST",
          phone: `089${Date.now().toString().slice(-7)}`,
          defaultAddress: "Disposable Test Address",
          defaultLat: 13.7,
          defaultLng: 100.5,
          priceListId: "regular",
          creditBalance: 100,
          isMember: true,
        },
      });

      const initialBal = Number(testCustomer.creditBalance || 0);

      // Fire 5 genuinely concurrent top-up retries with the exact same receipt/idempotencyKey
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          runWithSessionToken(sessionToken, () =>
            processTopUpAction({
              receiptNumber: testReceipt,
              customerId: testCustomer.id,
              paidAmount: 500,
              bonusAmount: 0,
              totalCredit: 500,
              paymentChannel: 'Cash',
              idempotencyKey: testIdempotencyKey,
            })
          )
        )
      );

      const checkCust = await prisma.customer.findUnique({ where: { id: testCustomer.id } });
      const expectedBal = initialBal + 500;
      const isBalanceAccurate = Math.abs(Number(checkCust?.creditBalance) - expectedBal) < 0.01;

      const txCount = await prisma.walletTransaction.count({
        where: { customerId: testCustomer.id, referenceId: testReceipt }
      });

      const nonDuplicateCount = results.filter((r) => !r.duplicate).length;
      const duplicateCount = results.filter((r) => r.duplicate === true).length;

      return NextResponse.json({
        firstCallSuccess: nonDuplicateCount === 1,
        secondCallDuplicate: duplicateCount === 4,
        nonDuplicateCount,
        duplicateCount,
        initialBal,
        finalBal: checkCust?.creditBalance,
        expectedBal,
        isBalanceAccurate,
        walletTxCount: txCount,
      });
    } finally {
      await prisma.walletTransaction.deleteMany({ where: { customerId: fixtureCustomerId } }).catch(() => {});
      await prisma.transaction.deleteMany({ where: { id: testReceipt } }).catch(() => {});
      await prisma.activityLog.deleteMany({ where: { entityId: fixtureCustomerId } }).catch(() => {});
      await prisma.customer.deleteMany({ where: { id: fixtureCustomerId } }).catch(() => {});
    }
  }

  if (testType === 'SERVER_ACTIONS_AUTH') {
    const riderToken = signStaffSessionToken({ id: 'RIDER-04', role: 'rider' });

    const checkRejected = async (fn: () => Promise<any>): Promise<boolean> => {
      try {
        const res = await fn();
        if (res && typeof res === 'object' && 'success' in res && res.success === false) {
          const errStr = String(res.error || '');
          return (
            errStr.includes('Unauthorized') ||
            errStr.includes('Forbidden') ||
            errStr.includes('401') ||
            errStr.includes('403')
          );
        }
        return false;
      } catch (err: any) {
        const msg = String(err?.message || err);
        return (
          msg.includes('Unauthorized') ||
          msg.includes('Forbidden') ||
          msg.includes('401') ||
          msg.includes('403')
        );
      }
    };

    const unauthenticatedChecks = await Promise.all([
      checkRejected(() => runWithSessionToken(null, () => getRoles())),
      checkRejected(() => runWithSessionToken(null, () => createRole({ name: 'x' }))),
      checkRejected(() => runWithSessionToken(null, () => getDepartments())),
      checkRejected(() => runWithSessionToken(null, () => createDepartment({ name: 'x' }))),
      checkRejected(() => runWithSessionToken(null, () => getUsers())),
      checkRejected(() => runWithSessionToken(null, () => createUser({ name: 'x', email: 'x@x.com', password: '123', role: 'cso', permissions: [] }))),
      checkRejected(() => runWithSessionToken(null, () => getTasks())),
      checkRejected(() => runWithSessionToken(null, () => createTask({ title: 'x', priority: 'medium', createdById: 'admin_seed', createdByName: 'Admin' }))),
      checkRejected(() => runWithSessionToken(null, () => getUserNotifications('admin_seed'))),
      checkRejected(() => runWithSessionToken(null, () => checkJobOnlinePaymentStatusAction('dummy'))),
      checkRejected(() => runWithSessionToken(null, () => addCustomerAction({ name: 'X', phone: '0800000000', actorId: 'admin_seed' }))),
      checkRejected(() => runWithSessionToken(null, () => getCustomerCouponsAction())),
      checkRejected(() => runWithSessionToken(null, () => getWalletTransactionsAction())),
      checkRejected(() => runWithSessionToken(null, () => recordJobPaymentAction({ jobId: 'dummy', amount: 100, channel: 'Cash', actorId: 'admin_seed' }))),
      checkRejected(() => runWithSessionToken(null, () => unlockPaidJobAction({ jobId: 'dummy', reason: 'test', actorId: 'admin_seed', actorRole: 'admin' }))),
    ]);

    const riderForbiddenChecks = await Promise.all([
      checkRejected(() => runWithSessionToken(riderToken, () => createRole({ name: 'x' }))),
      checkRejected(() => runWithSessionToken(riderToken, () => createDepartment({ name: 'x' }))),
      checkRejected(() => runWithSessionToken(riderToken, () => getUsers())),
      checkRejected(() => runWithSessionToken(riderToken, () => addCustomerAction({ name: 'X', phone: '0800000000' }))),
      checkRejected(() => runWithSessionToken(riderToken, () => getCustomerCouponsAction())),
      checkRejected(() => runWithSessionToken(riderToken, () => getWalletTransactionsAction())),
      checkRejected(() => runWithSessionToken(riderToken, () => recordJobPaymentAction({ jobId: 'dummy', amount: 100, channel: 'Cash' }))),
      checkRejected(() => runWithSessionToken(riderToken, () => unlockPaidJobAction({ jobId: 'dummy', reason: 'test' }))),
    ]);

    return NextResponse.json({
      allUnauthenticatedRejected: unauthenticatedChecks.every(Boolean),
      unauthenticatedCount: unauthenticatedChecks.length,
      unauthenticatedPassed: unauthenticatedChecks.filter(Boolean).length,
      allRiderForbiddenRejected: riderForbiddenChecks.every(Boolean),
      riderForbiddenCount: riderForbiddenChecks.length,
      riderForbiddenPassed: riderForbiddenChecks.filter(Boolean).length,
    });
  }

  return NextResponse.json({ error: "Unknown testType" }, { status: 400 });
}
