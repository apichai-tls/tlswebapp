'use server';

import { prisma } from '@/lib/prisma';
import { listFilesForJob } from '@/lib/gcs';
import { calculateWalletExpiryDate, CREDIT_NOTE_SEQ_KEY, generateCreditNoteNumber, generateProformaBaseNumber, computeCartHash, formatJobDisplayId, isPaidTodayOrYesterday, getJobPaymentDate } from '@/lib/utils';
import { createTask, addTaskNote } from '@/actions/tasks';

// CUSTOMERS
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
    }
  }

  const nameUpper = data.name ? data.name.toUpperCase() : data.name;

  const c = await prisma.customer.create({
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
      memberId,
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
      brand: data.brand || 'that_laundry_shop',
      nickName: data.nickName || null,
      gender: data.gender || 'Rather not say',
      secondaryPhone: data.secondaryPhone || null,
      isSecondaryWhatsapp: Boolean(data.isSecondaryWhatsapp),
      isVerified: Boolean(data.isVerified),
      verifiedVia: data.verifiedVia || null,
      sourceSystem: data.sourceSystem || 'web_booking',
      roomNo: data.roomNo || null,
      memberStartDate: data.memberStartDate ? new Date(data.memberStartDate) : null,
      memberExpiryDate: data.memberExpiryDate ? new Date(data.memberExpiryDate) : null,
    }
  });
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
    data.creditBalance = Math.max(0, Math.round((balBefore + delta) * 100) / 100);
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
        } else {
          data.memberId = null;
        }
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
  if (updates.billImageUrl !== undefined) data.billImageUrl = updates.billImageUrl;
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
  const pData = { ...data, servicePrices: JSON.stringify(data.servicePrices || {}) };
  return prisma.priceList.create({ data: pData });
}

export async function updatePriceListAction(id: string, updates: any) {
  const data: any = { ...updates };
  if (updates.servicePrices) {
    data.servicePrices = JSON.stringify(updates.servicePrices);
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
            AND ("remark" IS NULL OR "remark" NOT LIKE '%Free Delivery%')
            AND ("customerId" IS NULL OR "customerId" NOT IN (SELECT "id" FROM "Customer" WHERE "isVIP" = true))
            AND "status" NOT IN ('billing', 'completed', 'cancel')
        `;
        await prisma.$executeRaw`
          UPDATE "Job"
          SET "deliveryCommission" = FLOOR("deliveryDistance") * ${rate}
          WHERE "deliveryDistance" > 0
            AND ("remark" IS NULL OR "remark" NOT LIKE '%Free Delivery%')
            AND ("customerId" IS NULL OR "customerId" NOT IN (SELECT "id" FROM "Customer" WHERE "isVIP" = true))
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

  return await prisma.walletTransaction.findMany({
    where,
    orderBy: { createdAt: 'desc' }
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
}) {
  const originalTx = await prisma.walletTransaction.findUnique({ where: { id: data.id } });
  if (!originalTx) throw new Error("Transaction not found");
  if (originalTx.approvalStatus !== 'PENDING') throw new Error(`Transaction is already ${originalTx.approvalStatus}`);

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
    ``,
    `---`,
    `**Action Required:**`,
    `รายการนี้ถูก Reject โดยไม่ปรับยอดเงินกลับ กรุณาตรวจสอบและดำเนินการแก้ไข (เช่น ติดต่อลูกค้า, ขอสลิปใหม่, หรือเปลี่ยนช่องทางชำระเงิน) และพูดคุยอัปเดตความคืบหน้าผ่านกล่องข้อความด้านล่างนี้`
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

  // 2. Update original transaction to REJECTED (with linked Task reference)
  const storedRejectReason = createdTaskId
    ? `${data.rejectReason} [Task: ${createdTaskId}]`
    : data.rejectReason;

  const updatedTx = await prisma.walletTransaction.update({
    where: { id: data.id },
    data: {
      approvalStatus: 'REJECTED',
      approvedById: data.approvedById,
      approvedByName: data.approvedByName,
      approvedAt: new Date(),
      rejectReason: storedRejectReason,
    }
  });

  // 3. Write ActivityLog
  try {
    await prisma.activityLog.create({
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
    balanceAfter: originalTx.balanceAfter,
    taskId: createdTaskId,
  };
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

    // Find active shift that actually pays out this cash refund
    let activeShiftForRefund = null;
    const isCashRefund = data.refundChannel === "cash" || (!data.refundChannel && job.paymentChannel === "Cash / COD");
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
        walletAffected: data.refundChannel === "wallet" && !!job.customerId,
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

    // 6. Handle Wallet refund if refundChannel is 'wallet'
    if (data.refundChannel === "wallet" && job.customerId) {
      const currentCust = await tx.customer.findUnique({ where: { id: job.customerId } });
      if (currentCust) {
        const balBefore = currentCust.creditBalance || 0;
        const balAfter = Math.round((balBefore + refundAmount) * 100) / 100;

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
            amount: refundAmount,
            direction: "CREDIT",
            balanceBefore: balBefore,
            balanceAfter: balAfter,
            referenceId: creditNoteNumber,
            referenceType: "refund",
            reason: `Full Refund from Job #${job.id} (CN: ${creditNoteNumber}): ${data.reason}`,
            createdById: data.actorId || null,
            createdByName: data.actorName || "Staff",
            branchId: data.branchId || job.branchId || null,
            approvalStatus: "PENDING",
          }
        });

        await tx.jobRefund.update({
          where: { id: jobRefund.id },
          data: { walletTxId: walletTx.id }
        });
      }
    }

    // 7. Handle CashierShift if refundChannel is 'cash' and active open shift exists
    if (effectiveShiftId && isShiftAffected) {
      const shift = await tx.cashierShift.findUnique({ where: { id: effectiveShiftId } });
      if (shift && shift.status === "open") {
        await tx.cashierShift.update({
          where: { id: effectiveShiftId },
          data: {
            cashSales: Math.max(0, (shift.cashSales || 0) - refundAmount),
            expectedCash: Math.max(0, (shift.expectedCash || 0) - refundAmount),
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
      const walletRefundAmount = existingPayments
        .filter(p => (p.method || "").toLowerCase() === "credit")
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
          const method = (pay.method || "").toLowerCase();
          const amount = Number(pay.amount) || 0;
          const shiftUpdates: any = {};

          if (method === "cash") {
            shiftUpdates.cashSales = Math.max(0, (shift.cashSales || 0) - amount);
            shiftUpdates.expectedCash = Math.max(0, (shift.expectedCash || 0) - amount);
          } else if (method === "transfer") {
            shiftUpdates.transferSales = Math.max(0, (shift.transferSales || 0) - amount);
          } else if (method === "card") {
            shiftUpdates.cardSales = Math.max(0, (shift.cardSales || 0) - amount);
          } else if (method === "credit") {
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

      // ──── 6. Update Job: Reset Paid Flags ────
      const updatedJob = await tx.job.update({
        where: { id: data.jobId },
        data: {
          isPaid: false,
          isShopPaid: false,
          shopPaidAt: null,
          csoPaidAt: null,
          adminNotesJson: updatedNotesJson,
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


