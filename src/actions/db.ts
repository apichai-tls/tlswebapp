'use server';

import { prisma } from '@/lib/prisma';
import { listFilesForJob } from '@/lib/gcs';
import { calculateWalletExpiryDate, CREDIT_NOTE_SEQ_KEY, generateCreditNoteNumber, generateProformaBaseNumber, computeCartHash, formatJobDisplayId, isPaidTodayOrYesterday, getJobPaymentDate, normalizePhone, findDuplicateCustomerByPhone } from '@/lib/utils';
import { createTask, addTaskNote } from '@/actions/tasks';
import { type CouponTemplate } from '@/lib/store';

// CUSTOMERS
export async function getNextMemberIdAction(): Promise<string> {
  const members = await prisma.customer.findMany({
    where: {
      memberId: {
        startsWith: 'OF',
        mode: 'insensitive'
      }
    },
    select: { memberId: true }
  });

  let maxNum = 2399; // Base starting point so the next is at least OF2400
  for (const m of members) {
    if (!m.memberId) continue;
    const clean = m.memberId.replace(/^OF-?/i, '').trim();
    const num = parseInt(clean, 10);
    if (!isNaN(num) && num > maxNum) {
      maxNum = num;
    }
  }

  return `OF${maxNum + 1}`;
}

export async function addCustomerAction(data: any) {
  let memberId = null;
  if (data.isMember) {
    if (data.memberId && data.memberId.trim()) {
      const memberIdUpper = data.memberId.trim().toUpperCase();
      const existing = await prisma.customer.findUnique({
        where: { memberId: memberIdUpper }
      });
      if (existing) {
        throw new Error("เลขสมาชิกนี้มีผู้ใช้งานแล้วในระบบ กรุณาใช้เลขอื่น");
      }
      memberId = memberIdUpper;
    } else {
      memberId = await getNextMemberIdAction();
    }
  }

  // Check duplicate phone (both Thai and international)
  if (data.phone || data.secondaryPhone) {
    const existingCustomers = await prisma.customer.findMany({
      select: {
        id: true,
        name: true,
        phone: true,
        secondaryPhone: true,
        memberId: true,
      },
    });
    const duplicate = findDuplicateCustomerByPhone({
      phone: data.phone,
      secondaryPhone: data.secondaryPhone,
      customers: existingCustomers,
    });
    if (duplicate) {
      throw new Error(`เบอร์โทรศัพท์ ${duplicate.matchedPhone} มีอยู่ในระบบแล้ว (ลูกค้า: ${duplicate.customer.name || "ไม่ระบุชื่อ"}${duplicate.customer.memberId ? ` - รหัส ${duplicate.customer.memberId}` : ""})`);
    }
  }

  const nameUpper = data.name ? data.name.toUpperCase() : data.name;

  let c;
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    attempts++;
    let currentMemberId = memberId;
    if (data.isMember && !currentMemberId) {
      currentMemberId = await getNextMemberIdAction();
    }

    try {
      c = await prisma.customer.create({
        data: {
          name: nameUpper,
          phone: data.phone,
          defaultAddress: data.defaultAddress,
          defaultLat: data.defaultCoords?.lat || 0,
          defaultLng: data.defaultCoords?.lng || 0,
          priceListId: data.priceListId,
          creditBalance: data.creditBalance || 0,
          tier: data.tier,
          isMember: data.isMember || false,
          memberId: currentMemberId,
          isVIP: data.isVIP || false,
          isCorporate: data.isCorporate || false,
          isWhatsapp: data.isWhatsapp || false,
          email: data.email,
          lineId: data.lineId,
          language: data.language,
          remark: data.remark,
          secondaryAddress: data.secondaryAddress,
          dob: data.dob,
          taxId: data.taxId,
          companyName: data.companyName,
          vatType: data.vatType || 'default',
          corporateCommissionType: data.corporateCommissionType || 'default',
          corporatePickupCommission: data.corporatePickupCommission != null ? Number(data.corporatePickupCommission) : 0,
          corporateDeliveryCommission: data.corporateDeliveryCommission != null ? Number(data.corporateDeliveryCommission) : 0,
          corporateCommissionRatePerKm: data.corporateCommissionRatePerKm != null ? Number(data.corporateCommissionRatePerKm) : 0,
          brand: data.brand || 'that_laundry_shop',
          nickName: data.nickName || null,
          gender: data.gender || 'Rather not say',
          secondaryPhone: data.secondaryPhone || null,
          isSecondaryWhatsapp: Boolean(data.isSecondaryWhatsapp),
          isVerified: Boolean(data.isVerified),
          verifiedVia: data.verifiedVia || null,
          sourceSystem: data.sourceSystem || 'web_booking',
          roomNo: data.roomNo || null,
          branchId: data.branchId || null,
          memberStartDate: data.memberStartDate ? new Date(data.memberStartDate) : null,
          memberExpiryDate: data.memberExpiryDate ? new Date(data.memberExpiryDate) : null,
        }
      });
      break;
    } catch (err: any) {
      // If unique constraint violation on memberId and user didn't specify manual ID, retry with next number
      if (err.code === 'P2002' && (!data.memberId || !data.memberId.trim())) {
        continue;
      }
      throw err;
    }
  }

  if (!c) {
    throw new Error("ไม่สามารถสร้างลูกค้าใหม่ได้ กรุณาลองใหม่อีกครั้ง");
  }
  return c;
}

export async function updateCustomerAction(id: string, updates: any) {
  const currentCustomer = await prisma.customer.findUnique({ where: { id } });
  if (!currentCustomer) throw new Error("Customer not found");

  if (updates.updatedAt) {
    const incomingTime = new Date(updates.updatedAt).getTime();
    const dbTime = new Date(currentCustomer.updatedAt!).getTime();
    if (dbTime > incomingTime + 1000) {
      throw new Error("409 Conflict: This record was modified by another user. Please refresh and try again.");
    }
  }
  const data: any = {};
  if (updates.name !== undefined) {
    data.name = updates.name ? updates.name.toUpperCase() : updates.name;
  }
  if (updates.phone !== undefined) data.phone = updates.phone;
  if (updates.defaultAddress !== undefined) data.defaultAddress = updates.defaultAddress;
  if (updates.defaultCoords) {
    data.defaultLat = updates.defaultCoords.lat;
    data.defaultLng = updates.defaultCoords.lng;
  }
  if (updates.priceListId !== undefined) data.priceListId = updates.priceListId;
  if (updates.creditBalanceDelta !== undefined) {
    const balBefore = Number(currentCustomer.creditBalance || 0);
    const delta = Number(updates.creditBalanceDelta);
    data.creditBalance = Math.round((balBefore + delta) * 100) / 100;
  } else if (updates.creditBalance !== undefined) {
    data.creditBalance = updates.creditBalance;
  }
  if (updates.tier !== undefined) data.tier = updates.tier;
  
  if (updates.isMember !== undefined) {
    data.isMember = updates.isMember;
    if (updates.isMember === false) {
      data.memberId = null;
    } else {
      if (updates.memberId !== undefined) {
        if (updates.memberId && updates.memberId.trim()) {
          const memberIdUpper = updates.memberId.trim().toUpperCase();
          const existing = await prisma.customer.findFirst({
            where: {
              memberId: memberIdUpper,
              id: { not: id }
            }
          });
          if (existing) {
            throw new Error("เลขสมาชิกนี้มีผู้ใช้งานแล้วในระบบ กรุณาใช้เลขอื่น");
          }
          data.memberId = memberIdUpper;
        } else if (!currentCustomer.memberId) {
          data.memberId = await getNextMemberIdAction();
        } else {
          data.memberId = currentCustomer.memberId;
        }
      } else if (!currentCustomer.memberId) {
        data.memberId = await getNextMemberIdAction();
      }
    }
  } else if (updates.memberId !== undefined) {
    if (currentCustomer.isMember) {
      if (updates.memberId && updates.memberId.trim()) {
        const memberIdUpper = updates.memberId.trim().toUpperCase();
        const existing = await prisma.customer.findFirst({
          where: {
            memberId: memberIdUpper,
            id: { not: id }
          }
        });
        if (existing) {
          throw new Error("เลขสมาชิกนี้มีผู้ใช้งานแล้วในระบบ กรุณาใช้เลขอื่น");
        }
        data.memberId = memberIdUpper;
      } else {
        data.memberId = null;
      }
    }
  }
  if (updates.branchId !== undefined) data.branchId = updates.branchId || null;

  if (updates.isVIP !== undefined) data.isVIP = updates.isVIP;
  if (updates.isCorporate !== undefined) data.isCorporate = updates.isCorporate;
  if (updates.isWhatsapp !== undefined) data.isWhatsapp = updates.isWhatsapp;
  if (updates.isNew !== undefined) data.isNew = updates.isNew;
  if (updates.email !== undefined) data.email = updates.email;
  if (updates.lineId !== undefined) data.lineId = updates.lineId;
  if (updates.language !== undefined) data.language = updates.language;
  if (updates.remark !== undefined) data.remark = updates.remark;
  if (updates.secondaryAddress !== undefined) data.secondaryAddress = updates.secondaryAddress;
  if (updates.dob !== undefined) data.dob = updates.dob;
  if (updates.taxId !== undefined) data.taxId = updates.taxId;
  if (updates.companyName !== undefined) data.companyName = updates.companyName;
  if (updates.vatType !== undefined) data.vatType = updates.vatType;
  if (updates.corporateCommissionType !== undefined) data.corporateCommissionType = updates.corporateCommissionType;
  if (updates.corporatePickupCommission !== undefined) data.corporatePickupCommission = updates.corporatePickupCommission != null ? Number(updates.corporatePickupCommission) : 0;
  if (updates.corporateDeliveryCommission !== undefined) data.corporateDeliveryCommission = updates.corporateDeliveryCommission != null ? Number(updates.corporateDeliveryCommission) : 0;
  if (updates.corporateCommissionRatePerKm !== undefined) data.corporateCommissionRatePerKm = updates.corporateCommissionRatePerKm != null ? Number(updates.corporateCommissionRatePerKm) : 0;
  if (updates.brand !== undefined) data.brand = updates.brand;
  if (updates.nickName !== undefined) data.nickName = updates.nickName;
  if (updates.gender !== undefined) data.gender = updates.gender;
  if (updates.secondaryPhone !== undefined) data.secondaryPhone = updates.secondaryPhone;
  if (updates.isSecondaryWhatsapp !== undefined) data.isSecondaryWhatsapp = updates.isSecondaryWhatsapp;
  if (updates.isVerified !== undefined) data.isVerified = updates.isVerified;
  if (updates.verifiedVia !== undefined) data.verifiedVia = updates.verifiedVia;
  if (updates.sourceSystem !== undefined) data.sourceSystem = updates.sourceSystem;
  if (updates.passwordHash !== undefined) data.passwordHash = updates.passwordHash;
  if (updates.roomNo !== undefined) data.roomNo = updates.roomNo;
  if (updates.memberStartDate !== undefined) {
    data.memberStartDate = updates.memberStartDate ? new Date(updates.memberStartDate) : null;
  }
  if (updates.memberExpiryDate !== undefined) {
    data.memberExpiryDate = updates.memberExpiryDate ? new Date(updates.memberExpiryDate) : null;
  }

  const updatedCustomer = await prisma.customer.update({
    where: { id },
    data,
    include: {
      addresses: {
        orderBy: { isPrimary: 'desc' }
      }
    }
  });

  const changes: Record<string, { from: any, to: any } | any> = {};
  for (const key of Object.keys(data)) {
    if (currentCustomer[key as keyof typeof currentCustomer] !== data[key]) {
      changes[key] = {
        from: currentCustomer[key as keyof typeof currentCustomer],
        to: data[key]
      };
    }
  }

  if (Object.keys(changes).length > 0) {
    try {
      changes.customerName = currentCustomer.name;

      // If creditBalance changed, also write a dedicated ADJUST log with clear before/after/diff details
      // Skip if explicitly suppressed or initiated by topup
      if (changes.creditBalance && !updates.skipAdjustLog && updates.actionSource !== 'topup') {
        const balBefore = Number(currentCustomer.creditBalance || 0);
        const balAfter = Number(data.creditBalance || 0);
        const diff = updates.creditBalanceDelta !== undefined 
          ? Number(updates.creditBalanceDelta) 
          : (balAfter - balBefore);
        const isAdd = diff >= 0;

        await prisma.activityLog.create({
          data: {
            entityId: id,
            entityType: 'customer',
            action: 'ADJUST',
            details: JSON.stringify({
              customerName: currentCustomer.name,
              adjustMode: isAdd ? 'add' : 'deduct',
              adjustAmount: Math.abs(diff),
              balanceBefore: balBefore,
              balanceAfter: balAfter,
              reason: updates.adjustReason || updates.reason || null,
            }),
            userId: updates.actorId || null,
            userName: updates.actorName || null,
          }
        });
        console.log(`[ActivityLog] Adjusted wallet for customer ${id} (${currentCustomer.name}): ฿${balBefore} → ฿${balAfter}`);

        // Create WalletTransaction record for Post-Approval Tracking
        if (!updates.skipWalletTx) {
          const txType = updates.walletTxType || (isAdd ? 'ADJUST_ADD' : 'ADJUST_DEDUCT');
          const refType = updates.walletRefType || (txType === 'DEDUCT' ? 'job' : 'manual');
          await prisma.walletTransaction.create({
            data: {
              customerId: id,
              customerName: currentCustomer.name,
              type: txType,
              amount: Math.abs(diff),
              direction: isAdd ? 'CREDIT' : 'DEBIT',
              balanceBefore: balBefore,
              balanceAfter: balAfter,
              reason: updates.adjustReason || updates.reason || null,
              referenceId: updates.walletRefId || null,
              referenceType: refType,
              createdById: updates.actorId || null,
              createdByName: updates.actorName || (txType === 'DEDUCT' ? 'POS' : 'Admin'),
              branchId: updates.branchId || null,
              approvalStatus: 'PENDING',
            }
          });
        }
      }

      // If other profile fields changed besides creditBalance, write the general update log
      const otherKeys = Object.keys(changes).filter(k => k !== 'creditBalance' && k !== 'customerName');
      if (otherKeys.length > 0) {
        await prisma.activityLog.create({
          data: {
            entityId: id,
            entityType: 'customer',
            action: 'update',
            details: JSON.stringify(changes),
            userId: updates.actorId || null,
            userName: updates.actorName || null,
          }
        });
        console.log(`[ActivityLog] Updated customer ${id} (${currentCustomer.name}):`, JSON.stringify(changes));
      }
    } catch (err: any) {
      console.error("Failed to write ActivityLog on customer update:", err.message);
    }
  }



  // CRM Remark Sync Logic from main branch
  if (updates.remark !== undefined) {
    const activeJobs = await prisma.job.findMany({
      where: {
        customerId: id,
        status: { in: ['pending', 'accepted', 'pickup', 'active', 'delivery', 'picked_up'] }
      }
    });

    for (const job of activeJobs) {
      let notes: any[] = [];
      let payments: any[] = [];
      let isStructured = false;

      if (job.adminNotesJson) {
        try {
          const parsed = JSON.parse(job.adminNotesJson);
          if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed.notes) || Array.isArray(parsed.payments)) {
              isStructured = true;
              notes = Array.isArray(parsed.notes) ? [...parsed.notes] : [];
              payments = Array.isArray(parsed.payments) ? [...parsed.payments] : [];
            } else if (Array.isArray(parsed)) {
              notes = [...parsed];
            }
          }
        } catch (e) {
          notes = [];
        }
      }
      
      notes.push({
        userId: 'system',
        userName: 'System (CRM)',
        text: `CRM Remark: ${updates.remark ? updates.remark : '(Cleared)'}`,
        timestamp: new Date().toISOString()
      });

      const updatedJson = (isStructured || payments.length > 0)
        ? JSON.stringify({ payments, notes })
        : JSON.stringify(notes);

      await prisma.job.update({
        where: { id: job.id },
        data: { adminNotesJson: updatedJson }
      });
    }
  }

  return updatedCustomer;
}

export async function deleteCustomerAction(id: string) {
  const jobsCount = await prisma.job.count({ where: { customerId: id } });
  if (jobsCount > 0) {
    throw new Error(`Cannot delete customer: they have ${jobsCount} historical job(s).`);
  }
  return prisma.customer.delete({ where: { id } });
}

export async function mergeCustomerAction(data: {
  primaryCustomerId: string;
  duplicateCustomerId: string;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
}): Promise<{
  success: boolean;
  error?: string;
  transferredJobsCount?: number;
  transferredWalletAmount?: number;
  transferredAddressesCount?: number;
  updatedCustomer?: any;
}> {
  try {
    // 1. Permission check: strictly admin / superadmin only
    let actorRole = (data.actorRole || "").toLowerCase();
    if (!actorRole && data.actorId) {
      const userRec = await prisma.adminUser.findUnique({ where: { id: data.actorId }, select: { role: true } });
      if (userRec?.role) actorRole = userRec.role.toLowerCase();
    }
    const isAdmin = actorRole === "admin" || actorRole === "superadmin";
    if (!isAdmin) {
      throw new Error("เฉพาะสิทธิ์ Admin เท่านั้นที่สามารถรวมบัญชีลูกค้าได้");
    }

    if (!data.primaryCustomerId || !data.duplicateCustomerId) {
      throw new Error("ต้องระบุบัญชีหลักและบัญชีที่จะรวม");
    }

    if (data.primaryCustomerId === data.duplicateCustomerId) {
      throw new Error("ไม่สามารถรวมบัญชีตัวเองได้");
    }

    return await prisma.$transaction(async (tx) => {
      const [primary, duplicate] = await Promise.all([
        tx.customer.findUnique({
          where: { id: data.primaryCustomerId },
          include: { addresses: true }
        }),
        tx.customer.findUnique({
          where: { id: data.duplicateCustomerId },
          include: { addresses: true }
        })
      ]);

      if (!primary) throw new Error("ไม่พบบัญชีหลักในระบบ");
      if (!duplicate) throw new Error("ไม่พบบัญชีที่จะรวมในระบบ");

      // 2. Transfer Jobs
      const jobUpdateRes = await tx.job.updateMany({
        where: { customerId: duplicate.id },
        data: { customerId: primary.id }
      });
      const transferredJobsCount = jobUpdateRes.count;

      // 3. Transfer Wallet Balance
      let transferredWalletAmount = 0;
      let newPrimaryBalance = primary.creditBalance || 0;
      const dupBalance = duplicate.creditBalance || 0;

      if (dupBalance > 0) {
        transferredWalletAmount = Math.round(dupBalance * 100) / 100;
        newPrimaryBalance = Math.round((newPrimaryBalance + transferredWalletAmount) * 100) / 100;

        // Record on Primary
        await tx.walletTransaction.create({
          data: {
            customerId: primary.id,
            customerName: primary.name,
            type: "ADJUST_ADD",
            amount: transferredWalletAmount,
            direction: "CREDIT",
            balanceBefore: primary.creditBalance || 0,
            balanceAfter: newPrimaryBalance,
            referenceId: duplicate.id,
            referenceType: "merge",
            reason: `โอนย้ายยอดเงินคงเหลือจากการรวมบัญชีลูกค้า ${duplicate.name} (${duplicate.phone || duplicate.id})`,
            approvalStatus: "APPROVED",
            approvedById: data.actorId || undefined,
            approvedByName: data.actorName || "Admin",
            approvedAt: new Date(),
            createdById: data.actorId || undefined,
            createdByName: data.actorName || "Admin",
          }
        });

        // Record on Duplicate
        await tx.walletTransaction.create({
          data: {
            customerId: duplicate.id,
            customerName: duplicate.name,
            type: "ADJUST_DEDUCT",
            amount: transferredWalletAmount,
            direction: "DEBIT",
            balanceBefore: dupBalance,
            balanceAfter: 0,
            referenceId: primary.id,
            referenceType: "merge",
            reason: `โอนยอดเงินไปยังบัญชีหลัก ${primary.name} (${primary.phone || primary.id})`,
            approvalStatus: "APPROVED",
            approvedById: data.actorId || undefined,
            approvedByName: data.actorName || "Admin",
            approvedAt: new Date(),
            createdById: data.actorId || undefined,
            createdByName: data.actorName || "Admin",
          }
        });
      }

      // Update any previous wallet transactions of duplicate to point to primary
      await tx.walletTransaction.updateMany({
        where: { customerId: duplicate.id },
        data: { customerId: primary.id }
      });

      // 4. Transfer Customer Addresses
      let transferredAddressesCount = 0;
      const primaryAddressesNormalized = new Set(
        (primary.addresses || []).map(a => (a.address || "").trim().toLowerCase())
      );

      const addressOps: Promise<any>[] = [];
      for (const dupAddr of (duplicate.addresses || [])) {
        const norm = (dupAddr.address || "").trim().toLowerCase();
        if (norm && primaryAddressesNormalized.has(norm)) {
          // If address already exists in primary, delete the duplicate address
          addressOps.push(tx.customerAddress.delete({ where: { id: dupAddr.id } }));
        } else {
          // Transfer to primary as secondary address
          addressOps.push(tx.customerAddress.update({
            where: { id: dupAddr.id },
            data: { customerId: primary.id, isPrimary: false }
          }));
          if (norm) primaryAddressesNormalized.add(norm);
          transferredAddressesCount++;
        }
      }
      if (addressOps.length > 0) {
        await Promise.all(addressOps);
      }

      // 5. Transfer Bookings & Transactions (external web) concurrently
      await Promise.all([
        tx.booking.updateMany({
          where: { memberId: duplicate.id },
          data: { memberId: primary.id }
        }),
        tx.transaction.updateMany({
          where: { memberId: duplicate.id },
          data: { memberId: primary.id }
        })
      ]);

      // 6. Merge profile fields into Primary
      const updateData: any = {};
      if (newPrimaryBalance !== (primary.creditBalance || 0)) {
        updateData.creditBalance = newPrimaryBalance;
      }

      // Keep foreign or secondary phone if primary doesn't have one
      if (!primary.secondaryPhone && duplicate.secondaryPhone) {
        updateData.secondaryPhone = duplicate.secondaryPhone;
        updateData.isSecondaryWhatsapp = duplicate.isSecondaryWhatsapp;
      } else if (!primary.secondaryPhone && duplicate.phone && duplicate.phone !== primary.phone && duplicate.phone !== "-") {
        updateData.secondaryPhone = duplicate.phone;
        updateData.isSecondaryWhatsapp = duplicate.isWhatsapp;
      }

      // If primary phone is dummy/empty and duplicate has a valid phone
      if ((!primary.phone || primary.phone === "-" || primary.phone === "0000000000") && duplicate.phone && duplicate.phone !== "-") {
        updateData.phone = duplicate.phone;
      }

      // Upgrade member status if duplicate has higher tier
      if (duplicate.isVIP && !primary.isVIP) {
        updateData.isVIP = true;
        updateData.tier = "vip";
      } else if (duplicate.isMember && !primary.isMember) {
        updateData.isMember = true;
        updateData.tier = "member";
        if (duplicate.memberId && !primary.memberId) updateData.memberId = duplicate.memberId;
        if (duplicate.memberStartDate && !primary.memberStartDate) updateData.memberStartDate = duplicate.memberStartDate;
        if (duplicate.memberExpiryDate && !primary.memberExpiryDate) updateData.memberExpiryDate = duplicate.memberExpiryDate;
      }

      // Merge remarks
      if (duplicate.remark && duplicate.remark.trim()) {
        const existing = primary.remark ? primary.remark.trim() : "";
        updateData.remark = existing
          ? `${existing}\n[Merged from ${duplicate.name}]: ${duplicate.remark.trim()}`
          : `[Merged from ${duplicate.name}]: ${duplicate.remark.trim()}`;
      }

      let updatedCustomer = primary;
      if (Object.keys(updateData).length > 0) {
        updatedCustomer = await tx.customer.update({
          where: { id: primary.id },
          data: updateData,
          include: { addresses: true }
        });
      }

      // 7. Delete the duplicate customer record safely
      await tx.customer.delete({ where: { id: duplicate.id } });

      // 8. Log activity
      await tx.activityLog.create({
        data: {
          entityId: primary.id,
          entityType: "Customer",
          action: "MERGE_CUSTOMER",
          details: `Merged duplicate customer "${duplicate.name}" (${duplicate.phone || "-"}, ID: ${duplicate.id}) into "${primary.name}" (${primary.phone || "-"}, ID: ${primary.id}). Transferred ${transferredJobsCount} jobs, ฿${transferredWalletAmount} wallet balance, ${transferredAddressesCount} addresses.`,
          userId: data.actorId || "system",
          userName: data.actorName || "Admin",
        }
      });

      return {
        success: true,
        transferredJobsCount,
        transferredWalletAmount,
        transferredAddressesCount,
        updatedCustomer,
      };
    }, {
      maxWait: 15000,
      timeout: 60000,
    });
  } catch (err: any) {
    console.error("[mergeCustomerAction] Error:", err);
    return {
      success: false,
      error: err?.message || "เกิดข้อผิดพลาดในการรวมบัญชีลูกค้า",
    };
  }
}

export async function batchMergeObviousDuplicatesAction(data: {
  actorId?: string;
  actorName?: string;
  actorRole?: string;
}): Promise<{
  success: boolean;
  mergedCount: number;
  error?: string;
}> {
  try {
    let actorRole = (data.actorRole || "").toLowerCase();
    if (!actorRole && data.actorId) {
      const userRec = await prisma.adminUser.findUnique({ where: { id: data.actorId }, select: { role: true } });
      if (userRec?.role) actorRole = userRec.role.toLowerCase();
    }
    const isAdmin = actorRole === "admin" || actorRole === "superadmin";
    if (!isAdmin) {
      throw new Error("เฉพาะสิทธิ์ Admin เท่านั้นที่สามารถรวมบัญชีลูกค้าได้");
    }

    const allCustomers = await prisma.customer.findMany({
      orderBy: { createdAt: "asc" }
    });

    // Group by normalized phone
    const phoneMap = new Map<string, typeof allCustomers>();
    for (const c of allCustomers) {
      const norm = normalizePhone(c.phone);
      if (norm && norm.length >= 8 && norm !== "0000000000") {
        const list = phoneMap.get(norm) || [];
        list.push(c);
        phoneMap.set(norm, list);
      }
    }

    let mergedCount = 0;
    for (const [_, list] of phoneMap.entries()) {
      if (list.length === 2) {
        const [c1, c2] = list;
        const normName1 = (c1.name || "").trim().toUpperCase();
        const normName2 = (c2.name || "").trim().toUpperCase();
        const tDiff = Math.abs(new Date(c1.createdAt).getTime() - new Date(c2.createdAt).getTime());

        // Identical name and created within 60s
        if (normName1 === normName2 && tDiff <= 60000) {
          // Check jobs for both
          const [j1Count, j2Count] = await Promise.all([
            prisma.job.count({ where: { customerId: c1.id } }),
            prisma.job.count({ where: { customerId: c2.id } })
          ]);

          // Pick primary: one with jobs or wallet or older
          let primaryId = c1.id;
          let dupId = c2.id;
          if (j2Count > 0 && j1Count === 0) {
            primaryId = c2.id;
            dupId = c1.id;
          } else if ((c2.creditBalance || 0) > 0 && (c1.creditBalance || 0) === 0) {
            primaryId = c2.id;
            dupId = c1.id;
          }

          const res = await mergeCustomerAction({
            primaryCustomerId: primaryId,
            duplicateCustomerId: dupId,
            actorId: data.actorId,
            actorName: data.actorName,
            actorRole: "admin",
          });

          if (res.success) {
            mergedCount++;
          }
        }
      }
    }

    return {
      success: true,
      mergedCount,
    };
  } catch (err: any) {
    console.error("[batchMergeObviousDuplicatesAction] Error:", err);
    return {
      success: false,
      mergedCount: 0,
      error: err?.message || "เกิดข้อผิดพลาดในการรวมบัญชีอัตโนมัติ",
    };
  }
}


export async function addCustomerAddressAction(customerId: string, addressData: {
  label: string;
  placeName?: string;
  address: string;
  roomNumber?: string;
  district?: string;
  province?: string;
  postalCode?: string;
  googleMapsUrl?: string;
  leaveWithJuristic?: boolean;
  deliveryNote?: string;
  isPrimary?: boolean;
}) {
  if (addressData.isPrimary) {
    await prisma.customerAddress.updateMany({
      where: { customerId, isPrimary: true },
      data: { isPrimary: false }
    });
  }
  const created = await prisma.customerAddress.create({
    data: {
      customerId,
      label: addressData.label || 'Home Condo',
      placeName: addressData.placeName || null,
      address: addressData.address || addressData.placeName || '',
      roomNumber: addressData.roomNumber || null,
      district: addressData.district || 'Bangkok',
      province: addressData.province || 'Bangkok',
      postalCode: addressData.postalCode || null,
      googleMapsUrl: addressData.googleMapsUrl || null,
      leaveWithJuristic: addressData.leaveWithJuristic ?? true,
      deliveryNote: addressData.deliveryNote || null,
      isPrimary: Boolean(addressData.isPrimary)
    }
  });

  if (addressData.isPrimary) {
    await prisma.customer.update({
      where: { id: customerId },
      data: { defaultAddress: addressData.address }
    });
  }

  return created;
}

export async function deleteCustomerAddressAction(addressId: string, customerId: string) {
  await prisma.customerAddress.delete({
    where: { id: addressId }
  });
  return { success: true };
}

export async function setPrimaryCustomerAddressAction(customerId: string, addressId: string) {
  await prisma.customerAddress.updateMany({
    where: { customerId, isPrimary: true },
    data: { isPrimary: false }
  });
  const updated = await prisma.customerAddress.update({
    where: { id: addressId },
    data: { isPrimary: true }
  });
  await prisma.customer.update({
    where: { id: customerId },
    data: { defaultAddress: updated.address }
  });
  return updated;
}

export async function addJobAction(data: any) {
  let jobId = data.id;
  
  if (!jobId || String(jobId).startsWith('JOB-')) {
    const year = new Date().getFullYear().toString(); // 4-digit year, auto-changes each year
    const isTestDb = Boolean(
      process.env.DATABASE_URL?.includes('/tls_test') || 
      process.env.DIRECT_URL?.includes('/tls_test') ||
      process.env.APP_ENV === 'test'
    );
    const prefix = isTestDb ? `T${year}` : year;

    const latestJob = await prisma.job.findFirst({
      where: { id: { startsWith: prefix } },
      orderBy: { id: 'desc' }
    });
    
    if (latestJob) {
      const numericPart = latestJob.id.replace(/^T/, '').substring(4);
      const lastNum = parseInt(numericPart, 10);
      if (!isNaN(lastNum)) {
        jobId = `${prefix}${(lastNum + 1).toString().padStart(6, '0')}`;
      } else {
        jobId = `${prefix}000001`;
      }
    } else {
      jobId = `${prefix}000001`;
    }
  }

  const createdJob = await prisma.job.create({
    data: {
      id: jobId,
      type: data.type || 'full_service',
      customerId: data.customerId,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      pickupLocation: data.pickupLocation,
      dropoffLocation: data.dropoffLocation,
      pickupLat: data.pickupCoords?.lat || 0,
      pickupLng: data.pickupCoords?.lng || 0,
      dropoffLat: data.dropoffCoords?.lat || 0,
      dropoffLng: data.dropoffCoords?.lng || 0,
      distance: data.distance || data.deliveryDistance || data.pickupDistance || 0,
      fee: Math.max(0, Number(data.fee) || 0),
      status: data.status,
      createdAt: data.createdAt,
      scheduledAt: data.scheduledAt,
      completedAt: data.completedAt,
      proofImageUrl: data.proofImageUrl,
      riderId: data.riderId,
      bagImageUrl: data.bagImageUrl,
      billImageUrl: data.billImageUrl,
      billNo: data.billNo ? String(data.billNo).trim() : null,
      serviceType: data.serviceType,
      laundryTypes: data.laundryTypes ? data.laundryTypes.join(',') : null,
      source: data.source,
      totalAmount: data.totalAmount !== undefined && data.totalAmount !== null ? Math.max(0, Number(data.totalAmount) || 0) : null,
      paymentMethod: data.paymentMethod,
      paymentChannel: data.paymentChannel,
      isPaid: data.isPaid || false,
      isShopPaid: data.isShopPaid || false,
      csoPaidAt: data.isPaid ? new Date() : null,
      shopPaidAt: data.isShopPaid ? new Date() : null,
      discount: data.discount || 0,
      discountPercent: data.discountPercent || 0,
      pickupDistance: data.pickupDistance,
      deliveryDistance: data.deliveryDistance,
      pickupCommission: data.pickupCommission !== undefined && data.pickupCommission !== null ? Math.max(0, Number(data.pickupCommission) || 0) : null,
      deliveryCommission: data.deliveryCommission !== undefined && data.deliveryCommission !== null ? Math.max(0, Number(data.deliveryCommission) || 0) : null,
      pickupScheduledAt: data.pickupScheduledAt,
      pickupScheduledEndAt: data.pickupScheduledEndAt,
      deliveryScheduledAt: data.deliveryScheduledAt,
      deliveryScheduledEndAt: data.deliveryScheduledEndAt,
      pickupRiderId: data.pickupRiderId,
      deliveryRiderId: data.deliveryRiderId,
      itemsJson: data.items ? JSON.stringify(data.items) : null,
      legsJson: data.legs ? JSON.stringify(data.legs) : null,
      remark: data.remark,
      adminNotesJson: data.adminNotesJson,
      branchId: data.branchId,
      createdBy: data.createdBy,
      cashPlaced: data.cashPlaced || false,
      isStuck: data.isStuck || false,
      shiftId: data.shiftId || null,
      walletBalanceAfter: data.walletBalanceAfter !== undefined ? data.walletBalanceAfter : null,
      proformaNumber: data.proformaNumber || (data as any).proformaReceiptNumber || null,
      proformaRevision: data.proformaRevision !== undefined ? data.proformaRevision : null,
      proformaCartHash: data.proformaCartHash || null,
    }
  });

  await syncRiderCommissionsForJob(createdJob.id);

  // Write activity log
  try {
    await prisma.activityLog.create({
      data: {
        entityId: createdJob.id,
        entityType: 'job',
        action: 'create',
        details: JSON.stringify(createdJob),
        userId: data.actorId || null,
        userName: data.actorName || null,
      }
    });
    console.log(`[ActivityLog] Created job ${createdJob.id}`);
  } catch (err: any) {
    console.error("Failed to write ActivityLog on create:", err.message);
  }

  return createdJob;
}

export async function getJobsByIdsAction(ids: string[]) {
  return prisma.job.findMany({
    where: { id: { in: ids } }
  });
}

export async function getCustomerJobsAction(customerId: string, customerPhone?: string | null) {
  try {
    if (!customerId && !customerPhone) return [];

    const normPhone = (p?: string | null) => (p || "").replace(/\D/g, "");
    const rawDigits = normPhone(customerPhone);
    const last9 = rawDigits.length >= 9 ? rawDigits.slice(-9) : rawDigits;

    const orConditions: any[] = [];
    if (customerId) {
      orConditions.push({ customerId });
    }
    if (customerPhone && customerPhone.trim()) {
      orConditions.push({ customerPhone: customerPhone.trim() });
    }
    if (last9 && last9.length >= 8) {
      orConditions.push({ customerPhone: { contains: last9 } });
    }

    const jobsRaw = await prisma.job.findMany({
      where: { OR: orConditions },
      orderBy: { createdAt: 'desc' },
    });

    return jobsRaw.map(j => ({
      ...j,
      laundryTypes: j.laundryTypes ? j.laundryTypes.split(',') : [],
      items: j.itemsJson ? (() => { try { return JSON.parse(j.itemsJson!); } catch { return []; } })() : [],
      legs: j.legsJson ? (() => { try { return JSON.parse(j.legsJson!); } catch { return undefined; } })() : undefined,
      pickupCoords: { lat: j.pickupLat, lng: j.pickupLng },
      dropoffCoords: { lat: j.dropoffLat, lng: j.dropoffLng },
      createdAt: j.createdAt.toISOString(),
      updatedAt: j.updatedAt.toISOString(),
      scheduledAt: j.scheduledAt ? j.scheduledAt.toISOString() : undefined,
      completedAt: j.completedAt ? j.completedAt.toISOString() : undefined,
    }));
  } catch (error: any) {
    console.error("[getCustomerJobsAction] Error:", error);
    return [];
  }
}

export async function getCustomerJobCountsAction(customerIds: string[]) {
  try {
    const validIds = customerIds.filter(Boolean);
    if (!validIds.length) return {};
    const counts = await prisma.job.groupBy({
      by: ['customerId'],
      where: { customerId: { in: validIds } },
      _count: { id: true },
      _sum: { totalAmount: true }
    });
    const map: Record<string, { count: number; totalAmount: number }> = {};
    for (const item of counts) {
      if (item.customerId) {
        map[item.customerId] = {
          count: item._count.id,
          totalAmount: Number(item._sum.totalAmount) || 0
        };
      }
    }
    return map;
  } catch (err: any) {
    console.error("[getCustomerJobCountsAction] Error:", err);
    return {};
  }
}

export async function updateJobAction(id: string, updates: any) {
  console.log(`[updateJobAction] id: ${id}`, updates);
  const existingJob = await prisma.job.findUnique({ where: { id } });
  
  const isMediaOrProformaOnlyUpdate = Object.keys(updates).every(k => 
    ['billImageUrl', 'bagImageUrl', 'pickupProofImageUrl', 'deliveryProofImageUrl', 'proofImageUrl', 'proformaNumber', 'proformaRevision', 'proformaCartHash', 'adminNotesJson', 'actorId', 'actorName', 'actorRole', 'updatedAt'].includes(k)
  );

  if (existingJob && (updates.expectedUpdatedAt || (updates.checkConflict && updates.updatedAt)) && !isMediaOrProformaOnlyUpdate) {
    const checkTime = updates.expectedUpdatedAt || updates.updatedAt;
    const incomingTime = new Date(checkTime).getTime();
    const dbTime = new Date(existingJob.updatedAt).getTime();
    if (dbTime > incomingTime + 1000) {
      throw new Error("409 Conflict: This record was modified by another user. Please refresh and try again.");
    }
  }
  const data: any = {};
  if (updates.type !== undefined) data.type = updates.type;
  if (updates.status !== undefined) {
    if (existingJob) {
      if (existingJob.status === 'completed' && ['pending', 'tba', 'pickup', 'billing'].includes(updates.status)) {
        throw new Error("Cannot revert a completed job to an active state (except Delivery for rework/failed delivery).");
      }
      if (existingJob.status === 'cancel' && updates.status !== 'cancel') {
        throw new Error("Cannot change the status of a cancelled job.");
      }
    }
    data.status = updates.status;
    if (updates.status === 'completed' && !existingJob?.completedAt && updates.completedAt === undefined) {
      data.completedAt = new Date();
    }
  } else if (existingJob && existingJob.status === 'tba' && (updates.pickupRiderId || updates.deliveryRiderId)) {
    data.status = 'pending';
  }
  if (updates.subStatus !== undefined) data.subStatus = updates.subStatus;
  if (updates.completedAt !== undefined) data.completedAt = updates.completedAt;
  if (updates.pickupProofImageUrl !== undefined) data.pickupProofImageUrl = updates.pickupProofImageUrl;
  if (updates.deliveryProofImageUrl !== undefined) data.deliveryProofImageUrl = updates.deliveryProofImageUrl;
  if (updates.proofImageUrl !== undefined) data.proofImageUrl = updates.proofImageUrl;
  if (updates.riderId !== undefined) data.riderId = updates.riderId;
  if (updates.legs) data.legsJson = JSON.stringify(updates.legs);
  if (updates.pickupRiderId !== undefined) data.pickupRiderId = updates.pickupRiderId;
  if (updates.pickupScheduledAt !== undefined) data.pickupScheduledAt = updates.pickupScheduledAt;
  if (updates.deliveryRiderId !== undefined) data.deliveryRiderId = updates.deliveryRiderId;
  if (updates.deliveryScheduledAt !== undefined) data.deliveryScheduledAt = updates.deliveryScheduledAt;
  if (updates.customerId !== undefined) data.customerId = updates.customerId;
  if (updates.distance !== undefined) data.distance = updates.distance;
  if (updates.isShopPaid !== undefined) {
    data.isShopPaid = updates.isShopPaid;
    if (updates.isShopPaid === true && existingJob?.isShopPaid !== true) {
      data.shopPaidAt = new Date();
    } else if (updates.isShopPaid === false) {
      data.shopPaidAt = null;
    }
  }
  if (updates.billNo !== undefined) {
    if (shouldPreserveExisting(updates.billNo, existingJob?.billNo)) {
      console.log(`[Prevent Overwrite] Preserved existing billNo '${existingJob?.billNo}' on Job ${id} from being erased by empty string.`);
    } else {
      data.billNo = updates.billNo;
    }
  }
  if (updates.items !== undefined) data.itemsJson = updates.items ? JSON.stringify(updates.items) : null;

  // Additional fields for full job edits
  if (updates.customerName !== undefined) {
    if (shouldPreserveExisting(updates.customerName, existingJob?.customerName)) {
      console.log(`[Prevent Overwrite] Preserved existing customerName '${existingJob?.customerName}' on Job ${id} from being erased by empty string.`);
    } else {
      data.customerName = updates.customerName;
    }
  }
  if (updates.customerPhone !== undefined) {
    if (shouldPreserveExisting(updates.customerPhone, existingJob?.customerPhone)) {
      console.log(`[Prevent Overwrite] Preserved existing customerPhone '${existingJob?.customerPhone}' on Job ${id} from being erased by empty string.`);
    } else {
      data.customerPhone = updates.customerPhone;
    }
  }
  if (updates.pickupLocation !== undefined) {
    if (shouldPreserveExisting(updates.pickupLocation, existingJob?.pickupLocation)) {
      console.log(`[Prevent Overwrite] Preserved existing pickupLocation '${existingJob?.pickupLocation}' on Job ${id} from being erased by empty string.`);
    } else {
      data.pickupLocation = updates.pickupLocation;
    }
  }
  if (updates.dropoffLocation !== undefined) {
    if (shouldPreserveExisting(updates.dropoffLocation, existingJob?.dropoffLocation)) {
      console.log(`[Prevent Overwrite] Preserved existing dropoffLocation '${existingJob?.dropoffLocation}' on Job ${id} from being erased by empty string.`);
    } else {
      data.dropoffLocation = updates.dropoffLocation;
    }
  }
  if (updates.pickupCoords) {
    data.pickupLat = updates.pickupCoords.lat;
    data.pickupLng = updates.pickupCoords.lng;
  }
  if (updates.dropoffCoords) {
    data.dropoffLat = updates.dropoffCoords.lat;
    data.dropoffLng = updates.dropoffCoords.lng;
  }
  if (updates.bagImageUrl !== undefined) data.bagImageUrl = updates.bagImageUrl;
  if (updates.billImageUrl !== undefined) {
    if (updates.billImageUrl && existingJob?.billImageUrl) {
      try {
        const incomingUrls = JSON.parse(updates.billImageUrl);
        const existingUrls = JSON.parse(existingJob.billImageUrl);
        if (Array.isArray(incomingUrls) && Array.isArray(existingUrls)) {
          // If incoming has a receipt, replace older receipt from existing
          const incomingHasReceipt = incomingUrls.some(u => typeof u === "string" && (u.includes("/receipt-") || u.includes("receipt-")));
          const baseExisting = incomingHasReceipt
            ? existingUrls.filter(u => typeof u === "string" && !u.includes("/receipt-") && !u.includes("receipt-"))
            : existingUrls;
          // Merge unique URLs so concurrent background uploads (e.g. proforma and receipt) never clobber each other
          const merged = Array.from(new Set([...baseExisting, ...incomingUrls]));
          // Sort so highest revision proforma always comes first, followed by receipt, then other proofs
          merged.sort((a, b) => {
            const aIsPf = a.includes("proforma-");
            const bIsPf = b.includes("proforma-");
            if (aIsPf && !bIsPf) return -1;
            if (!aIsPf && bIsPf) return 1;
            if (aIsPf && bIsPf) {
              const aRev = parseInt((a.match(/-rev(\d+)\.png/i) || [])[1] || "0", 10);
              const bRev = parseInt((b.match(/-rev(\d+)\.png/i) || [])[1] || "0", 10);
              return bRev - aRev;
            }
            const aIsRc = a.includes("receipt-");
            const bIsRc = b.includes("receipt-");
            if (aIsRc && !bIsRc) return 1;
            if (!aIsRc && bIsRc) return -1;
            return 0;
          });
          data.billImageUrl = JSON.stringify(merged);
        } else {
          data.billImageUrl = updates.billImageUrl;
        }
      } catch {
        data.billImageUrl = updates.billImageUrl;
      }
    } else {
      data.billImageUrl = updates.billImageUrl;
    }
  }
  if ((updates as any).proformaNumber !== undefined) (data as any).proformaNumber = (updates as any).proformaNumber;
  if ((updates as any).proformaRevision !== undefined) (data as any).proformaRevision = (updates as any).proformaRevision;
  if ((updates as any).proformaCartHash !== undefined) (data as any).proformaCartHash = (updates as any).proformaCartHash;
  if (updates.paymentMethod !== undefined) data.paymentMethod = updates.paymentMethod;
  if (updates.paymentChannel !== undefined) data.paymentChannel = updates.paymentChannel;
  if (updates.isPaid !== undefined) {
    data.isPaid = updates.isPaid;
    if (updates.isPaid === true && existingJob?.isPaid !== true) {
      data.csoPaidAt = new Date();
    } else if (updates.isPaid === false) {
      data.csoPaidAt = null;
    }
  }
  if ((updates as any).csoPaidAt !== undefined) data.csoPaidAt = (updates as any).csoPaidAt;
  if (updates.fee !== undefined) data.fee = Math.max(0, Number(updates.fee) || 0);
  if (updates.discount !== undefined) data.discount = updates.discount;
  if (updates.discountPercent !== undefined) data.discountPercent = updates.discountPercent;
  if (updates.totalAmount !== undefined) data.totalAmount = updates.totalAmount !== null ? Math.max(0, Number(updates.totalAmount) || 0) : null;
  if (updates.serviceType !== undefined) data.serviceType = updates.serviceType;
  if (updates.laundryTypes !== undefined) {
    data.laundryTypes = Array.isArray(updates.laundryTypes)
      ? updates.laundryTypes.join(',')
      : (updates.laundryTypes || null);
  }
  if (updates.remark !== undefined) {
    if (shouldPreserveExisting(updates.remark, existingJob?.remark)) {
      console.log(`[Prevent Overwrite] Preserved existing remark '${existingJob?.remark}' on Job ${id} from being erased by empty string.`);
    } else {
      data.remark = updates.remark;
    }
  }
  if (updates.adminNotesJson !== undefined) data.adminNotesJson = updates.adminNotesJson;
  if (updates.shiftId !== undefined) data.shiftId = updates.shiftId;
  if (updates.scheduledAt !== undefined) data.scheduledAt = updates.scheduledAt;
  if (updates.branchId !== undefined) data.branchId = updates.branchId;
  if (updates.source !== undefined) data.source = updates.source;
  if (updates.pickupScheduledEndAt !== undefined) data.pickupScheduledEndAt = updates.pickupScheduledEndAt;
  if (updates.deliveryScheduledEndAt !== undefined) data.deliveryScheduledEndAt = updates.deliveryScheduledEndAt;

  if (updates.pickupDistance !== undefined) data.pickupDistance = updates.pickupDistance;
  if (updates.deliveryDistance !== undefined) data.deliveryDistance = updates.deliveryDistance;
  if (updates.distance === undefined && (updates.deliveryDistance !== undefined || updates.pickupDistance !== undefined)) {
    data.distance = updates.deliveryDistance || updates.pickupDistance || 0;
  }
  if (updates.pickupCommission !== undefined) data.pickupCommission = updates.pickupCommission !== null ? Math.max(0, Number(updates.pickupCommission) || 0) : null;
  if (updates.deliveryCommission !== undefined) data.deliveryCommission = updates.deliveryCommission !== null ? Math.max(0, Number(updates.deliveryCommission) || 0) : null;
  if (updates.createdBy !== undefined) data.createdBy = updates.createdBy;
  if (updates.cashPlaced !== undefined) data.cashPlaced = updates.cashPlaced;
  if (updates.isStuck !== undefined) data.isStuck = updates.isStuck;
  if (updates.walletBalanceAfter !== undefined) data.walletBalanceAfter = updates.walletBalanceAfter;

  // Compare changes for logging
  const changes: any = {};
  if (existingJob) {
    const logFields = [
      'status', 'subStatus', 'isPaid', 'paymentChannel', 'riderId', 
      'pickupRiderId', 'deliveryRiderId', 'pickupScheduledAt', 
      'deliveryScheduledAt', 'fee', 'totalAmount', 'remark', 'isStuck', 'cashPlaced',
      'bagImageUrl', 'billImageUrl', 'pickupProofImageUrl', 'deliveryProofImageUrl', 'proofImageUrl',
      'adminNotesJson', 'billNo', 'isShopPaid', 'customerName', 'customerPhone',
      'pickupLocation', 'dropoffLocation', 'serviceType', 'type', 'pickupCommission', 
      'deliveryCommission', 'laundryTypes', 'itemsJson'
    ];
    logFields.forEach(field => {
      const oldVal = (existingJob as any)[field];
      const newVal = data[field];
      if (newVal !== undefined && oldVal !== newVal) {
        if (oldVal instanceof Date || newVal instanceof Date) {
          const oldTime = oldVal instanceof Date ? oldVal.getTime() : new Date(oldVal).getTime();
          const newTime = newVal instanceof Date ? newVal.getTime() : new Date(newVal).getTime();
          if (oldTime !== newTime) {
            changes[field] = newVal;
          }
        } else {
          changes[field] = newVal;
        }
      }
    });
  }

  const updatedJob = await prisma.job.update({ where: { id }, data });

  // Sync commissions based on payment eligibility (CSO Paid & SHOP Paid)
  await syncRiderCommissionsForJob(id);

  if (Object.keys(changes).length > 0) {
    try {
      await prisma.activityLog.create({
        data: {
          entityId: id,
          entityType: 'job',
          action: 'update',
          details: JSON.stringify(changes),
          userId: updates.actorId || null,
          userName: updates.actorName || null,
        }
      });
      console.log(`[ActivityLog] Updated job ${id}:`, JSON.stringify(changes));
    } catch (err: any) {
      console.error("Failed to write ActivityLog on update:", err.message);
    }
  }

  // If job is cancelled, restore any CustomerCoupon that was marked USED
  if (updates.status === 'cancel') {
    try {
      const promoMatch = existingJob?.remark?.match(/Promo:\s*([^\s(|]+)/i);
      const pCode = promoMatch ? promoMatch[1].trim().toUpperCase() : null;
      await prisma.customerCoupon.updateMany({
        where: {
          OR: [
            { usedJobId: id, status: "USED" },
            ...(pCode ? [{ code: { equals: pCode, mode: "insensitive" as const }, status: "USED" }] : []),
          ],
        },
        data: { status: "ACTIVE", usedAt: null, usedJobId: null },
      });
      console.log(`[CustomerCoupon] Restored coupon to ACTIVE on cancel for job ${id}`);
    } catch (err) {
      console.warn("[CustomerCoupon] Void/restore on cancel failed:", err);
    }
  }

  return updatedJob;
}

// SERVICES
export async function addServiceAction(data: any) {
  return prisma.serviceItem.create({ data });
}

export async function updateServiceAction(id: string, data: any) {
  return prisma.serviceItem.update({ where: { id }, data });
}

export async function deleteServiceAction(id: string) {
  return prisma.serviceItem.delete({ where: { id } });
}

// RIDERS
export async function addRiderAction(data: any) {
  const rData = { ...data };
  if (data.currentLocation) {
    rData.currentLat = data.currentLocation.lat;
    rData.currentLng = data.currentLocation.lng;
    delete rData.currentLocation;
  }
  return prisma.rider.create({ data: rData });
}

export async function updateRiderAction(id: string, updates: any) {
  const data: any = { ...updates };
  if (updates.currentLocation) {
    data.currentLat = updates.currentLocation.lat;
    data.currentLng = updates.currentLocation.lng;
    delete data.currentLocation;
  }
  const updatedRider = await prisma.rider.update({ where: { id }, data });
  if (data.isActive !== undefined) {
    try {
      await prisma.adminUser.update({
        where: { id },
        data: { isActive: data.isActive }
      });
    } catch (e) {
      // Ignore if no linked AdminUser
    }
  }
  return updatedRider;
}

export async function deleteRiderAction(id: string) {
  return prisma.rider.delete({ where: { id } });
}

export async function getRiderTransactionsAction(riderId: string) {
  return prisma.riderTransaction.findMany({
    where: { riderId },
    orderBy: { createdAt: 'desc' }
  });
}

// PRICE LISTS
export async function addPriceListAction(data: any) {
  let sPrices = "{}";
  if (typeof data.servicePrices === "string") {
    sPrices = data.servicePrices;
  } else if (data.isCorporate || data.customItems) {
    sPrices = JSON.stringify({
      isCorporateCatalog: true,
      customItems: data.customItems || [],
      servicePrices: data.servicePrices || {}
    });
  } else {
    sPrices = JSON.stringify(data.servicePrices || {});
  }

  const pData = {
    name: data.name,
    isDefault: Boolean(data.isDefault),
    servicePrices: sPrices
  };
  return prisma.priceList.create({ data: pData });
}

export async function updatePriceListAction(id: string, updates: any) {
  const data: any = {};
  if (updates.name !== undefined) data.name = updates.name;
  if (updates.isDefault !== undefined) data.isDefault = updates.isDefault;

  if (updates.servicePrices !== undefined || updates.customItems !== undefined || updates.isCorporate !== undefined) {
    if (typeof updates.servicePrices === "string") {
      data.servicePrices = updates.servicePrices;
    } else if (updates.isCorporate || updates.customItems) {
      data.servicePrices = JSON.stringify({
        isCorporateCatalog: true,
        customItems: updates.customItems || [],
        servicePrices: updates.servicePrices || {}
      });
    } else {
      data.servicePrices = JSON.stringify(updates.servicePrices || {});
    }
  }
  return prisma.priceList.update({ where: { id }, data });
}

export async function deletePriceListAction(id: string) {
  await prisma.priceList.delete({ where: { id } });
  // Also update customers to default
  await prisma.customer.updateMany({
    where: { priceListId: id },
    data: { priceListId: 'regular' }
  });
}

// SHOP LOCATIONS
export async function addShopLocationAction(data: any) {
  return prisma.shopLocation.create({
    data: {
      id: data.id,
      name: data.name,
      address: data.address,
      addressFull: data.addressFull || null,
      proformaQrUrl: data.proformaQrUrl || null,
      lat: data.coords.lat,
      lng: data.coords.lng,
      noCommission: data.noCommission || false,
      isPosEnabled: data.isPosEnabled ?? false,
      area: data.area || "BKK",
      logoUrl: data.logoUrl || null,
      phone: data.phone || null,
      taxId: data.taxId || null,
    }
  });
}

export async function updateShopLocationAction(id: string, updates: any) {
  const data: any = {};
  if (updates.name) data.name = updates.name;
  if (updates.address) data.address = updates.address;
  if (updates.addressFull !== undefined) data.addressFull = updates.addressFull;
  if (updates.proformaQrUrl !== undefined) data.proformaQrUrl = updates.proformaQrUrl;
  if (updates.coords) {
    data.lat = updates.coords.lat;
    data.lng = updates.coords.lng;
  }
  if (typeof updates.noCommission !== 'undefined') {
    data.noCommission = updates.noCommission;
  }
  if (typeof updates.isPosEnabled !== 'undefined') {
    data.isPosEnabled = updates.isPosEnabled;
  }
  if (updates.area !== undefined) data.area = updates.area;
  if (updates.logoUrl !== undefined) data.logoUrl = updates.logoUrl;
  if (updates.phone !== undefined) data.phone = updates.phone;
  if (updates.taxId !== undefined) data.taxId = updates.taxId;
  return prisma.shopLocation.update({ where: { id }, data });
}

export async function deleteShopLocationAction(id: string) {
  return prisma.shopLocation.delete({ where: { id } });
}

// POIS
export async function addPOIAction(data: any) {
  return prisma.pOI.create({
    data: {
      id: data.id,
      name: data.name,
      address: data.address,
      lat: data.coords.lat,
      lng: data.coords.lng,
      placeId: data.placeId,
    }
  });
}

export async function updatePOIAction(id: string, updates: any) {
  const data: any = {};
  if (updates.name) data.name = updates.name;
  if (updates.address) data.address = updates.address;
  if (updates.placeId !== undefined) data.placeId = updates.placeId;
  if (updates.coords) {
    data.lat = updates.coords.lat;
    data.lng = updates.coords.lng;
  }
  return prisma.pOI.update({ where: { id }, data });
}

export async function deletePOIAction(id: string) {
  return prisma.pOI.delete({ where: { id } });
}

export interface DuplicatePoiGroup {
  groupId: string;
  groupTitle: string;
  matchType: 'coords' | 'name' | 'coords_and_name' | 'url';
  matchReason: string;
  recommendedKeepId: string;
  items: {
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    placeId: string | null;
    distanceKm: number | null;
    closestShopId: string | null;
  }[];
}

export async function getDuplicatePOIsAction(): Promise<{
  groups: DuplicatePoiGroup[];
  totalPoisCount: number;
  totalDuplicateGroups: number;
  totalRedundantCount: number;
}> {
  const pois = await prisma.pOI.findMany({
    orderBy: { name: 'asc' }
  });

  const groupedIds = new Set<string>();
  const duplicateGroups: DuplicatePoiGroup[] = [];

  // Phase 1: Group by Coordinates (rounded to 4 decimals, approx 11m radius)
  const coordMap = new Map<string, typeof pois>();
  for (const p of pois) {
    const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    if (!coordMap.has(key)) coordMap.set(key, []);
    coordMap.get(key)!.push(p);
  }

  for (const [key, items] of coordMap.entries()) {
    if (items.length > 1) {
      items.forEach(it => groupedIds.add(it.id));
      
      const distinctNames = new Set(items.map(it => it.name.trim().toLowerCase()));
      const isBoth = distinctNames.size === 1;

      // Determine recommended keeper: prefer item with placeId or longest address
      const sortedByQuality = [...items].sort((a, b) => {
        if (a.placeId && !b.placeId) return -1;
        if (!a.placeId && b.placeId) return 1;
        return (b.address?.length || 0) - (a.address?.length || 0);
      });
      const recommended = sortedByQuality[0]?.id || items[0].id;

      duplicateGroups.push({
        groupId: `coord-${key.replace(',', '_')}`,
        groupTitle: items[0].name || `Coordinates ${key}`,
        matchType: isBoth ? 'coords_and_name' : 'coords',
        matchReason: isBoth 
          ? `Same coordinates & name (${items.length} locations)` 
          : `Same coordinates (${items.length} locations - e.g. TH/EN names or duplicate pins)`,
        recommendedKeepId: recommended,
        items: items.map(it => ({
          id: it.id,
          name: it.name,
          address: it.address,
          lat: it.lat,
          lng: it.lng,
          placeId: it.placeId || null,
          distanceKm: it.distanceKm || null,
          closestShopId: it.closestShopId || null,
        })),
      });
    }
  }

  // Phase 2: Group by Exact Google Maps URL (for remaining items)
  const urlMap = new Map<string, typeof pois>();
  for (const p of pois) {
    if (groupedIds.has(p.id)) continue;
    const url = (p.address || '').trim().toLowerCase();
    if (url.startsWith('http')) {
      if (!urlMap.has(url)) urlMap.set(url, []);
      urlMap.get(url)!.push(p);
    }
  }

  for (const [, items] of urlMap.entries()) {
    if (items.length > 1) {
      items.forEach(it => groupedIds.add(it.id));
      duplicateGroups.push({
        groupId: `url-${items[0].id}`,
        groupTitle: items[0].name,
        matchType: 'url',
        matchReason: `Same Google Maps URL (${items.length} locations)`,
        recommendedKeepId: items[0].id,
        items: items.map(it => ({
          id: it.id,
          name: it.name,
          address: it.address,
          lat: it.lat,
          lng: it.lng,
          placeId: it.placeId || null,
          distanceKm: it.distanceKm || null,
          closestShopId: it.closestShopId || null,
        })),
      });
    }
  }

  // Phase 3: Group by Exact Name (for remaining items not grouped by coords)
  const nameMap = new Map<string, typeof pois>();
  for (const p of pois) {
    if (groupedIds.has(p.id)) continue;
    const normName = p.name.trim().toLowerCase();
    if (normName.length >= 3) {
      if (!nameMap.has(normName)) nameMap.set(normName, []);
      nameMap.get(normName)!.push(p);
    }
  }

  for (const [, items] of nameMap.entries()) {
    if (items.length > 1) {
      items.forEach(it => groupedIds.add(it.id));
      duplicateGroups.push({
        groupId: `name-${items[0].id}`,
        groupTitle: items[0].name,
        matchType: 'name',
        matchReason: `Exact same location name (${items.length} locations)`,
        recommendedKeepId: items[0].id,
        items: items.map(it => ({
          id: it.id,
          name: it.name,
          address: it.address,
          lat: it.lat,
          lng: it.lng,
          placeId: it.placeId || null,
          distanceKm: it.distanceKm || null,
          closestShopId: it.closestShopId || null,
        })),
      });
    }
  }

  // Sort groups: largest duplicate group first, then by matchType priority
  duplicateGroups.sort((a, b) => {
    if (b.items.length !== a.items.length) {
      return b.items.length - a.items.length;
    }
    const priority = { coords_and_name: 1, coords: 2, url: 3, name: 4 };
    return priority[a.matchType] - priority[b.matchType];
  });

  const totalRedundantCount = duplicateGroups.reduce((acc, g) => acc + (g.items.length - 1), 0);

  return {
    groups: duplicateGroups,
    totalPoisCount: pois.length,
    totalDuplicateGroups: duplicateGroups.length,
    totalRedundantCount,
  };
}

export async function deletePOIsAction(ids: string[], actorId?: string, actorName?: string) {
  if (!ids || ids.length === 0) return { success: true, count: 0 };
  const res = await prisma.pOI.deleteMany({
    where: { id: { in: ids } }
  });

  try {
    await prisma.activityLog.create({
      data: {
        entityId: ids.slice(0, 3).join(','),
        entityType: 'poi',
        action: 'bulk_delete',
        details: JSON.stringify({ count: res.count, deletedIds: ids }),
        userId: actorId || null,
        userName: actorName || 'Admin User',
      }
    });
  } catch (e: any) {
    console.error("Failed to write activity log for POI delete:", e.message);
  }

  return { success: true, count: res.count };
}
// SETTINGS
export async function updateSettingAction(key: string, value: string) {
  const result = await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });

  if (key === 'riderCommissionPerKm') {
    const rate = parseFloat(value);
    if (!isNaN(rate)) {
      try {
        await prisma.$executeRaw`
          UPDATE "Job"
          SET "pickupCommission" = FLOOR("pickupDistance") * ${rate}
          WHERE "pickupDistance" > 0
            AND (
              ("remark" IS NULL OR "remark" NOT LIKE '%Free Delivery%')
              OR "customerId" IN (SELECT "id" FROM "Customer" WHERE "isCorporate" = true AND ("corporateCommissionType" = 'default' OR "corporateCommissionType" IS NULL))
            )
            AND ("customerId" IS NULL OR "customerId" NOT IN (SELECT "id" FROM "Customer" WHERE "isVIP" = true OR ("isCorporate" = true AND "corporateCommissionType" IS NOT NULL AND "corporateCommissionType" != 'default')))
            AND "status" NOT IN ('billing', 'completed', 'cancel')
        `;
        await prisma.$executeRaw`
          UPDATE "Job"
          SET "deliveryCommission" = FLOOR("deliveryDistance") * ${rate}
          WHERE "deliveryDistance" > 0
            AND (
              ("remark" IS NULL OR "remark" NOT LIKE '%Free Delivery%')
              OR "customerId" IN (SELECT "id" FROM "Customer" WHERE "isCorporate" = true AND ("corporateCommissionType" = 'default' OR "corporateCommissionType" IS NULL))
            )
            AND ("customerId" IS NULL OR "customerId" NOT IN (SELECT "id" FROM "Customer" WHERE "isVIP" = true OR ("isCorporate" = true AND "corporateCommissionType" IS NOT NULL AND "corporateCommissionType" != 'default')))
            AND "status" NOT IN ('completed', 'cancel')
        `;
        console.log(`[Setting Update] Updated active job commissions to use new rate: ฿${rate}`);
      } catch (err: any) {
        console.error("Failed to update active job commissions on setting change:", err.message);
      }
    }
  }

  return result;
}

export async function addJobLogAction(id: string, logEntry: any, actorId?: string, actorName?: string) {
  const job = await prisma.job.findUnique({ where: { id }, select: { adminNotesJson: true } });
  if (!job) throw new Error('Job not found');
  let notes: any[] = [];
  let payments: any[] = [];
  let isStructured = false;

  let existingObj: any = {};

  if (job.adminNotesJson) {
    try {
      const parsed = JSON.parse(job.adminNotesJson);
      if (parsed && typeof parsed === 'object') {
        existingObj = parsed;
        if (Array.isArray(parsed.notes) || Array.isArray(parsed.payments)) {
          isStructured = true;
          notes = Array.isArray(parsed.notes) ? parsed.notes : [];
          payments = Array.isArray(parsed.payments) ? parsed.payments : [];
        } else if (Array.isArray(parsed)) {
          notes = parsed;
        }
      }
    } catch (e) {
      notes = [];
    }
  }
  notes.push(logEntry);

  let updatedJson: string;
  if (isStructured || payments.length > 0 || existingObj.isTaxInvoiceRequested !== undefined) {
    updatedJson = JSON.stringify({ ...existingObj, payments, notes });
  } else {
    updatedJson = JSON.stringify(notes);
  }

  const updated = await prisma.job.update({ 
    where: { id }, 
    data: { adminNotesJson: updatedJson } 
  });

  try {
    await prisma.activityLog.create({
      data: {
        entityId: id,
        entityType: 'job',
        action: 'update',
        details: JSON.stringify({ adminNotesJson: updatedJson }),
        userId: actorId || null,
        userName: actorName || null,
      }
    });
  } catch (err: any) {
    console.error("Failed to write ActivityLog on addJobLogAction:", err.message);
  }

  return updated;
}

export async function diagnoseJobAction(jobId: string) {
  try {
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      return { success: false, error: 'Job not found' };
    }
    const gcsFiles = await listFilesForJob(jobId);
    return {
      success: true,
      job: {
        id: job.id,
        customerName: job.customerName,
        status: job.status,
        subStatus: job.subStatus,
        pickupRiderId: job.pickupRiderId,
        deliveryRiderId: job.deliveryRiderId,
        pickupProofImageUrl: job.pickupProofImageUrl,
        deliveryProofImageUrl: job.deliveryProofImageUrl,
        proofImageUrl: job.proofImageUrl,
        legsJson: job.legsJson,
        pickupCommission: job.pickupCommission,
        deliveryCommission: job.deliveryCommission,
      },
      gcsFiles
    };
  } catch (error: any) {
    console.error('Failed in diagnoseJobAction:', error);
    return { success: false, error: error.message || 'Diagnostic failed' };
  }
}

export async function resolveJobDiscrepancyAction(
  jobId: string,
  legType: 'pickup' | 'delivery',
  fileUrls: string[],
  actorId?: string,
  actorName?: string
) {
  try {
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return { success: false, error: 'Job not found' };

    const proofJson = JSON.stringify(fileUrls);
    const now = new Date();

    const currentLegs = JSON.parse(job.legsJson || '{}');
    let updatedLegs = { ...currentLegs };
    let updateData: any = {};
    let riderId = '';
    let commission = 0;
    let type = '';

    if (legType === 'pickup') {
      updateData = {
        status: 'billing',
        pickupProofImageUrl: proofJson,
      };
      updatedLegs.pickupOutbound = {
        ...updatedLegs.pickupOutbound,
        status: 'completed',
        completedAt: now,
      };
      updatedLegs.pickupInbound = {
        ...updatedLegs.pickupInbound,
        status: 'completed',
        completedAt: now,
      };
      riderId = job.pickupRiderId || '';
      commission = job.pickupCommission || 0;
      type = 'commission_pickup';
    } else {
      updateData = {
        status: 'completed',
        deliveryProofImageUrl: proofJson,
        proofImageUrl: fileUrls[0] || null,
        completedAt: now,
      };
      updatedLegs.deliveryOutbound = {
        ...updatedLegs.deliveryOutbound,
        status: 'completed',
        completedAt: now,
      };
      updatedLegs.deliveryInbound = {
        ...updatedLegs.deliveryInbound,
        status: 'completed',
        completedAt: now,
      };
      riderId = job.deliveryRiderId || '';
      commission = job.deliveryCommission || 0;
      type = 'commission_delivery';
    }

    updateData.legsJson = JSON.stringify(updatedLegs);

    // Update job
    await prisma.job.update({
      where: { id: jobId },
      data: updateData,
    });

    // Sync commissions based on payment eligibility (CSO Paid & SHOP Paid)
    await syncRiderCommissionsForJob(jobId);

    // Write Activity Log
    await prisma.activityLog.create({
      data: {
        entityId: jobId,
        entityType: 'job',
        action: 'update',
        details: JSON.stringify({
          status: updateData.status,
          ...(legType === 'pickup'
            ? { pickupProofImageUrl: proofJson }
            : { deliveryProofImageUrl: proofJson, proofImageUrl: updateData.proofImageUrl })
        }),
        userId: actorId || 'system-diag',
        userName: actorName || 'Diagnostics Recovery'
      }
    });

    return { success: true };
  } catch (error) {
    console.error('Failed in resolveJobDiscrepancyAction:', error);
    return { success: false, error: (error as Error).message || 'Resolve failed' };
  }
}

// CASHIER SHIFT OPERATIONS

/**
 * Lightweight combined check: returns user + branch open shifts in ONE round-trip.
 * Does NOT load job stats — use getOpenShiftAction for full stats (POS tab only).
 */
export async function getShiftStatusAction(userId: string, branchId?: string) {
  try {
    const [userShift, branchShift] = await Promise.all([
      prisma.cashierShift.findFirst({ where: { userId, status: 'open' }, orderBy: { openedAt: 'desc' } }),
      branchId ? prisma.cashierShift.findFirst({ where: { branchId, status: 'open' }, orderBy: { openedAt: 'desc' } }) : Promise.resolve(null)
    ]);
    return { userShift, branchShift };
  } catch (e) {
    console.error("Error in getShiftStatusAction:", e);
    return { userShift: null, branchShift: null };
  }
}

function calculateShiftSales(
  shift: { id: string; startingCash: number },
  jobs: Array<{
    totalAmount: number | null;
    paymentChannel: string | null;
    status: string;
    isPaid: boolean;
    adminNotesJson: string | null;
  }>,
  cashRefunds: number = 0
) {
  let cashSales = 0, transferSales = 0, cardSales = 0, creditSales = 0;
  let totalOrders = 0, cashOrders = 0, transferOrders = 0, cardOrders = 0, creditOrders = 0;

  for (const job of jobs) {
    if (job.status === 'cancel') continue;
    if (!job.isPaid) continue;

    let jobCounted = false;
    let usedCash = false, usedTransfer = false, usedCard = false, usedCredit = false;

    // Parse structured payment records from adminNotesJson (supports split payments)
    if (job.adminNotesJson) {
      try {
        const parsed = JSON.parse(job.adminNotesJson);
        if (parsed && Array.isArray(parsed.payments)) {
          for (const pay of parsed.payments) {
            // Only count payments that belong to THIS shift (if shiftId is recorded)
            if (pay.shiftId && pay.shiftId !== shift.id) continue;
            const method = (pay.method || '').toLowerCase();
            const amount = Number(pay.amount) || 0;
            if (method === 'cash') { cashSales += amount; usedCash = true; }
            else if (method === 'transfer') { transferSales += amount; usedTransfer = true; }
            else if (method === 'card') { cardSales += amount; usedCard = true; }
            else if (method === 'credit') { creditSales += amount; usedCredit = true; }
          }
          jobCounted = usedCash || usedTransfer || usedCard || usedCredit;
        }
      } catch (e) {
        // Fall back to legacy check
      }
    }

    // Legacy fallback: single paymentChannel when adminNotesJson has no payments array
    if (!jobCounted) {
      const amount = job.totalAmount || 0;
      const ch = (job.paymentChannel || '').toLowerCase();
      if (ch === 'cash / cod' || ch === 'cash') { cashSales += amount; usedCash = true; }
      else if (ch === 'transfer') { transferSales += amount; usedTransfer = true; }
      else if (ch === 'credit card' || ch === 'card') { cardSales += amount; usedCard = true; }
      else if (ch === 'hq/credit' || ch === 'credit') { creditSales += amount; usedCredit = true; }
      // Notice: unknown payment channels are NEVER counted as cash
    }

    if (usedCash || usedTransfer || usedCard || usedCredit) {
      totalOrders++;
      if (usedCash) cashOrders++;
      if (usedTransfer) transferOrders++;
      if (usedCard) cardOrders++;
      if (usedCredit) creditOrders++;
    }
  }

  const expectedCash = Math.max(0, shift.startingCash + cashSales - cashRefunds);
  return {
    cashSales,
    transferSales,
    cardSales,
    creditSales,
    cashRefunds,
    expectedCash,
    totalOrders,
    cashOrders,
    transferOrders,
    cardOrders,
    creditOrders
  };
}

export async function getOpenShiftAction(userId: string) {
  try {
    const shift = await prisma.cashierShift.findFirst({
      where: { userId, status: 'open' },
      orderBy: { openedAt: 'desc' }
    });
    if (!shift) return null;

    const [jobs, refunds] = await Promise.all([
      prisma.job.findMany({
        where: { shiftId: shift.id },
        select: { totalAmount: true, paymentChannel: true, status: true, isPaid: true, adminNotesJson: true }
      }),
      prisma.jobRefund.findMany({
        where: { shiftId: shift.id, shiftAffected: true },
        select: { refundAmount: true, refundChannel: true, originalChannel: true }
      })
    ]);

    const cashRefunds = refunds
      .filter(r => r.refundChannel === 'cash' || (!r.refundChannel && r.originalChannel === 'Cash / COD'))
      .reduce((s, r) => s + (r.refundAmount || 0), 0);

    const stats = calculateShiftSales(shift, jobs, cashRefunds);

    return {
      ...shift,
      ...stats
    };
  } catch (e) {
    console.error("Error in getOpenShiftAction:", e);
    return null;
  }
}

export async function getBranchOpenShiftAction(branchId: string) {
  try {
    const shift = await prisma.cashierShift.findFirst({
      where: { branchId, status: 'open' },
      orderBy: { openedAt: 'desc' }
    });
    if (!shift) return null;

    const [jobs, refunds] = await Promise.all([
      prisma.job.findMany({
        where: { shiftId: shift.id },
        select: { totalAmount: true, paymentChannel: true, status: true, isPaid: true, adminNotesJson: true }
      }),
      prisma.jobRefund.findMany({
        where: { shiftId: shift.id, shiftAffected: true },
        select: { refundAmount: true, refundChannel: true, originalChannel: true }
      })
    ]);

    const cashRefunds = refunds
      .filter(r => r.refundChannel === 'cash' || (!r.refundChannel && r.originalChannel === 'Cash / COD'))
      .reduce((s, r) => s + (r.refundAmount || 0), 0);

    const stats = calculateShiftSales(shift, jobs, cashRefunds);

    return {
      ...shift,
      ...stats
    };
  } catch (e) {
    console.error("Error in getBranchOpenShiftAction:", e);
    return null;
  }
}

export async function openShiftAction(data: { userId: string, userName: string, branchId: string, startingCash: number, notes?: string }) {
  try {
    return await prisma.$transaction(async (tx) => {
      // Check if there is already an open shift for this user
      const existingUserOpen = await tx.cashierShift.findFirst({
        where: { userId: data.userId, status: 'open' },
        orderBy: { openedAt: 'desc' }
      });
      if (existingUserOpen) {
        throw new Error("You already have an open shift.");
      }

      // Check if there is already an open shift for this branch
      const existingBranchOpen = await tx.cashierShift.findFirst({
        where: { branchId: data.branchId, status: 'open' },
        orderBy: { openedAt: 'desc' }
      });
      if (existingBranchOpen) {
        throw new Error(`Branch already has an active shift opened by ${existingBranchOpen.userName}.`);
      }

      const newShift = await tx.cashierShift.create({
        data: {
          userId: data.userId,
          userName: data.userName,
          branchId: data.branchId,
          startingCash: data.startingCash,
          expectedCash: data.startingCash,
          status: 'open',
          notes: data.notes || null,
        }
      });
      return { success: true as const, shift: newShift };
    });
  } catch (e) {
    console.error("Error in openShiftAction:", e);
    return { success: false as const, error: (e as Error).message || "Failed to open shift" };
  }
}

export async function closeShiftAction(data: { shiftId: string, actualCash: number, notes?: string }) {
  try {
    return await prisma.$transaction(async (tx) => {
      const shift = await tx.cashierShift.findUnique({
        where: { id: data.shiftId }
      });
      if (!shift) {
        throw new Error("Shift not found");
      }
      if (shift.status === 'closed') {
        throw new Error("Shift is already closed");
      }

      // Fetch all jobs and cash refunds linked to this shift
      const [jobs, refunds] = await Promise.all([
        tx.job.findMany({
          where: { shiftId: data.shiftId },
          select: {
            totalAmount: true,
            paymentChannel: true,
            status: true,
            isPaid: true,
            adminNotesJson: true,
          }
        }),
        tx.jobRefund.findMany({
          where: { shiftId: data.shiftId, shiftAffected: true },
          select: {
            refundAmount: true,
            refundChannel: true,
            originalChannel: true,
          }
        })
      ]);

      const cashRefunds = refunds
        .filter(r => r.refundChannel === 'cash' || (!r.refundChannel && r.originalChannel === 'Cash / COD'))
        .reduce((s, r) => s + (r.refundAmount || 0), 0);

      const stats = calculateShiftSales(shift, jobs, cashRefunds);
      const shortageOverage = data.actualCash - stats.expectedCash;

      // Preserve opening notes when closing shift
      const existingNotes = shift.notes ? shift.notes.trim() : "";
      const closingNotes = data.notes ? data.notes.trim() : "";
      const combinedNotes = closingNotes 
        ? (existingNotes ? `${existingNotes} | [Closing]: ${closingNotes}` : `[Closing]: ${closingNotes}`)
        : (existingNotes || null);

      let closedShift;
      try {
        closedShift = await tx.cashierShift.update({
          where: { id: data.shiftId },
          data: {
            closedAt: new Date(),
            actualCash: data.actualCash,
            cashSales: stats.cashSales,
            transferSales: stats.transferSales,
            cardSales: stats.cardSales,
            creditSales: stats.creditSales,
            expectedCash: stats.expectedCash,
            shortageOverage,
            status: 'closed',
            notes: combinedNotes,
            totalOrders: stats.totalOrders,
            cashOrders: stats.cashOrders,
            transferOrders: stats.transferOrders,
            cardOrders: stats.cardOrders,
            creditOrders: stats.creditOrders,
          }
        });
      } catch (err: any) {
        // Fallback if production DB lacks the 5 order count columns (P2022)
        if (err?.code === 'P2022' || err?.message?.includes('column') || err?.message?.includes('does not exist')) {
          closedShift = await tx.cashierShift.update({
            where: { id: data.shiftId },
            data: {
              closedAt: new Date(),
              actualCash: data.actualCash,
              cashSales: stats.cashSales,
              transferSales: stats.transferSales,
              cardSales: stats.cardSales,
              creditSales: stats.creditSales,
              expectedCash: stats.expectedCash,
              shortageOverage,
              status: 'closed',
              notes: combinedNotes,
            }
          });
        } else {
          throw err;
        }
      }

      return { success: true as const, shift: closedShift };
    });
  } catch (e) {
    console.error("Error in closeShiftAction:", e);
    return { success: false as const, error: (e as Error).message || "Failed to close shift" };
  }
}

export async function getClosedShiftsAction(branchId?: string) {
  try {
    const shifts = await prisma.cashierShift.findMany({
      where: {
        status: 'closed',
        ...(branchId ? { branchId } : {})
      },
      orderBy: { closedAt: 'desc' },
      take: 100
    });
    return shifts;
  } catch (e) {
    console.error("Error in getClosedShiftsAction:", e);
    return [];
  }
}

export async function getOpenShiftsAction() {
  try {
    const shifts = await prisma.cashierShift.findMany({
      where: { status: 'open' },
      orderBy: { openedAt: 'desc' }
    });
    return shifts;
  } catch (e) {
    console.error("Error in getOpenShiftsAction:", e);
    return [];
  }
}




export async function checkIsPaymentEligible(job: { source?: string | null; type?: string | null; isPaid?: boolean | null; isShopPaid?: boolean | null }) {
  const isWalkIn = job.source === 'pos' || job.type === 'in_store';
  if (isWalkIn) {
    return job.isShopPaid === true;
  }
  return job.isPaid === true && job.isShopPaid === true;
}

export async function syncRiderCommissionsForJob(jobId: string) {
  try {
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) return;

    // If the job was refunded (has refundId), the rider already did the physical trip — protect their earned commission from being reverted
    if (job.refundId) {
      return;
    }

    // If this is a reissued job (has refundedFromId), the commission was already earned on the original job — do not award duplicate commission
    if (job.refundedFromId) {
      return;
    }

    const isEligible = await checkIsPaymentEligible(job);

    // 1. Pickup Commission Check
    const pickupRiderId = job.pickupRiderId;
    const pickupCommission = job.pickupCommission || 0;
    const isPickupDone = job.status !== 'tba' && job.status !== 'pending' && job.status !== 'pickup' && job.status !== 'cancel' && job.status !== 'return';

    const existingPickupTx = await prisma.riderTransaction.findFirst({
      where: { jobId, type: 'commission_pickup' }
    });

    if (isEligible && isPickupDone && pickupRiderId && pickupCommission > 0) {
      if (!existingPickupTx) {
        await prisma.riderTransaction.create({
          data: {
            riderId: pickupRiderId,
            jobId,
            amount: pickupCommission,
            type: 'commission_pickup',
            detail: `Job ${jobId} - Pickup`
          }
        });
        await prisma.rider.update({
          where: { id: pickupRiderId },
          data: { commissionBalance: { increment: pickupCommission } }
        });
        console.log(`[Commission Award] Awarded pickup commission of ฿${pickupCommission} for Rider ${pickupRiderId} on Job ${jobId}`);
      } else if (existingPickupTx.riderId !== pickupRiderId || existingPickupTx.amount !== pickupCommission) {
        await prisma.rider.update({
          where: { id: existingPickupTx.riderId },
          data: { commissionBalance: { decrement: existingPickupTx.amount } }
        });
        await prisma.riderTransaction.update({
          where: { id: existingPickupTx.id },
          data: {
            riderId: pickupRiderId,
            amount: pickupCommission,
            detail: `Job ${jobId} - Pickup`
          }
        });
        await prisma.rider.update({
          where: { id: pickupRiderId },
          data: { commissionBalance: { increment: pickupCommission } }
        });
      }
    } else if ((!isEligible || !isPickupDone) && existingPickupTx) {
      await prisma.rider.update({
        where: { id: existingPickupTx.riderId },
        data: { commissionBalance: { decrement: existingPickupTx.amount } }
      });
      await prisma.riderTransaction.delete({
        where: { id: existingPickupTx.id }
      });
      console.log(`[Commission Revert] Reverted pickup commission of ฿${existingPickupTx.amount} for Rider ${existingPickupTx.riderId} on Job ${jobId}`);
    }

    // 2. Delivery Commission Check
    const deliveryRiderId = job.deliveryRiderId;
    const deliveryCommission = job.deliveryCommission || 0;
    const isDeliveryDone = job.status === 'completed';

    const existingDeliveryTx = await prisma.riderTransaction.findFirst({
      where: { jobId, type: 'commission_delivery' }
    });

    if (isEligible && isDeliveryDone && deliveryRiderId && deliveryCommission > 0) {
      if (!existingDeliveryTx) {
        await prisma.riderTransaction.create({
          data: {
            riderId: deliveryRiderId,
            jobId,
            amount: deliveryCommission,
            type: 'commission_delivery',
            detail: `Job ${jobId} - Delivery`
          }
        });
        await prisma.rider.update({
          where: { id: deliveryRiderId },
          data: { commissionBalance: { increment: deliveryCommission } }
        });
        console.log(`[Commission Award] Awarded delivery commission of ฿${deliveryCommission} for Rider ${deliveryRiderId} on Job ${jobId}`);
      } else if (existingDeliveryTx.riderId !== deliveryRiderId || existingDeliveryTx.amount !== deliveryCommission) {
        await prisma.rider.update({
          where: { id: existingDeliveryTx.riderId },
          data: { commissionBalance: { decrement: existingDeliveryTx.amount } }
        });
        await prisma.riderTransaction.update({
          where: { id: existingDeliveryTx.id },
          data: {
            riderId: deliveryRiderId,
            amount: deliveryCommission,
            detail: `Job ${jobId} - Delivery`
          }
        });
        await prisma.rider.update({
          where: { id: deliveryRiderId },
          data: { commissionBalance: { increment: deliveryCommission } }
        });
      }
    } else if ((!isEligible || !isDeliveryDone) && existingDeliveryTx) {
      await prisma.rider.update({
        where: { id: existingDeliveryTx.riderId },
        data: { commissionBalance: { decrement: existingDeliveryTx.amount } }
      });
      await prisma.riderTransaction.delete({
        where: { id: existingDeliveryTx.id }
      });
      console.log(`[Commission Revert] Reverted delivery commission of ฿${existingDeliveryTx.amount} for Rider ${existingDeliveryTx.riderId} on Job ${jobId}`);
    }
  } catch (err: any) {
    console.error(`[syncRiderCommissionsForJob Error] Job ${jobId}:`, err.message);
  }
}

function shouldPreserveExisting(newValue: any, existingValue: any): boolean {
  if (existingValue !== null && existingValue !== undefined) {
    const oldStr = typeof existingValue === 'string' ? existingValue.trim() : String(existingValue).trim();
    const newStr = typeof newValue === 'string' ? newValue.trim() : (newValue === null || newValue === undefined ? '' : String(newValue).trim());
    if (oldStr !== '' && newStr === '') {
      return true;
    }
  }
  return false;
}

// ATOMIC TOP-UP ACTION: Atomically increments wallet balance and records Transaction & ActivityLog
export async function processTopUpAction(data: {
  receiptNumber: string;
  customerId: string;
  paidAmount: number;
  bonusAmount?: number;
  totalCredit: number;
  paymentChannel: string;
  slipImageUrl?: string | null;
  packageName?: string;
  receiptData?: any;
  actorId?: string | null;
  actorName?: string | null;
  branchId?: string | null;
  priceListId?: string | null;
}) {
  return await prisma.$transaction(async (tx) => {
    // 1. Fetch fresh customer directly from DB with transaction lock
    const currentCust = await tx.customer.findUnique({
      where: { id: data.customerId }
    });
    if (!currentCust) throw new Error("Customer not found");

    const balBefore = Number(currentCust.creditBalance || 0);
    const balAfter = Math.round((balBefore + data.totalCredit) * 100) / 100;
    const now = new Date();
    const expiry = calculateWalletExpiryDate(now);

    const updateData: any = {
      creditBalance: balAfter,
      isMember: true,
      memberExpiryDate: expiry,
      memberStartDate: currentCust.memberStartDate || now,
      updatedAt: now,
    };

    if (data.priceListId && !currentCust.isMember) {
      updateData.priceListId = data.priceListId;
    }

    // 2. Update customer atomically
    const updatedCustomer = await tx.customer.update({
      where: { id: data.customerId },
      data: updateData
    });

    // 3. Prepare receiptData and txDescription
    const rdata = data.receiptData ? {
      ...data.receiptData,
      id: data.receiptNumber,
      receiptNumber: data.receiptNumber,
      total: data.paidAmount,
      subtotal: data.paidAmount,
      isPaid: true,
      createdAt: now,
    } : null;

    const txDescription = JSON.stringify({
      packageName: data.packageName || "TOPUP",
      paymentChannel: data.paymentChannel,
      slipImageUrl: data.slipImageUrl || null,
      bonusAmount: data.bonusAmount || 0,
      totalCredit: data.totalCredit,
      balanceBefore: balBefore,
      balanceAfter: balAfter,
      createdBy: data.actorName || "Staff",
      branchId: data.branchId || null,
      receiptData: rdata,
    });

    // 4. Create Transaction record
    const transaction = await tx.transaction.create({
      data: {
        id: data.receiptNumber,
        memberId: data.customerId,
        amount: data.paidAmount,
        type: 'TOPUP',
        description: txDescription,
        status: 'COMPLETED',
        updatedAt: now,
      }
    });

    // 5. Create ActivityLog (TOPUP only, NO erroneous ADJUST log!)
    await tx.activityLog.create({
      data: {
        entityId: data.customerId,
        entityType: 'customer',
        action: 'TOPUP',
        details: JSON.stringify({
          customerName: currentCust.name,
          receiptNo: data.receiptNumber,
          amount: data.paidAmount,
          type: 'TOPUP',
          bonusAmount: data.bonusAmount || 0,
          totalCredit: data.totalCredit,
          balanceBefore: balBefore,
          balanceAfter: balAfter,
          paymentChannel: data.paymentChannel,
          slipImageUrl: data.slipImageUrl || null,
          packageName: data.packageName,
          branchId: data.branchId || null,
        }),
        userId: data.actorId || null,
        userName: data.actorName || null,
      }
    });

    // 6. Create WalletTransaction for Post-Approval Tracking
    await tx.walletTransaction.create({
      data: {
        customerId: data.customerId,
        customerName: currentCust.name,
        type: 'TOPUP',
        amount: data.totalCredit,
        direction: 'CREDIT',
        balanceBefore: balBefore,
        balanceAfter: balAfter,
        referenceId: data.receiptNumber,
        referenceType: 'topup_receipt',
        packageName: data.packageName || 'TOPUP',
        bonusAmount: data.bonusAmount || 0,
        paymentChannel: data.paymentChannel,
        slipImageUrl: data.slipImageUrl || null,
        createdById: data.actorId || null,
        createdByName: data.actorName || 'Staff',
        branchId: data.branchId || null,
        approvalStatus: 'PENDING',
      }
    });

    return {
      success: true,
      updatedCustomer,
      transaction,
      balanceBefore: balBefore,
      balanceAfter: balAfter,
    };
  });
}

// TOP-UP TRANSACTIONS
export async function createTopUpTransactionAction(data: {
  id: string;
  memberId: string;
  amount: number;
  description: string;
  type?: string;
  status?: string;
  userId?: string | null;
  userName?: string | null;
}) {
  const tx = await prisma.transaction.create({
    data: {
      id: data.id,
      memberId: data.memberId,
      amount: data.amount,
      type: data.type || 'TOPUP',
      description: data.description,
      status: data.status || 'COMPLETED',
      updatedAt: new Date(),
    }
  });

  // Also record in ActivityLog for comprehensive top-up audit trail
  try {
    let parsedDesc: any = {};
    try { parsedDesc = JSON.parse(data.description); } catch {}

    const cust = await prisma.customer.findUnique({
      where: { id: data.memberId },
      select: { name: true, phone: true }
    });

    await prisma.activityLog.create({
      data: {
        entityId: data.memberId,
        entityType: 'customer',
        action: 'TOPUP',
        details: JSON.stringify({
          customerName: cust?.name || parsedDesc.customerName || 'Customer',
          receiptNo: data.id,
          amount: data.amount,
          type: data.type || 'TOPUP',
          bonusAmount: parsedDesc.bonusAmount || 0,
          totalCredit: parsedDesc.totalCredit || data.amount,
          balanceBefore: parsedDesc.balanceBefore,
          balanceAfter: parsedDesc.balanceAfter,
          paymentChannel: parsedDesc.paymentChannel,
          slipImageUrl: parsedDesc.slipImageUrl || null,
          packageName: parsedDesc.packageName,
        }),
        userId: data.userId || parsedDesc.actorId || null,
        userName: data.userName || parsedDesc.createdBy || parsedDesc.actorName || null,
      }
    });
    console.log(`[ActivityLog] Top-up recorded for customer ${data.memberId} (${cust?.name}): ฿${data.amount}`);

  } catch (err: any) {
    console.error("Failed to write ActivityLog on top-up transaction:", err.message);
  }

  return tx;
}


export async function getTopUpTransactionsAction(
  filterOrCustomerId?: string | {
    customerId?: string;
    startDate?: string;
    endDate?: string;
    branchId?: string;
  }
) {
  try {
    const where: any = { type: 'TOPUP' };

    let customerId: string | undefined;
    let startDate: string | undefined;
    let endDate: string | undefined;

    if (typeof filterOrCustomerId === 'string') {
      customerId = filterOrCustomerId;
    } else if (filterOrCustomerId && typeof filterOrCustomerId === 'object') {
      customerId = filterOrCustomerId.customerId;
      startDate = filterOrCustomerId.startDate;
      endDate = filterOrCustomerId.endDate;
    }

    if (customerId) {
      where.memberId = customerId;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const list = await prisma.transaction.findMany({
      where,
      include: {
        Customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            memberId: true,
            creditBalance: true,
            isMember: true,
            isVIP: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    });

    return list.map(t => {
      let meta: any = {};
      try {
        meta = JSON.parse(t.description || "{}");
      } catch {}

      return {
        ...t,
        amount: Number(t.amount) || 0,
        createdAt: t.createdAt.toISOString(),
        customerName: t.Customer?.name || 'Customer',
        customerPhone: t.Customer?.phone || '',
        packageName: meta.packageName || 'Top Up',
        paymentChannel: meta.paymentChannel || 'Transfer',
        bonusAmount: Number(meta.bonusAmount) || 0,
        totalCredit: Number(meta.totalCredit) || Number(t.amount) || 0,
        balanceBefore: meta.balanceBefore != null ? Number(meta.balanceBefore) : null,
        balanceAfter: meta.balanceAfter != null ? Number(meta.balanceAfter) : null,
        createdBy: meta.createdBy || 'Staff',
        branchId: meta.branchId || null,
        slipImageUrl: meta.slipImageUrl || null,
      };
    });
  } catch (err: any) {
    console.error("Failed to load top-up transactions:", err?.message || err);
    return [];
  }
}

export async function updateTopUpTransactionSlipAction(data: {
  transactionId: string;
  slipImageUrl: string;
  userId?: string | null;
  userName?: string | null;
}) {
  const tx = await prisma.transaction.findUnique({
    where: { id: data.transactionId },
  });
  if (!tx) throw new Error("Transaction not found");

  let parsedDesc: any = {};
  try {
    parsedDesc = JSON.parse(tx.description || "{}");
  } catch {}

  parsedDesc.slipImageUrl = data.slipImageUrl;
  if (parsedDesc.receiptData) {
    parsedDesc.receiptData.slipImageUrl = data.slipImageUrl;
  }

  const updatedTx = await prisma.transaction.update({
    where: { id: data.transactionId },
    data: {
      description: JSON.stringify(parsedDesc),
      updatedAt: new Date(),
    },
  });

  // Also record in ActivityLog
  try {
    const cust = await prisma.customer.findUnique({
      where: { id: tx.memberId },
      select: { name: true },
    });

    await prisma.activityLog.create({
      data: {
        entityId: tx.memberId,
        entityType: 'customer',
        action: 'UPDATE_TOPUP_SLIP',
        details: JSON.stringify({
          receiptNo: data.transactionId,
          customerName: cust?.name || 'Customer',
          slipImageUrl: data.slipImageUrl,
          amount: tx.amount,
        }),
        userId: data.userId || null,
        userName: data.userName || 'Admin',
      },
    });
  } catch (err: any) {
    console.error("Failed to write ActivityLog for slip update:", err.message);
  }

  return updatedTx;
}

export async function getCustomerTodayTopUpAction(customerId: string) {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const todayTx = await prisma.transaction.findFirst({
      where: {
        memberId: customerId,
        type: 'TOPUP',
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!todayTx) return null;

    let parsedDesc: any = {};
    try { parsedDesc = JSON.parse(todayTx.description); } catch {}

    return {
      id: todayTx.id,
      amount: todayTx.amount,
      bonusAmount: parsedDesc.bonusAmount || 0,
      totalCredit: parsedDesc.totalCredit || todayTx.amount,
      balanceBefore: parsedDesc.balanceBefore,
      balanceAfter: parsedDesc.balanceAfter,
      paymentChannel: parsedDesc.paymentChannel,
      packageName: parsedDesc.packageName,
      createdBy: parsedDesc.createdBy || 'Staff',
      createdAt: todayTx.createdAt.toISOString(),
    };
  } catch (err: any) {
    console.error("Failed to check today's top-up transaction:", err.message);
    return null;
  }
}

// ─── WALLET TRANSACTION APPROVALS ──────────────────────────────────────────

export async function createWalletTransactionAction(data: {
  customerId: string;
  customerName: string;
  type: string;
  amount: number;
  direction: string;
  balanceBefore: number;
  balanceAfter: number;
  referenceId?: string | null;
  referenceType?: string | null;
  reason?: string | null;
  slipImageUrl?: string | null;
  packageName?: string | null;
  bonusAmount?: number | null;
  paymentChannel?: string | null;
  originalTxId?: string | null;
  createdById?: string | null;
  createdByName?: string | null;
  branchId?: string | null;
}) {
  return await prisma.walletTransaction.create({
    data: {
      customerId: data.customerId,
      customerName: data.customerName,
      type: data.type,
      amount: Math.abs(data.amount),
      direction: data.direction,
      balanceBefore: data.balanceBefore,
      balanceAfter: data.balanceAfter,
      referenceId: data.referenceId || null,
      referenceType: data.referenceType || null,
      reason: data.reason || null,
      slipImageUrl: data.slipImageUrl || null,
      packageName: data.packageName || null,
      bonusAmount: data.bonusAmount || null,
      paymentChannel: data.paymentChannel || null,
      originalTxId: data.originalTxId || null,
      createdById: data.createdById || null,
      createdByName: data.createdByName || 'Staff',
      branchId: data.branchId || null,
      approvalStatus: 'PENDING',
    }
  });
}

export async function getWalletTransactionsAction(filters?: {
  customerId?: string;
  approvalStatus?: string;
  type?: string;
  startDate?: string;
  endDate?: string;
  branchId?: string;
}) {
  const where: any = {};
  if (filters?.customerId) where.customerId = filters.customerId;
  if (filters?.approvalStatus && filters.approvalStatus !== 'all') where.approvalStatus = filters.approvalStatus;
  if (filters?.type && filters.type !== 'all') where.type = filters.type;
  if (filters?.branchId && filters.branchId !== 'all') where.branchId = filters.branchId;

  if (filters?.startDate || filters?.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
    if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
  }

  const txs = await prisma.walletTransaction.findMany({
    where,
    orderBy: { createdAt: 'desc' }
  });

  const customerIds = Array.from(new Set(txs.map(t => t.customerId).filter(Boolean)));
  const customers = customerIds.length > 0 ? await prisma.customer.findMany({
    where: { id: { in: customerIds } },
    select: { id: true, name: true, memberId: true, nickName: true, phone: true }
  }) : [];
  const customerMap = new Map(customers.map(c => [c.id, c]));

  return txs.map(tx => {
    const cust = customerMap.get(tx.customerId);
    const resolvedMemberId = cust?.memberId 
      || (cust?.nickName && /^[A-Z0-9_-]+$/i.test(cust.nickName.trim()) ? cust.nickName.trim() : null)
      || null;
    return {
      ...tx,
      customerMemberId: resolvedMemberId,
      customerPhone: cust?.phone || null,
    };
  });
}

export async function getPendingWalletCountAction(customerId?: string) {
  const where: any = { approvalStatus: 'PENDING' };
  if (customerId) where.customerId = customerId;
  return await prisma.walletTransaction.count({ where });
}

export async function getPendingWalletMapAction() {
  const pendingTxs = await prisma.walletTransaction.findMany({
    where: { approvalStatus: 'PENDING' },
    select: { customerId: true }
  });

  const countMap: Record<string, number> = {};
  for (const tx of pendingTxs) {
    countMap[tx.customerId] = (countMap[tx.customerId] || 0) + 1;
  }

  return {
    total: pendingTxs.length,
    byCustomer: countMap,
  };
}

export async function approveWalletTransactionAction(data: {
  id: string;
  approvedById: string;
  approvedByName: string;
}) {
  const tx = await prisma.walletTransaction.findUnique({ where: { id: data.id } });
  if (!tx) throw new Error("Transaction not found");
  if (tx.approvalStatus !== 'PENDING') throw new Error(`Transaction is already ${tx.approvalStatus}`);

  const updated = await prisma.walletTransaction.update({
    where: { id: data.id },
    data: {
      approvalStatus: 'APPROVED',
      approvedById: data.approvedById,
      approvedByName: data.approvedByName,
      approvedAt: new Date(),
    }
  });

  await prisma.activityLog.create({
    data: {
      entityId: tx.customerId,
      entityType: 'wallet',
      action: 'WALLET_APPROVED',
      details: JSON.stringify({
        transactionId: tx.id,
        customerName: tx.customerName,
        type: tx.type,
        amount: tx.amount,
        approvedBy: data.approvedByName,
      }),
      userId: data.approvedById,
      userName: data.approvedByName,
    }
  });

  return { success: true, transaction: updated };
}

export async function rejectWalletTransactionAction(data: {
  id: string;
  approvedById: string;
  approvedByName: string;
  rejectReason: string;
  deductFromWallet?: boolean;
}) {
  const originalTx = await prisma.walletTransaction.findUnique({ where: { id: data.id } });
  if (!originalTx) throw new Error("Transaction not found");
  if (originalTx.approvalStatus !== 'PENDING') throw new Error(`Transaction is already ${originalTx.approvalStatus}`);

  const isCreditTopUp = originalTx.type === 'TOPUP' || originalTx.direction === 'CREDIT';
  const shouldDeduct = Boolean(data.deductFromWallet && isCreditTopUp);

  // 1. Create a follow-up Task so staff can investigate, resolve, and discuss
  const cleanJobId = originalTx.referenceType === 'job' || originalTx.referenceId?.startsWith('RF-') || originalTx.type === 'DEDUCT'
    ? originalTx.referenceId || undefined
    : undefined;

  const taskTitle = `[Wallet Rejected] ${originalTx.type} ฿${originalTx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} - ${originalTx.customerName || "Customer"}`;

  const taskDescription = [
    `### ⚠️ Wallet Transaction Rejected`,
    `- **Transaction Type:** ${originalTx.type}`,
    `- **Amount:** ฿${originalTx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    `- **Customer:** ${originalTx.customerName || "-"} (ID: ${originalTx.customerId || "-"})`,
    cleanJobId ? `- **Linked Job:** #${cleanJobId}` : null,
    originalTx.referenceId && !cleanJobId ? `- **Reference:** ${originalTx.referenceId}` : null,
    `- **Created By:** ${originalTx.createdByName || "Staff"}`,
    `- **Rejected By:** ${data.approvedByName}`,
    `- **Reject Reason:** ${data.rejectReason}`,
    shouldDeduct
      ? `- **Wallet Balance Deduction:** Deducted ฿${originalTx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} from customer wallet.`
      : `- **Wallet Balance Deduction:** None (marked as Rejected without altering wallet balance).`,
    ``,
    `---`,
    `**Action Required:**`,
    shouldDeduct
      ? `รายการ Top-Up นี้ถูก Reject และระบบได้หักยอดเงินคืนออกจาก Wallet ลูกค้าเรียบร้อยแล้ว กรุณาตรวจสอบและดำเนินการแก้ไข (เช่น ติดต่อลูกค้า, ขอสลิปใหม่, หรือเปลี่ยนช่องทางชำระเงิน) และพูดคุยอัปเดตความคืบหน้าผ่านกล่องข้อความด้านล่างนี้`
      : `รายการนี้ถูก Reject โดยไม่ปรับยอดเงินกลับ กรุณาตรวจสอบและดำเนินการแก้ไข (เช่น ติดต่อลูกค้า, ขอสลิปใหม่, หรือเปลี่ยนช่องทางชำระเงิน) และพูดคุยอัปเดตความคืบหน้าผ่านกล่องข้อความด้านล่างนี้`
  ].filter(Boolean).join("\n");

  const attachments = originalTx.slipImageUrl ? [
    {
      id: Math.random().toString(36).slice(2, 9),
      name: "transfer-slip.jpg",
      url: originalTx.slipImageUrl,
      type: "image/jpeg",
      uploadedAt: new Date().toISOString(),
    }
  ] : undefined;

  let createdTaskId: string | null = null;
  try {
    const taskRes = await createTask({
      title: taskTitle,
      description: taskDescription,
      priority: "high",
      jobId: cleanJobId || undefined,
      assignedToId: originalTx.createdById || undefined,
      assignedToName: originalTx.createdByName || undefined,
      attachments,
      createdById: data.approvedById,
      createdByName: data.approvedByName,
    });

    if (taskRes.success && taskRes.data?.id) {
      createdTaskId = taskRes.data.id;
      // Add initial reject comment from the rejecter
      await addTaskNote(createdTaskId, {
        text: `[Rejection Reason]\n${data.rejectReason}\n\nPlease follow up on this transaction and update here.`,
        userId: data.approvedById,
        userName: data.approvedByName,
      });
    }
  } catch (err) {
    console.warn("Failed to create auto task for rejected wallet tx:", err);
  }

  // 2. Run financial update in an atomic transaction
  const storedRejectReason = createdTaskId
    ? `${data.rejectReason} [Task: ${createdTaskId}]`
    : data.rejectReason;

  return await prisma.$transaction(async (tx) => {
    let updatedCustomer: any = null;
    let reversalWTx: any = null;
    let balBefore = 0;
    let balAfter = 0;

    if (shouldDeduct) {
      const currentCust = await tx.customer.findUnique({
        where: { id: originalTx.customerId }
      });
      if (!currentCust) throw new Error("Customer not found");

      balBefore = Number(currentCust.creditBalance || 0);
      const amountToDeduct = Number(originalTx.amount || 0);
      balAfter = Math.round((balBefore - amountToDeduct) * 100) / 100;

      // Update customer creditBalance atomically
      updatedCustomer = await tx.customer.update({
        where: { id: originalTx.customerId },
        data: {
          creditBalance: balAfter,
          updatedAt: new Date(),
        }
      });

      // Create Reversal WalletTransaction record
      reversalWTx = await tx.walletTransaction.create({
        data: {
          customerId: originalTx.customerId,
          customerName: currentCust.name,
          type: 'ADJUST_DEDUCT',
          amount: amountToDeduct,
          direction: 'DEBIT',
          balanceBefore: balBefore,
          balanceAfter: balAfter,
          referenceId: originalTx.referenceId || originalTx.id,
          referenceType: 'reversal',
          reason: `Reversal for rejected Top-Up #${originalTx.referenceId || originalTx.id}: ${data.rejectReason}`,
          createdById: data.approvedById,
          createdByName: data.approvedByName,
          branchId: originalTx.branchId || null,
          approvalStatus: 'APPROVED',
          approvedById: data.approvedById,
          approvedByName: data.approvedByName,
          approvedAt: new Date(),
          originalTxId: originalTx.id,
        }
      });

      // Mark existing transaction as REJECTED if exists
      const existingTx = await tx.transaction.findFirst({
        where: {
          OR: [
            { id: originalTx.referenceId || originalTx.id },
            { description: { contains: originalTx.referenceId || originalTx.id } }
          ]
        }
      });
      if (existingTx) {
        await tx.transaction.update({
          where: { id: existingTx.id },
          data: {
            status: 'REJECTED',
            updatedAt: new Date(),
          }
        });
      }

      // Also create an ADJUST_DEDUCT record in Transaction table
      await tx.transaction.create({
        data: {
          id: `REV-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          memberId: originalTx.customerId,
          amount: amountToDeduct,
          type: 'ADJUST_DEDUCT',
          description: JSON.stringify({
            reason: `Reversal of rejected Top-Up #${originalTx.referenceId || originalTx.id}: ${data.rejectReason}`,
            originalTxId: originalTx.id,
            referenceId: originalTx.referenceId,
            balanceBefore: balBefore,
            balanceAfter: balAfter,
            rejectedBy: data.approvedByName,
          }),
          status: 'COMPLETED',
          updatedAt: new Date(),
        }
      });
    }

    // Update original transaction to REJECTED (with linked Task reference)
    const updatedTx = await tx.walletTransaction.update({
      where: { id: data.id },
      data: {
        approvalStatus: 'REJECTED',
        approvedById: data.approvedById,
        approvedByName: data.approvedByName,
        approvedAt: new Date(),
        rejectReason: storedRejectReason,
      }
    });

    // Write ActivityLog
    try {
      await tx.activityLog.create({
        data: {
          entityId: originalTx.customerId,
          entityType: 'wallet',
          action: 'WALLET_REJECTED',
          details: JSON.stringify({
            originalTxId: originalTx.id,
            customerName: originalTx.customerName,
            type: originalTx.type,
            amount: originalTx.amount,
            rejectReason: data.rejectReason,
            rejectedBy: data.approvedByName,
            deductedFromWallet: shouldDeduct,
            balanceBefore: shouldDeduct ? balBefore : undefined,
            balanceAfter: shouldDeduct ? balAfter : undefined,
            taskId: createdTaskId,
          }),
          userId: data.approvedById,
          userName: data.approvedByName,
        }
      });
    } catch (e) {
      console.warn("Failed to write ActivityLog on wallet reject:", e);
    }

    return {
      success: true,
      originalTx: updatedTx,
      reversalTx: reversalWTx,
      updatedCustomer,
      deductedFromWallet: shouldDeduct,
      balanceBefore: shouldDeduct ? balBefore : undefined,
      balanceAfter: shouldDeduct ? balAfter : originalTx.balanceAfter,
      taskId: createdTaskId,
    };
  });
}

export async function bulkApproveWalletAction(data: {
  ids: string[];
  approvedById: string;
  approvedByName: string;
}) {
  const count = await prisma.walletTransaction.updateMany({
    where: {
      id: { in: data.ids },
      approvalStatus: 'PENDING',
    },
    data: {
      approvalStatus: 'APPROVED',
      approvedById: data.approvedById,
      approvedByName: data.approvedByName,
      approvedAt: new Date(),
    }
  });

  try {
    await prisma.activityLog.create({
      data: {
        entityId: data.ids[0] || 'bulk',
        entityType: 'wallet',
        action: 'WALLET_BULK_APPROVED',
        details: JSON.stringify({
          count: count.count,
          approvedIds: data.ids,
          approvedBy: data.approvedByName,
        }),
        userId: data.approvedById,
        userName: data.approvedByName,
      }
    });
  } catch (e) {
    console.warn("Failed to write ActivityLog on bulk wallet approve:", e);
  }

  return { success: true, count: count.count };
}

// ─── REFUND & CORRECT ACTIONS ──────────────────────────────────────────────

export async function processRefundAndCorrectAction(data: {
  jobId: string;
  correctedAmount?: number;
  reason: string;
  refundChannel: string; // "original" | "wallet" | "cash"
  slipImageUrl?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  branchId?: string | null;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const job = await tx.job.findUnique({
      where: { id: data.jobId },
      include: { customer: true, shift: true }
    });

    if (!job) {
      throw new Error("Job not found");
    }

    if (job.refundId) {
      throw new Error("Job has already been refunded");
    }

    // Check actor permission if actorId provided
    if (data.actorId) {
      const actor = await tx.adminUser.findUnique({ where: { id: data.actorId } });
      if (actor) {
        let perms: string[] = [];
        try { perms = JSON.parse(actor.permissions || "[]"); } catch {}
        const canRefund = actor.role === 'admin' || perms.includes('refund-job');
        if (!canRefund) {
          throw new Error("คุณไม่มีสิทธิ์ในการ Refund Job (ต้องมีสิทธิ์ refund-job หรือสิทธิ์ Admin)");
        }
      }
    }

    const originalAmount = Number(job.totalAmount) || 0;
    const refundAmount = originalAmount;

    // 1. Generate Credit Note sequence
    const seqSetting = await tx.setting.findUnique({
      where: { key: CREDIT_NOTE_SEQ_KEY }
    });
    const currentSeq = parseInt(seqSetting?.value || "0", 10);
    const nextSeq = currentSeq + 1;
    const creditNoteNumber = generateCreditNoteNumber(job.id);

    // 2. Prepare credit note receipt data JSON (Full Cancellation of original job)
    const creditNoteData = JSON.stringify({
      creditNoteNumber,
      jobId: job.id,
      originalBillNo: job.billNo,
      customerName: job.customerName,
      customerPhone: job.customerPhone,
      originalAmount,
      correctedAmount: 0,
      refundAmount,
      additionalAmount: 0,
      adjustmentType: "FULL_CANCELLATION_REISSUE",
      refundChannel: data.refundChannel,
      originalChannel: job.paymentChannel,
      reason: data.reason,
      slipImageUrl: data.slipImageUrl,
      issuedBy: data.actorName || "Staff",
      createdAt: new Date().toISOString(),
    });

    // Parse existing payments to determine refund breakdown per channel
    let existingPayments: any[] = [];
    if (job.adminNotesJson) {
      try {
        const parsed = JSON.parse(job.adminNotesJson);
        if (Array.isArray(parsed?.payments)) {
          existingPayments = parsed.payments;
        }
      } catch {}
    }

    if (existingPayments.length === 0 && (job.isPaid || job.isShopPaid) && originalAmount > 0) {
      existingPayments = [{
        amount: originalAmount,
        channel: job.paymentChannel || "Cash / COD",
        method: (job.paymentChannel || "").toLowerCase().includes("deduct") || (job.paymentChannel || "").toLowerCase().includes("wallet") ? "credit" : ((job.paymentChannel || "").toLowerCase().includes("transfer") ? "transfer" : "cash"),
        shiftId: job.shiftId || undefined,
      }];
    }

    const isWalletPay = (p: any) => {
      const m = (p.method || "").toLowerCase();
      const ch = (p.channel || "").toLowerCase();
      return m === "credit" || m.includes("wallet") || m.includes("deduct") || ch.includes("deduct") || ch.includes("wallet") || ch.includes("member");
    };

    let walletRefundPortion = 0;
    let cashRefundPortion = 0;

    if (data.refundChannel === "wallet") {
      walletRefundPortion = refundAmount;
    } else if (data.refundChannel === "cash") {
      cashRefundPortion = refundAmount;
    } else {
      // "original" channel: refund according to original channels
      walletRefundPortion = existingPayments.filter(isWalletPay).reduce((s, p) => s + (Number(p.amount) || 0), 0);
      cashRefundPortion = existingPayments.filter(p => !isWalletPay(p) && ((p.channel || "").toLowerCase().includes("cash") || (p.method || "").toLowerCase() === "cash")).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    }

    // Find active shift that actually pays out this cash refund
    let activeShiftForRefund = null;
    const isCashRefund = cashRefundPortion > 0;
    if (isCashRefund) {
      if (data.actorId) {
        activeShiftForRefund = await tx.cashierShift.findFirst({
          where: { userId: data.actorId, status: "open" },
          orderBy: { openedAt: "desc" }
        });
      }
      const targetBranchId = data.branchId || job.branchId;
      if (!activeShiftForRefund && targetBranchId) {
        activeShiftForRefund = await tx.cashierShift.findFirst({
          where: { branchId: targetBranchId, status: "open" },
          orderBy: { openedAt: "desc" }
        });
      }
    }
    const effectiveShiftId = activeShiftForRefund?.id || (job.shift?.status === "open" ? job.shiftId : null);
    const isShiftAffected = Boolean(isCashRefund && effectiveShiftId);

    // 3. Create JobRefund record
    const jobRefund = await tx.jobRefund.create({
      data: {
        jobId: job.id,
        originalAmount,
        correctedAmount: 0,
        refundAmount,
        originalChannel: job.paymentChannel || "Unspecified",
        refundChannel: data.refundChannel,
        reason: data.reason,
        slipImageUrl: data.slipImageUrl || null,
        creditNoteNumber,
        creditNoteData,
        walletAffected: walletRefundPortion > 0 && !!job.customerId,
        shiftAffected: isShiftAffected,
        shiftId: effectiveShiftId,
        createdById: data.actorId || null,
        createdByName: data.actorName || "Staff",
        branchId: data.branchId || job.branchId || null,
      }
    });

    // 4. Update Original Job -> status: 'cancel'
    const refundRemark = `[CANCELLED & REFUNDED ฿${originalAmount.toLocaleString()} via ${creditNoteNumber}: ${data.reason}]`;
    await tx.job.update({
      where: { id: job.id },
      data: {
        refundId: jobRefund.id,
        remark: job.remark ? `${job.remark} | ${refundRemark}` : refundRemark,
        status: "cancel",
      }
    });

    // 5. Duplicate Job with RF- prefix and unlocked paid status
    const cleanId = job.id.replace(/^RF-/, "");
    let newJobId = `RF-${cleanId}`;
    const existingJobWithId = await tx.job.findUnique({ where: { id: newJobId } });
    if (existingJobWithId) {
      newJobId = `RF-${cleanId}-${Date.now().toString().slice(-4)}`;
    }

    // Keep original billNo exactly as requested (remove any -R suffix)
    const newBillNo = job.billNo ? String(job.billNo).replace(/-R\d+$/i, "").trim() : null;

    // Clean adminNotesJson to keep communication notes but wipe out payments
    let cleanAdminNotesJson: string | null = null;
    if (job.adminNotesJson) {
      try {
        const parsed = JSON.parse(job.adminNotesJson);
        if (typeof parsed === "object" && parsed !== null) {
          cleanAdminNotesJson = JSON.stringify({
            ...parsed,
            payments: []
          });
        }
      } catch {
        cleanAdminNotesJson = null;
      }
    }

    // Clean billImageUrl: keep user photos (bills/bag), but filter out old proforma/receipt generated proofs
    let cleanBillImageUrl: string | null = null;
    if (job.billImageUrl) {
      try {
        const urls: string[] = JSON.parse(job.billImageUrl);
        if (Array.isArray(urls)) {
          const filtered = urls.filter(u => !u.includes("/proofs/proforma-") && !u.includes("/proofs/receipt-"));
          cleanBillImageUrl = filtered.length > 0 ? JSON.stringify(filtered) : null;
        }
      } catch {
        cleanBillImageUrl = null;
      }
    }

    // Clean old remark to strip previous Proforma and Revision tags from cancelled job
    const oldRemarks = (job.remark || "")
      .split(" | ")
      .map(r => r.trim())
      .filter(r => !r.startsWith("Proforma:") && !r.startsWith("Revision:") && !r.startsWith("[REISSUED"));

    const cleanOriginalId = formatJobDisplayId(job.id).replace(/^RF-/i, "");
    const newProformaBase = `PR-${cleanOriginalId}`;
    const newRevision = 1;
    let initialCartHash: string | null = null;
    try {
      const items = job.itemsJson ? JSON.parse(job.itemsJson) : [];
      const vatMatch = job.remark?.match(/VAT:\s*(\w+)\s*\((\d+(?:\.\d+)?)\%\)/i);
      const vatType = vatMatch ? vatMatch[1].toLowerCase() : "none";
      const vatRate = vatMatch ? parseFloat(vatMatch[2]) : 0;
      const speedMatch = job.remark?.match(/Express\s*(\d+)%/i);
      const speed = speedMatch ? `express_${speedMatch[1]}` : "standard";
      const hasDiscountOn = job.remark ? job.remark.includes("Discount: on") : false;
      const discountPercent = hasDiscountOn ? (job.discountPercent || 0) : 0;

      initialCartHash = computeCartHash({
        items,
        serviceSpeed: speed,
        fee: job.fee || 0,
        discountPercent,
        vatType,
        vatRate,
        customerName: job.customerName,
        customerPhone: job.customerPhone,
        deliveryAt: job.deliveryScheduledAt,
      });
    } catch {}

    const reissuedRemark = [
      `[REISSUED from #${job.id} (CN: ${creditNoteNumber})]`,
      `Proforma: ${newProformaBase}-R${newRevision}`,
      `Revision: ${newRevision}`,
      ...oldRemarks
    ].filter(Boolean).join(" | ").trim();

    const duplicatedJob = await tx.job.create({
      data: {
        id: newJobId,
        type: job.type,
        customerId: job.customerId,
        customerName: job.customerName,
        customerPhone: job.customerPhone,
        pickupLocation: job.pickupLocation,
        dropoffLocation: job.dropoffLocation,
        pickupLat: job.pickupLat,
        pickupLng: job.pickupLng,
        dropoffLat: job.dropoffLat,
        dropoffLng: job.dropoffLng,
        distance: job.distance,
        fee: job.fee,
        status: "completed",
        scheduledAt: job.scheduledAt || new Date(),
        completedAt: job.completedAt || new Date(),
        source: job.source || "pos",
        totalAmount: originalAmount,
        paymentMethod: job.paymentMethod,
        paymentChannel: job.paymentChannel,
        isPaid: Boolean(job.isPaid),
        isShopPaid: false,
        shopPaidAt: null,
        csoPaidAt: job.csoPaidAt,
        discount: job.discount || 0,
        discountPercent: job.discountPercent || 0,
        pickupDistance: job.pickupDistance,
        deliveryDistance: job.deliveryDistance,
        pickupCommission: job.pickupCommission,
        deliveryCommission: job.deliveryCommission,
        pickupScheduledAt: job.pickupScheduledAt,
        pickupScheduledEndAt: job.pickupScheduledEndAt,
        deliveryScheduledAt: job.deliveryScheduledAt,
        deliveryScheduledEndAt: job.deliveryScheduledEndAt,
        pickupRiderId: job.pickupRiderId,
        deliveryRiderId: job.deliveryRiderId,
        itemsJson: job.itemsJson,
        legsJson: job.legsJson,
        remark: reissuedRemark,
        billNo: newBillNo,
        adminNotesJson: cleanAdminNotesJson,
        branchId: job.branchId,
        subStatus: null,
        laundryTypes: job.laundryTypes,
        createdBy: data.actorName || job.createdBy,
        cashPlaced: Boolean(job.cashPlaced),
        isStuck: false,
        shiftId: null,
        walletBalanceAfter: null,
        proformaNumber: newProformaBase,
        proformaRevision: newRevision,
        proformaCartHash: initialCartHash,
        refundId: null,
        refundedFromId: job.id,
        bagImageUrl: job.bagImageUrl,
        billImageUrl: cleanBillImageUrl,
        serviceType: job.serviceType,
        proofImageUrl: job.proofImageUrl,
        pickupProofImageUrl: job.pickupProofImageUrl,
        deliveryProofImageUrl: job.deliveryProofImageUrl,
        riderId: job.riderId,
      }
    });

    await tx.jobRefund.update({
      where: { id: jobRefund.id },
      data: { correctedJobId: duplicatedJob.id }
    });

    // 6. Handle Wallet refund if walletRefundPortion > 0
    if (walletRefundPortion > 0 && job.customerId) {
      const currentCust = await tx.customer.findUnique({ where: { id: job.customerId } });
      if (currentCust) {
        const balBefore = currentCust.creditBalance || 0;
        const balAfter = Math.round((balBefore + walletRefundPortion) * 100) / 100;

        await tx.customer.update({
          where: { id: job.customerId },
          data: { creditBalance: balAfter }
        });

        // Create WalletTransaction record
        const walletTx = await tx.walletTransaction.create({
          data: {
            customerId: job.customerId,
            customerName: currentCust.name,
            type: "REFUND",
            amount: walletRefundPortion,
            direction: "CREDIT",
            balanceBefore: balBefore,
            balanceAfter: balAfter,
            referenceId: creditNoteNumber,
            referenceType: "refund",
            reason: `Full Refund from Job #${job.id} (CN: ${creditNoteNumber}): ${data.reason}`,
            createdById: data.actorId || null,
            createdByName: data.actorName || "Staff",
            branchId: data.branchId || job.branchId || null,
            approvalStatus: "APPROVED",
          }
        });

        await tx.jobRefund.update({
          where: { id: jobRefund.id },
          data: { walletTxId: walletTx.id }
        });
      }
    }

    // 7. Handle CashierShift if cashRefundPortion > 0 and active open shift exists
    if (effectiveShiftId && isShiftAffected && cashRefundPortion > 0) {
      const shift = await tx.cashierShift.findUnique({ where: { id: effectiveShiftId } });
      if (shift && shift.status === "open") {
        await tx.cashierShift.update({
          where: { id: effectiveShiftId },
          data: {
            cashSales: Math.max(0, (shift.cashSales || 0) - cashRefundPortion),
            expectedCash: Math.max(0, (shift.expectedCash || 0) - cashRefundPortion),
          }
        });
      }
    }

    // 8. Log ActivityLog
    await tx.activityLog.create({
      data: {
        entityId: job.id,
        entityType: "job",
        action: "REFUND_AND_REISSUE",
        details: JSON.stringify({
          jobId: job.id,
          creditNoteNumber,
          originalAmount,
          refundAmount,
          refundChannel: data.refundChannel,
          reason: data.reason,
          duplicatedJobId: duplicatedJob.id,
        }),
        userId: data.actorId || null,
        userName: data.actorName || "Staff",
      }
    });

    return {
      success: true,
      jobRefund,
      creditNoteNumber,
      duplicatedJobId: duplicatedJob.id,
      duplicatedJob,
      correctedJob: duplicatedJob,
    };
  });

  // 9. Void promo redemption on upstream marketing server if applicable (fire-and-forget)
  if (result?.jobRefund) {
    try {
      const originalJob = await prisma.job.findUnique({ where: { id: data.jobId } });
      const promoMatch = originalJob?.remark?.match(/Promo:\s*([^\s(|]+)/i);
      if (promoMatch && promoMatch[1]) {
        const pCode = promoMatch[1].trim().toUpperCase();
        try {
          await prisma.customerCoupon.updateMany({
            where: {
              OR: [
                { usedJobId: data.jobId, status: "USED" },
                { code: { equals: pCode, mode: "insensitive" as const }, status: "USED" },
              ],
            },
            data: { status: "ACTIVE", usedAt: null, usedJobId: null },
          });
          console.log(`[CustomerCoupon] Restored coupon to ACTIVE on refund for job ${data.jobId}`);
        } catch (err) {
          console.warn("[CustomerCoupon] Void/restore in job refund failed:", err);
        }

        const promoBase = process.env.TLS_PROMO_API_BASE || "https://thatlaundryshop.com";
        const promoKey = process.env.TLS_PROMO_API_KEY || "tls_pos_live_4cd242ae264a906fd734de04396617407bdb59f74d67bcac";
        fetch(`${promoBase}/api/pos/promo/void`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-tls-pos-key": promoKey },
          body: JSON.stringify({ code: pCode, receiptNo: data.jobId }),
        }).catch((e) => console.warn("[PromoCode] Void failed (non-blocking):", e));
      }
    } catch {}
  }

  return result;
}

export async function getJobRefundsAction(filters?: {
  jobId?: string;
  startDate?: string;
  endDate?: string;
  branchId?: string;
}) {
  const where: any = {};
  if (filters?.jobId) where.jobId = filters.jobId;
  if (filters?.branchId && filters.branchId !== 'all') where.branchId = filters.branchId;

  if (filters?.startDate || filters?.endDate) {
    where.createdAt = {};
    if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
    if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
  }

  return await prisma.jobRefund.findMany({
    where,
    orderBy: { createdAt: 'desc' }
  });
}

export async function unlockPaidJobAction(data: {
  jobId: string;
  reason: string;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
}): Promise<{
  success: boolean;
  error?: string;
  updatedJob?: any;
  walletRefundAmount?: number;
  clearedPayments?: any[];
}> {
  try {
    return await prisma.$transaction(async (tx) => {
      // ──── 1. Fetch & Validate ────
      const job = await tx.job.findUnique({ where: { id: data.jobId } });
      if (!job) throw new Error("Job not found");
      if (!job.isPaid && !job.isShopPaid) throw new Error("Job is not currently paid");

      // Check permission: Admin, Superadmin, and Accounting have unlimited unlock access.
      // CSO can only unlock jobs whose payment was recorded today or yesterday.
      let actorRole = (data.actorRole || "").toLowerCase();
      let hasFullAccess = actorRole === "admin" || actorRole === "superadmin" || actorRole === "accounting";
      if (!hasFullAccess && data.actorId) {
        const userRec = await tx.adminUser.findUnique({ where: { id: data.actorId }, select: { role: true, permissions: true } });
        if (userRec) {
          const role = (userRec.role || "").toLowerCase();
          const perms = userRec.permissions || "";
          if (role === "admin" || role === "superadmin" || role === "accounting" || perms.includes("accounting")) {
            hasFullAccess = true;
          }
        }
      }
      if (!hasFullAccess) {
        const paymentDate = getJobPaymentDate(job);
        if (!isPaidTodayOrYesterday(paymentDate)) {
          throw new Error("CSO สามารถปลดล็อคการชำระเงินได้เฉพาะงานที่บันทึกชำระวันนี้และเมื่อวานเท่านั้น");
        }
      }

      // ──── 2. Parse Existing Payments from adminNotesJson ────
      let existingNotes: any = {};
      let existingPayments: any[] = [];
      if (job.adminNotesJson) {
        try {
          const parsed = JSON.parse(job.adminNotesJson);
          existingNotes = parsed || {};
          existingPayments = Array.isArray(parsed.payments) ? parsed.payments : [];
        } catch {}
      }

      // Legacy fallback: if payments array is empty but job was marked paid
      if (existingPayments.length === 0 && (job.isPaid || job.isShopPaid) && (job.totalAmount || 0) > 0) {
        const legacyMethod = (job.paymentChannel || job.paymentMethod || "cash").toLowerCase();
        existingPayments = [{
          amount: job.totalAmount || 0,
          method: legacyMethod.includes("credit") || legacyMethod.includes("wallet") ? "credit" : (legacyMethod.includes("transfer") ? "transfer" : (legacyMethod.includes("card") ? "card" : "cash")),
          shiftId: job.shiftId || undefined,
          timestamp: job.updatedAt?.toISOString() || new Date().toISOString(),
          paidBy: "Legacy Record"
        }];
      }

      // ──── 3. Wallet Refund (สำหรับยอดที่ชำระด้วย Member Wallet / Credit) ────
      const isWalletPay = (p: any) => {
        const m = (p.method || "").toLowerCase();
        const ch = (p.channel || "").toLowerCase();
        return m === "credit" || m.includes("wallet") || m.includes("deduct") || ch.includes("deduct") || ch.includes("wallet") || ch.includes("member");
      };

      const walletRefundAmount = existingPayments
        .filter(isWalletPay)
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      if (walletRefundAmount > 0 && job.customerId) {
        const customer = await tx.customer.findUnique({ where: { id: job.customerId } });
        if (customer) {
          const balBefore = customer.creditBalance || 0;
          const balAfter = Math.round((balBefore + walletRefundAmount) * 100) / 100;

          await tx.customer.update({
            where: { id: job.customerId },
            data: { creditBalance: balAfter },
          });

          await tx.walletTransaction.create({
            data: {
              customerId: job.customerId,
              customerName: customer.name,
              type: "REFUND",
              amount: walletRefundAmount,
              direction: "CREDIT",
              balanceBefore: balBefore,
              balanceAfter: balAfter,
              reason: `Unlock Paid: ${data.reason}`,
              referenceId: job.id,
              referenceType: "job",
              createdById: data.actorId || null,
              createdByName: data.actorName || "CSO",
              approvalStatus: "APPROVED",
            },
          });
        }
      }

      // ──── 4. Cashier Shift Adjustment (สำหรับกะที่ยังเปิดอยู่) ────
      for (const pay of existingPayments) {
        const effectiveShiftId = pay.shiftId || job.shiftId;
        if (!effectiveShiftId) continue;

        const shift = await tx.cashierShift.findUnique({ where: { id: effectiveShiftId } });
        if (shift && shift.status === "open") {
          const m = (pay.method || "").toLowerCase();
          const ch = (pay.channel || "").toLowerCase();
          const amount = Number(pay.amount) || 0;
          const shiftUpdates: any = {};

          if (m === "cash" || ch.includes("cash") || ch.includes("cod")) {
            shiftUpdates.cashSales = Math.max(0, (shift.cashSales || 0) - amount);
            shiftUpdates.expectedCash = Math.max(0, (shift.expectedCash || 0) - amount);
          } else if (m === "transfer" || ch.includes("transfer") || ch.includes("qr") || ch.includes("promptpay")) {
            shiftUpdates.transferSales = Math.max(0, (shift.transferSales || 0) - amount);
          } else if (m === "card" || ch.includes("card") || ch.includes("debit")) {
            shiftUpdates.cardSales = Math.max(0, (shift.cardSales || 0) - amount);
          } else if (isWalletPay(pay)) {
            shiftUpdates.creditSales = Math.max(0, (shift.creditSales || 0) - amount);
          }

          if (Object.keys(shiftUpdates).length > 0) {
            await tx.cashierShift.update({
              where: { id: effectiveShiftId },
              data: shiftUpdates,
            });
          }
        }
      }

      // ──── 5. Append Unlock Log into adminNotesJson.notes ────
      const existingLogs = Array.isArray(existingNotes.notes) ? existingNotes.notes : [];
      const unlockLog = {
        id: crypto.randomUUID(),
        text: `🔓 UNLOCK PAID — ${data.reason}${walletRefundAmount > 0 ? ` | Wallet Refund: ฿${walletRefundAmount.toLocaleString()}` : ""}`,
        timestamp: new Date().toISOString(),
        userId: data.actorId || "system",
        userName: data.actorName || "CSO",
      };

      const updatedNotesJson = JSON.stringify({
        ...existingNotes,
        payments: [], // Clear ALL payments (Option A)
        notes: [...existingLogs, unlockLog],
      });

      // ──── 6. Clean billImageUrl: Remove old receipt proofs ────
      let updatedBillImageUrl: string | null = null;
      if (job.billImageUrl) {
        try {
          const parsed = JSON.parse(job.billImageUrl);
          if (Array.isArray(parsed)) {
            const filtered = parsed.filter((u: string) => 
              typeof u === "string" && 
              !u.includes(`/receipt-${job.id}`) && 
              !u.includes(`receipt-${job.id}.png`) && 
              !u.includes("/proofs/receipt-")
            );
            updatedBillImageUrl = filtered.length > 0 ? JSON.stringify(filtered) : null;
          } else if (typeof parsed === "string") {
            const isReceipt = parsed.includes(`/receipt-${job.id}`) || parsed.includes(`receipt-${job.id}.png`) || parsed.includes("/proofs/receipt-");
            updatedBillImageUrl = isReceipt ? null : JSON.stringify([parsed]);
          }
        } catch {
          if (typeof job.billImageUrl === "string" && (job.billImageUrl.includes(`/receipt-${job.id}`) || job.billImageUrl.includes("/proofs/receipt-"))) {
            updatedBillImageUrl = null;
          } else {
            updatedBillImageUrl = job.billImageUrl;
          }
        }
      }

      // ──── 7. Update Job: Reset Paid Flags & billImageUrl ────
      const updatedJob = await tx.job.update({
        where: { id: data.jobId },
        data: {
          isPaid: false,
          isShopPaid: false,
          shopPaidAt: null,
          csoPaidAt: null,
          adminNotesJson: updatedNotesJson,
          billImageUrl: updatedBillImageUrl,
        },
      });

      // ──── 7. ActivityLog for Audit Trail ────
      await tx.activityLog.create({
        data: {
          entityId: data.jobId,
          entityType: "job",
          action: "UNLOCK_PAID",
          details: JSON.stringify({
            reason: data.reason,
            clearedPayments: existingPayments,
            walletRefundAmount,
            timestamp: new Date().toISOString(),
          }),
          userId: data.actorId || null,
          userName: data.actorName || null,
        },
      });

      return {
        success: true,
        updatedJob,
        walletRefundAmount,
        clearedPayments: existingPayments,
      };
    });
  } catch (err: any) {
    console.error("[unlockPaidJobAction] Error:", err);
    return {
      success: false,
      error: err?.message || "Failed to unlock paid job",
    };
  }
}

// ==========================================
// MULTI-PAYMENT / SPLIT PAYMENT ACTIONS
// ==========================================

export async function recordJobPaymentAction(data: {
  jobId: string;
  amount: number;
  channel: string;
  method?: string;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  shiftId?: string | null;
  slipUrl?: string | null;
  note?: string | null;
}): Promise<{
  success: boolean;
  error?: string;
  updatedJob?: any;
  paymentEntry?: any;
  newBalance?: number;
}> {
  try {
    return await prisma.$transaction(async (tx) => {
      const job = await tx.job.findUnique({ where: { id: data.jobId } });
      if (!job) throw new Error("Job not found");

      const amount = Math.round(Number(data.amount) * 100) / 100;
      if (isNaN(amount) || amount <= 0) throw new Error("จำนวนเงินต้องมากกว่า 0");

      const totalAmount = Number(job.totalAmount) || 0;

      // Parse existing payments
      let existingNotes: any = {};
      let existingPayments: any[] = [];
      if (job.adminNotesJson) {
        try {
          const parsed = JSON.parse(job.adminNotesJson);
          existingNotes = parsed || {};
          existingPayments = Array.isArray(parsed.payments) ? parsed.payments : [];
        } catch {}
      }

      const currentPaid = existingPayments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
      const remaining = Math.max(0, Math.round((totalAmount - currentPaid) * 100) / 100);

      // Check if amount exceeds remaining (allow 0.01 margin for float rounding)
      if (totalAmount > 0 && amount > remaining + 0.01) {
        throw new Error(`ยอดเงินที่ระบุ (฿${amount}) เกินยอดคงเหลือที่ค้างชำระ (฿${remaining})`);
      }

      const rawChannelLower = (data.channel || "").toLowerCase();
      const method = data.method || (
        rawChannelLower.includes("member") || rawChannelLower.includes("wallet") ? "credit" :
        rawChannelLower.includes("transfer") ? "transfer" :
        rawChannelLower.includes("card") ? "card" : "cash"
      );

      let newBalance: number | undefined = undefined;

      // If method is credit / Deduct Member
      if (method === "credit") {
        if (!job.customerId) throw new Error("ไม่พบข้อมูลลูกค้าสำหรับหักกระเป๋าเงินสมาชิก");
        const customer = await tx.customer.findUnique({ where: { id: job.customerId } });
        if (!customer) throw new Error("ไม่พบข้อมูลลูกค้าในระบบ");
        if (!customer.isMember) throw new Error("ลูกค้ารายนี้ไม่ได้เป็นสมาชิก (Member)");

        // Check expiry
        if (customer.memberExpiryDate && new Date(customer.memberExpiryDate).getTime() < Date.now()) {
          throw new Error("กระเป๋าเงินสมาชิกหมดอายุแล้ว กรุณาเติมเงินต่ออายุก่อนใช้งาน");
        }

        const currentBal = customer.creditBalance || 0;
        if (currentBal < amount) {
          throw new Error(`ยอดเงินในกระเป๋า Wallet ไม่เพียงพอ (มี ฿${currentBal.toLocaleString()}, ต้องการหัก ฿${amount.toLocaleString()})`);
        }

        const balBefore = currentBal;
        const balAfter = Math.round((balBefore - amount) * 100) / 100;

        await tx.customer.update({
          where: { id: job.customerId },
          data: { creditBalance: balAfter }
        });

        await tx.walletTransaction.create({
          data: {
            customerId: job.customerId,
            customerName: customer.name,
            type: "DEDUCT",
            amount: amount,
            direction: "DEBIT",
            balanceBefore: balBefore,
            balanceAfter: balAfter,
            reason: `ชำระค่างาน #${job.id}${data.note ? ` (${data.note})` : ""}`,
            referenceId: job.id,
            referenceType: "job",
            paymentChannel: data.channel,
            createdById: data.actorId || null,
            createdByName: data.actorName || "Staff",
            approvalStatus: "APPROVED",
          }
        });

        newBalance = balAfter;
      }

      // Handle CashierShift if cash & shiftId provided
      const effectiveShiftId = data.shiftId || job.shiftId;
      if (effectiveShiftId && method === "cash") {
        const shift = await tx.cashierShift.findUnique({ where: { id: effectiveShiftId } });
        if (shift && shift.status === "open") {
          await tx.cashierShift.update({
            where: { id: effectiveShiftId },
            data: {
              cashSales: (shift.cashSales || 0) + amount,
              expectedCash: (shift.expectedCash || 0) + amount,
            }
          });
        }
      }

      // Construct payment entry
      const paymentEntry = {
        id: crypto.randomUUID(),
        amount,
        channel: data.channel,
        method,
        timestamp: new Date().toISOString(),
        shiftId: effectiveShiftId || null,
        paidBy: data.actorName || "Staff",
        slipUrl: data.slipUrl || null,
        note: data.note || null,
      };

      const updatedPayments = [...existingPayments, paymentEntry];
      const newTotalPaid = updatedPayments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
      const isFullyPaid = (totalAmount > 0 && newTotalPaid >= totalAmount - 0.01);

      // Determine paymentChannel string
      const distinctChannels = Array.from(new Set(updatedPayments.map(p => p.channel).filter(Boolean)));
      let finalChannel = job.paymentChannel;
      if (distinctChannels.length === 1) {
        finalChannel = distinctChannels[0];
      } else if (distinctChannels.length > 1) {
        finalChannel = "Split Payment";
      }

      // Log note
      const existingLogs = Array.isArray(existingNotes.notes) ? existingNotes.notes : [];
      const paymentLog = {
        id: crypto.randomUUID(),
        text: `💰 RECORD PAYMENT: ฿${amount.toLocaleString()} via ${data.channel}${isFullyPaid ? " (ชำระครบถ้วนแล้ว)" : ` (ค้างอีก ฿${Math.max(0, totalAmount - newTotalPaid).toLocaleString()})`}`,
        timestamp: new Date().toISOString(),
        userId: data.actorId || "system",
        userName: data.actorName || "Staff",
      };

      const updatedAdminNotesJson = JSON.stringify({
        ...existingNotes,
        payments: updatedPayments,
        notes: [...existingLogs, paymentLog],
      });

      const updatedJob = await tx.job.update({
        where: { id: data.jobId },
        data: {
          isPaid: isFullyPaid ? true : job.isPaid,
          isShopPaid: isFullyPaid ? true : job.isShopPaid,
          csoPaidAt: isFullyPaid ? (job.csoPaidAt || new Date()) : job.csoPaidAt,
          shopPaidAt: isFullyPaid ? (job.shopPaidAt || new Date()) : job.shopPaidAt,
          paymentChannel: finalChannel,
          walletBalanceAfter: newBalance !== undefined ? newBalance : job.walletBalanceAfter,
          adminNotesJson: updatedAdminNotesJson,
        }
      });

      // ActivityLog
      await tx.activityLog.create({
        data: {
          entityId: data.jobId,
          entityType: "job",
          action: "RECORD_PAYMENT",
          details: JSON.stringify({
            paymentEntry,
            newTotalPaid,
            remaining: Math.max(0, totalAmount - newTotalPaid),
            isFullyPaid,
          }),
          userId: data.actorId || null,
          userName: data.actorName || null,
        }
      });

      return {
        success: true,
        updatedJob,
        paymentEntry,
        newBalance,
      };
    });
  } catch (err: any) {
    console.error("[recordJobPaymentAction] Error:", err);
    return {
      success: false,
      error: err?.message || "Failed to record payment",
    };
  }
}

export async function voidJobPaymentAction(data: {
  jobId: string;
  paymentId: string;
  reason: string;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
}): Promise<{
  success: boolean;
  error?: string;
  updatedJob?: any;
  refundedAmount?: number;
  newBalance?: number;
}> {
  try {
    return await prisma.$transaction(async (tx) => {
      const job = await tx.job.findUnique({ where: { id: data.jobId } });
      if (!job) throw new Error("Job not found");

      if (!data.reason || !data.reason.trim()) {
        throw new Error("กรุณาระบุเหตุผลในการยกเลิกรายการชำระเงิน");
      }

      // Permission check: admin, superadmin, accounting, or CSO
      let actorRole = (data.actorRole || "").toLowerCase();
      let hasFullAccess = actorRole === "admin" || actorRole === "superadmin" || actorRole === "accounting";
      if (!hasFullAccess && data.actorId) {
        const userRec = await tx.adminUser.findUnique({ where: { id: data.actorId }, select: { role: true, permissions: true } });
        if (userRec) {
          const role = (userRec.role || "").toLowerCase();
          const perms = userRec.permissions || "";
          if (role === "admin" || role === "superadmin" || role === "accounting" || perms.includes("accounting")) {
            hasFullAccess = true;
          }
        }
      }

      // Parse existing payments
      let existingNotes: any = {};
      let existingPayments: any[] = [];
      if (job.adminNotesJson) {
        try {
          const parsed = JSON.parse(job.adminNotesJson);
          existingNotes = parsed || {};
          existingPayments = Array.isArray(parsed.payments) ? parsed.payments : [];
        } catch {}
      }

      const targetPaymentIndex = existingPayments.findIndex((p: any) => p.id === data.paymentId);
      if (targetPaymentIndex === -1) {
        throw new Error("ไม่พบรายการชำระเงินที่ต้องการยกเลิก");
      }

      const targetPayment = existingPayments[targetPaymentIndex];
      const targetAmount = Number(targetPayment.amount) || 0;
      const targetMethod = (targetPayment.method || "").toLowerCase();
      const targetChannel = targetPayment.channel || targetMethod;

      // CSO time limit check: only today or yesterday
      if (!hasFullAccess) {
        const payDate = targetPayment.timestamp ? new Date(targetPayment.timestamp) : null;
        if (!isPaidTodayOrYesterday(payDate)) {
          throw new Error("CSO สามารถยกเลิกรายการชำระเงินได้เฉพาะรายการของวันนี้และเมื่อวานเท่านั้น");
        }
      }

      let refundedAmount = 0;
      let newBalance: number | undefined = undefined;

      // 1. If method was credit (Member Wallet), refund back to wallet
      if (targetMethod === "credit" && job.customerId) {
        const customer = await tx.customer.findUnique({ where: { id: job.customerId } });
        if (customer) {
          const balBefore = customer.creditBalance || 0;
          const balAfter = Math.round((balBefore + targetAmount) * 100) / 100;

          await tx.customer.update({
            where: { id: job.customerId },
            data: { creditBalance: balAfter },
          });

          await tx.walletTransaction.create({
            data: {
              customerId: job.customerId,
              customerName: customer.name,
              type: "REFUND",
              amount: targetAmount,
              direction: "CREDIT",
              balanceBefore: balBefore,
              balanceAfter: balAfter,
              reason: `ยกเลิกการชำระเงิน: ${data.reason.trim()}`,
              referenceId: job.id,
              referenceType: "job",
              createdById: data.actorId || null,
              createdByName: data.actorName || "CSO",
              approvalStatus: "APPROVED",
            }
          });

          refundedAmount = targetAmount;
          newBalance = balAfter;
        }
      }

      // 2. If cash and open shift, adjust shift
      const effectiveShiftId = targetPayment.shiftId || job.shiftId;
      if (effectiveShiftId && targetMethod === "cash") {
        const shift = await tx.cashierShift.findUnique({ where: { id: effectiveShiftId } });
        if (shift && shift.status === "open") {
          await tx.cashierShift.update({
            where: { id: effectiveShiftId },
            data: {
              cashSales: Math.max(0, (shift.cashSales || 0) - targetAmount),
              expectedCash: Math.max(0, (shift.expectedCash || 0) - targetAmount),
            }
          });
        }
      }

      // 3. Remove payment from array
      const updatedPayments = existingPayments.filter((_: any, idx: number) => idx !== targetPaymentIndex);
      const newTotalPaid = updatedPayments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
      const totalAmount = Number(job.totalAmount) || 0;
      const isStillFullyPaid = (totalAmount > 0 && newTotalPaid >= totalAmount - 0.01);

      // Recompute channel
      const distinctChannels = Array.from(new Set(updatedPayments.map(p => p.channel).filter(Boolean)));
      let finalChannel: string | null = null;
      if (distinctChannels.length === 1) {
        finalChannel = distinctChannels[0];
      } else if (distinctChannels.length > 1) {
        finalChannel = "Split Payment";
      }

      // Append log
      const existingLogs = Array.isArray(existingNotes.notes) ? existingNotes.notes : [];
      const voidLog = {
        id: crypto.randomUUID(),
        text: `❌ VOID PAYMENT: ฿${targetAmount.toLocaleString()} (${targetChannel}) — Reason: ${data.reason.trim()}${refundedAmount > 0 ? ` | คืนเข้า Wallet: ฿${refundedAmount.toLocaleString()}` : ""}`,
        timestamp: new Date().toISOString(),
        userId: data.actorId || "system",
        userName: data.actorName || "Staff",
      };

      const updatedAdminNotesJson = JSON.stringify({
        ...existingNotes,
        payments: updatedPayments,
        notes: [...existingLogs, voidLog],
      });

      const updatedJob = await tx.job.update({
        where: { id: data.jobId },
        data: {
          isPaid: isStillFullyPaid,
          isShopPaid: isStillFullyPaid,
          csoPaidAt: isStillFullyPaid ? job.csoPaidAt : null,
          shopPaidAt: isStillFullyPaid ? job.shopPaidAt : null,
          paymentChannel: finalChannel,
          walletBalanceAfter: newBalance !== undefined ? newBalance : job.walletBalanceAfter,
          adminNotesJson: updatedAdminNotesJson,
        }
      });

      // ActivityLog
      await tx.activityLog.create({
        data: {
          entityId: data.jobId,
          entityType: "job",
          action: "VOID_PAYMENT",
          details: JSON.stringify({
            voidedPayment: targetPayment,
            reason: data.reason.trim(),
            refundedAmount,
            newTotalPaid,
          }),
          userId: data.actorId || null,
          userName: data.actorName || null,
        }
      });

      return {
        success: true,
        updatedJob,
        refundedAmount,
        newBalance,
      };
    });
  } catch (err: any) {
    console.error("[voidJobPaymentAction] Error:", err);
    return {
      success: false,
      error: err?.message || "Failed to void payment",
    };
  }
}

// ==========================================
// CUSTOMER COUPONS ACTIONS
// ==========================================

export async function createCustomerCouponAction(data: {
  customerId: string;
  code: string;
  name: string;
  description?: string;
  discountType: 'FIXED' | 'PERCENTAGE' | 'FREE_DELIVERY' | 'CASH_VOUCHER';
  discountValue: number;
  minOrderAmount?: number | null;
  maxDiscount?: number | null;
  expiryDate?: Date | string | null;
  issuedReason?: string;
  issuedById?: string;
  issuedByName?: string;
  brand?: string;
}) {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
      select: { id: true, name: true, phone: true, brand: true },
    });
    if (!customer) throw new Error("ไม่พบข้อมูลลูกค้า");

    const cleanCode = (data.code || "").trim().toUpperCase();
    if (!cleanCode) throw new Error("กรุณาระบุรหัสคูปอง (Coupon Code)");

    const coupon = await prisma.customerCoupon.create({
      data: {
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        code: cleanCode,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        discountType: data.discountType || "FIXED",
        discountValue: Number(data.discountValue) || 0,
        minOrderAmount: data.minOrderAmount != null ? Number(data.minOrderAmount) : null,
        maxDiscount: data.maxDiscount != null ? Number(data.maxDiscount) : null,
        status: "ACTIVE",
        issuedAt: new Date(),
        expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
        issuedById: data.issuedById || null,
        issuedByName: data.issuedByName || null,
        issuedReason: data.issuedReason?.trim() || null,
        brand: data.brand || customer.brand || "that_laundry_shop",
      },
    });

    await prisma.activityLog.create({
      data: {
        entityId: customer.id,
        entityType: "customer",
        action: "ISSUE_COUPON",
        details: JSON.stringify({
          couponId: coupon.id,
          code: coupon.code,
          name: coupon.name,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          expiryDate: coupon.expiryDate,
          reason: coupon.issuedReason,
        }),
        userId: data.issuedById || null,
        userName: data.issuedByName || null,
      },
    });

    return { success: true, coupon };
  } catch (err: any) {
    console.error("[createCustomerCouponAction] Error:", err);
    return { success: false, error: err?.message || "Failed to issue coupon" };
  }
}

export async function getCustomerCouponsAction(filters?: {
  customerId?: string;
  status?: string;
  brand?: string;
  search?: string;
}) {
  try {
    const where: any = {};
    if (filters?.customerId) {
      where.customerId = filters.customerId;
    }
    if (filters?.status && filters.status !== "all") {
      where.status = filters.status;
    }
    if (filters?.brand && filters.brand !== "all") {
      where.brand = filters.brand;
    }
    if (filters?.search && filters.search.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { customerName: { contains: q, mode: "insensitive" } },
        { customerPhone: { contains: q, mode: "insensitive" } },
        { issuedReason: { contains: q, mode: "insensitive" } },
      ];
    }

    const coupons = await prisma.customerCoupon.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    // Lazy auto-expire check
    const now = new Date();
    const updatedCoupons = await Promise.all(
      coupons.map(async (c) => {
        if (c.status === "ACTIVE" && c.expiryDate && new Date(c.expiryDate) < now) {
          try {
            return await prisma.customerCoupon.update({
              where: { id: c.id },
              data: { status: "EXPIRED" },
            });
          } catch {
            return { ...c, status: "EXPIRED" };
          }
        }
        return c;
      })
    );

    return { success: true, coupons: updatedCoupons };
  } catch (err: any) {
    console.error("[getCustomerCouponsAction] Error:", err);
    return { success: false, coupons: [], error: err?.message || "Failed to load coupons" };
  }
}

export async function updateCustomerCouponStatusAction(
  id: string,
  status: "ACTIVE" | "USED" | "EXPIRED" | "VOID",
  details?: { usedJobId?: string; actorId?: string; actorName?: string; reason?: string }
) {
  try {
    const data: any = { status };
    if (status === "USED") {
      data.usedAt = new Date();
      if (details?.usedJobId) data.usedJobId = details.usedJobId;
    } else if (status === "ACTIVE") {
      data.usedAt = null;
      data.usedJobId = null;
    }

    const updated = await prisma.customerCoupon.update({
      where: { id },
      data,
    });

    await prisma.activityLog.create({
      data: {
        entityId: updated.customerId,
        entityType: "customer",
        action: `COUPON_${status}`,
        details: JSON.stringify({
          couponId: updated.id,
          code: updated.code,
          status,
          usedJobId: details?.usedJobId,
          reason: details?.reason,
        }),
        userId: details?.actorId || null,
        userName: details?.actorName || null,
      },
    });

    return { success: true, coupon: updated };
  } catch (err: any) {
    console.error("[updateCustomerCouponStatusAction] Error:", err);
    return { success: false, error: err?.message || "Failed to update coupon status" };
  }
}

export async function deleteCustomerCouponAction(id: string, actor?: { id?: string; name?: string }) {
  try {
    const coupon = await prisma.customerCoupon.findUnique({ where: { id } });
    if (!coupon) throw new Error("ไม่พบคูปอง");

    await prisma.customerCoupon.delete({ where: { id } });

    await prisma.activityLog.create({
      data: {
        entityId: coupon.customerId,
        entityType: "customer",
        action: "DELETE_COUPON",
        details: JSON.stringify({
          couponId: coupon.id,
          code: coupon.code,
          name: coupon.name,
        }),
        userId: actor?.id || null,
        userName: actor?.name || null,
      },
    });

    return { success: true };
  } catch (err: any) {
    console.error("[deleteCustomerCouponAction] Error:", err);
    return { success: false, error: err?.message || "Failed to delete coupon" };
  }
}

// ---------------------------------------------------------------------------
// COUPON TEMPLATES (SETTING KEY: "coupon_templates")
// ---------------------------------------------------------------------------
const DEFAULT_COUPON_TEMPLATES: CouponTemplate[] = [
  {
    id: "tpl-welcome-100",
    label: "🎁 Welcome Member (ลด ฿100)",
    codePrefix: "WELCOME100",
    name: "คูปองต้อนรับสมาชิกใหม่ ลด ฿100",
    description: "ต้อนรับสมาชิกใหม่ ลด ฿100 เมื่อสั่งซื้อขั้นต่ำ ฿300",
    discountType: "FIXED",
    discountValue: 100,
    minOrderAmount: 300,
    maxDiscount: null,
    days: 30,
    reason: "ต้อนรับสมาชิกใหม่ (Welcome Member)",
    brand: "all",
  },
  {
    id: "tpl-bday-20",
    label: "🎂 Birthday Perk (ลด 20%)",
    codePrefix: "BDAY20",
    name: "คูปองวันเกิดพิเศษ ลด 20%",
    description: "สิทธิพิเศษวันเกิด ลด 20% สูงสุด ฿200",
    discountType: "PERCENTAGE",
    discountValue: 20,
    minOrderAmount: 200,
    maxDiscount: 200,
    days: 30,
    reason: "สิทธิพิเศษเดือนเกิดลูกค้า (Birthday Perk)",
    brand: "all",
  },
  {
    id: "tpl-free-delivery",
    label: "🚚 Free Delivery (ฟรีค่าส่ง)",
    codePrefix: "FREEDELIVERY",
    name: "คูปองฟรีค่าจัดส่ง Delivery",
    description: "ฟรีค่าจัดส่ง Delivery เมื่อสั่งซื้อขั้นต่ำ ฿150",
    discountType: "FREE_DELIVERY",
    discountValue: 0,
    minOrderAmount: 150,
    maxDiscount: null,
    days: 14,
    reason: "โปรโมชั่นฟรีค่าจัดส่ง Delivery",
    brand: "all",
  },
  {
    id: "tpl-service-recovery",
    label: "🛠️ Service Recovery (ลด ฿200)",
    codePrefix: "SRV200",
    name: "คูปองชดเชยบริการ Service Recovery ฿200",
    description: "ชดเชยกรณีบริการล่าช้า หรือเกิดปัญหาการจัดส่ง",
    discountType: "FIXED",
    discountValue: 200,
    minOrderAmount: 0,
    maxDiscount: null,
    days: 60,
    reason: "ชดเชยบริการล่าช้า / ปัญหาการจัดส่ง",
    brand: "all",
  },
  {
    id: "tpl-loyalty-50",
    label: "💖 Special Loyalty (ลด ฿50)",
    codePrefix: "TLS50",
    name: "คูปองส่วนลดพิเศษ ฿50",
    description: "สมนาคุณลูกค้าประจำ ลดทันที ฿50",
    discountType: "FIXED",
    discountValue: 50,
    minOrderAmount: 200,
    maxDiscount: null,
    days: 30,
    reason: "สมนาคุณลูกค้าประจำ",
    brand: "all",
  },
];

export async function getCouponTemplatesAction(): Promise<{ success: boolean; templates: CouponTemplate[]; error?: string }> {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: "coupon_templates" } });
    if (!setting || !setting.value) {
      // Lazy initialize with defaults
      await prisma.setting.upsert({
        where: { key: "coupon_templates" },
        update: { value: JSON.stringify(DEFAULT_COUPON_TEMPLATES) },
        create: { key: "coupon_templates", value: JSON.stringify(DEFAULT_COUPON_TEMPLATES) },
      });
      return { success: true, templates: DEFAULT_COUPON_TEMPLATES };
    }
    const templates: CouponTemplate[] = JSON.parse(setting.value);
    return { success: true, templates: Array.isArray(templates) ? templates : DEFAULT_COUPON_TEMPLATES };
  } catch (err: any) {
    console.error("[getCouponTemplatesAction] Error:", err);
    return { success: false, templates: DEFAULT_COUPON_TEMPLATES, error: err?.message };
  }
}

export async function saveCouponTemplateAction(
  template: Partial<CouponTemplate> & { label: string; name: string; discountType: CouponTemplate["discountType"]; discountValue: number }
): Promise<{ success: boolean; template?: CouponTemplate; templates?: CouponTemplate[]; error?: string }> {
  try {
    const res = await getCouponTemplatesAction();
    let currentTemplates = res.templates || [];

    const now = new Date().toISOString();
    let savedTemplate: CouponTemplate;

    if (template.id && currentTemplates.some(t => t.id === template.id)) {
      // Update
      currentTemplates = currentTemplates.map(t => {
        if (t.id === template.id) {
          savedTemplate = {
            ...t,
            ...template,
            label: template.label.trim(),
            name: template.name.trim(),
            codePrefix: (template.codePrefix || t.codePrefix || "COUPON").trim().toUpperCase(),
            description: template.description !== undefined ? (template.description?.trim() || null) : t.description,
            discountType: template.discountType,
            discountValue: Number(template.discountValue) || 0,
            minOrderAmount: template.minOrderAmount != null ? Number(template.minOrderAmount) : null,
            maxDiscount: template.maxDiscount != null ? Number(template.maxDiscount) : null,
            days: template.days != null ? Number(template.days) : (t.days || 30),
            reason: template.reason !== undefined ? (template.reason?.trim() || null) : t.reason,
            brand: template.brand || t.brand || "all",
            updatedAt: now,
          };
          return savedTemplate;
        }
        return t;
      });
    } else {
      // Create
      savedTemplate = {
        id: template.id || `tpl-${Date.now()}`,
        label: template.label.trim(),
        codePrefix: (template.codePrefix || "COUPON").trim().toUpperCase(),
        name: template.name.trim(),
        description: template.description?.trim() || null,
        discountType: template.discountType,
        discountValue: Number(template.discountValue) || 0,
        minOrderAmount: template.minOrderAmount != null ? Number(template.minOrderAmount) : null,
        maxDiscount: template.maxDiscount != null ? Number(template.maxDiscount) : null,
        days: template.days != null ? Number(template.days) : 30,
        reason: template.reason?.trim() || null,
        brand: template.brand || "all",
        createdAt: now,
        updatedAt: now,
      };
      currentTemplates.push(savedTemplate);
    }

    await prisma.setting.upsert({
      where: { key: "coupon_templates" },
      update: { value: JSON.stringify(currentTemplates) },
      create: { key: "coupon_templates", value: JSON.stringify(currentTemplates) },
    });

    return { success: true, template: savedTemplate!, templates: currentTemplates };
  } catch (err: any) {
    console.error("[saveCouponTemplateAction] Error:", err);
    return { success: false, error: err?.message || "Failed to save template" };
  }
}

export async function deleteCouponTemplateAction(
  id: string
): Promise<{ success: boolean; templates?: CouponTemplate[]; error?: string }> {
  try {
    const res = await getCouponTemplatesAction();
    const currentTemplates = (res.templates || []).filter(t => t.id !== id);

    await prisma.setting.upsert({
      where: { key: "coupon_templates" },
      update: { value: JSON.stringify(currentTemplates) },
      create: { key: "coupon_templates", value: JSON.stringify(currentTemplates) },
    });

    return { success: true, templates: currentTemplates };
  } catch (err: any) {
    console.error("[deleteCouponTemplateAction] Error:", err);
    return { success: false, error: err?.message || "Failed to delete template" };
  }
}

export async function resetCouponTemplatesAction(): Promise<{ success: boolean; templates: CouponTemplate[]; error?: string }> {
  try {
    await prisma.setting.upsert({
      where: { key: "coupon_templates" },
      update: { value: JSON.stringify(DEFAULT_COUPON_TEMPLATES) },
      create: { key: "coupon_templates", value: JSON.stringify(DEFAULT_COUPON_TEMPLATES) },
    });
    return { success: true, templates: DEFAULT_COUPON_TEMPLATES };
  } catch (err: any) {
    console.error("[resetCouponTemplatesAction] Error:", err);
    return { success: false, templates: DEFAULT_COUPON_TEMPLATES, error: err?.message };
  }
}



