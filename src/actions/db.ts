'use server';

import { prisma } from '@/lib/prisma';
import { listFilesForJob } from '@/lib/gcs';

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
      isWhatsapp: data.isWhatsapp || false,
      email: data.email,
      lineId: data.lineId,
      language: data.language,
      remark: data.remark,
      secondaryAddress: data.secondaryAddress,
      dob: data.dob,
      taxId: data.taxId,
      companyName: data.companyName,
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
  if (updates.creditBalance !== undefined) data.creditBalance = updates.creditBalance;
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
  if (updates.isWhatsapp !== undefined) data.isWhatsapp = updates.isWhatsapp;
  if (updates.email !== undefined) data.email = updates.email;
  if (updates.lineId !== undefined) data.lineId = updates.lineId;
  if (updates.language !== undefined) data.language = updates.language;
  if (updates.remark !== undefined) data.remark = updates.remark;
  if (updates.secondaryAddress !== undefined) data.secondaryAddress = updates.secondaryAddress;
  if (updates.dob !== undefined) data.dob = updates.dob;
  if (updates.taxId !== undefined) data.taxId = updates.taxId;
  if (updates.companyName !== undefined) data.companyName = updates.companyName;
  if (updates.memberStartDate !== undefined) {
    data.memberStartDate = updates.memberStartDate ? new Date(updates.memberStartDate) : null;
  }
  if (updates.memberExpiryDate !== undefined) {
    data.memberExpiryDate = updates.memberExpiryDate ? new Date(updates.memberExpiryDate) : null;
  }

  const updatedCustomer = await prisma.customer.update({ where: { id }, data });

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
      if (changes.creditBalance) {
        const balBefore = Number(currentCustomer.creditBalance || 0);
        const balAfter = Number(data.creditBalance || 0);
        const diff = balAfter - balBefore;
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
      let notes = [];
      if (job.adminNotesJson) {
        try {
          notes = JSON.parse(job.adminNotesJson);
          if (!Array.isArray(notes)) notes = [];
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

      await prisma.job.update({
        where: { id: job.id },
        data: { adminNotesJson: JSON.stringify(notes) }
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

export async function addJobAction(data: any) {
  let jobId = data.id;
  
  if (!jobId || String(jobId).startsWith('JOB-')) {
    const year = new Date().getFullYear().toString(); // 4-digit year, auto-changes each year
    const latestJob = await prisma.job.findFirst({
      where: { id: { startsWith: year } },
      orderBy: { id: 'desc' }
    });
    
    if (latestJob && latestJob.id.length >= 10) {
      const lastNum = parseInt(latestJob.id.substring(4), 10);
      if (!isNaN(lastNum)) {
        jobId = `${year}${(lastNum + 1).toString().padStart(6, '0')}`;
      } else {
        jobId = `${year}000001`;
      }
    } else {
      jobId = `${year}000001`;
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
      distance: data.distance || 0,
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

  if (job.adminNotesJson) {
    try {
      const parsed = JSON.parse(job.adminNotesJson);
      if (parsed && typeof parsed === 'object') {
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
  if (isStructured || payments.length > 0) {
    updatedJson = JSON.stringify({ payments, notes });
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
      prisma.cashierShift.findFirst({ where: { userId, status: 'open' } }),
      branchId ? prisma.cashierShift.findFirst({ where: { branchId, status: 'open' } }) : Promise.resolve(null)
    ]);
    return { userShift, branchShift };
  } catch (e) {
    console.error("Error in getShiftStatusAction:", e);
    return { userShift: null, branchShift: null };
  }
}

export async function getOpenShiftAction(userId: string) {
  try {
    const shift = await prisma.cashierShift.findFirst({
      where: { userId, status: 'open' }
    });
    if (!shift) return null;

    // Fetch only the fields needed for sales calculation — much faster than fetching full job rows
    const jobs = await prisma.job.findMany({
      where: { shiftId: shift.id },
      select: { totalAmount: true, paymentChannel: true, status: true }
    });

    let cashSales = 0, transferSales = 0, cardSales = 0, creditSales = 0;
    let totalOrders = 0, cashOrders = 0, transferOrders = 0, cardOrders = 0, creditOrders = 0;

    for (const job of jobs) {
      if (job.status === 'cancel') continue;
      const amount = job.totalAmount || 0;
      const ch = (job.paymentChannel || '').toLowerCase();
      totalOrders++;
      if (ch === 'cash / cod' || ch === 'cash') { cashSales += amount; cashOrders++; }
      else if (ch === 'transfer') { transferSales += amount; transferOrders++; }
      else if (ch === 'credit card' || ch === 'card') { cardSales += amount; cardOrders++; }
      else if (ch === 'hq/credit' || ch === 'credit') { creditSales += amount; creditOrders++; }
      else { cashSales += amount; cashOrders++; }
    }

    return {
      ...shift,
      cashSales, transferSales, cardSales, creditSales,
      expectedCash: shift.startingCash + cashSales,
      totalOrders, cashOrders, transferOrders, cardOrders, creditOrders
    };
  } catch (e) {
    console.error("Error in getOpenShiftAction:", e);
    return null;
  }
}

export async function getBranchOpenShiftAction(branchId: string) {
  try {
    const shift = await prisma.cashierShift.findFirst({
      where: { branchId, status: 'open' }
    });
    if (!shift) return null;

    // Fetch only the fields needed for sales calculation — much faster than fetching full job rows
    const jobs = await prisma.job.findMany({
      where: { shiftId: shift.id },
      select: { totalAmount: true, paymentChannel: true, status: true }
    });

    let cashSales = 0, transferSales = 0, cardSales = 0, creditSales = 0;
    let totalOrders = 0, cashOrders = 0, transferOrders = 0, cardOrders = 0, creditOrders = 0;

    for (const job of jobs) {
      if (job.status === 'cancel') continue;
      const amount = job.totalAmount || 0;
      const ch = (job.paymentChannel || '').toLowerCase();
      totalOrders++;
      if (ch === 'cash / cod' || ch === 'cash') { cashSales += amount; cashOrders++; }
      else if (ch === 'transfer') { transferSales += amount; transferOrders++; }
      else if (ch === 'credit card' || ch === 'card') { cardSales += amount; cardOrders++; }
      else if (ch === 'hq/credit' || ch === 'credit') { creditSales += amount; creditOrders++; }
      else { cashSales += amount; cashOrders++; }
    }

    return {
      ...shift,
      cashSales, transferSales, cardSales, creditSales,
      expectedCash: shift.startingCash + cashSales,
      totalOrders, cashOrders, transferOrders, cardOrders, creditOrders
    };
  } catch (e) {
    console.error("Error in getBranchOpenShiftAction:", e);
    return null;
  }
}


export async function openShiftAction(data: { userId: string, userName: string, branchId: string, startingCash: number }) {
  try {
    // Check if there is already an open shift for this user
    const existingOpen = await prisma.cashierShift.findFirst({
      where: { userId: data.userId, status: 'open' }
    });
    if (existingOpen) {
      throw new Error("You already have an open shift.");
    }

    const newShift = await prisma.cashierShift.create({
      data: {
        userId: data.userId,
        userName: data.userName,
        branchId: data.branchId,
        startingCash: data.startingCash,
        expectedCash: data.startingCash,
        status: 'open'
      }
    });
    return { success: true, shift: newShift };
  } catch (e) {
    console.error("Error in openShiftAction:", e);
    return { success: false, error: (e as Error).message || "Failed to open shift" };
  }
}

export async function closeShiftAction(data: { shiftId: string, actualCash: number, notes?: string }) {
  try {
    const shift = await prisma.cashierShift.findUnique({
      where: { id: data.shiftId }
    });
    if (!shift) {
      throw new Error("Shift not found");
    }
    if (shift.status === 'closed') {
      throw new Error("Shift is already closed");
    }

    // Fetch all jobs linked to this shift
    const jobs = await prisma.job.findMany({
      where: { shiftId: data.shiftId }
    });

    let cashSales = 0;
    let transferSales = 0;
    let cardSales = 0;
    let creditSales = 0;

    let totalOrders = 0;
    let cashOrders = 0;
    let transferOrders = 0;
    let cardOrders = 0;
    let creditOrders = 0;

    jobs.forEach(job => {
      // Skip cancelled jobs in sales calculation
      if (job.status === 'cancel') return;

      const amount = job.totalAmount || 0;
      const channel = job.paymentChannel || '';

      totalOrders += 1;

      if (channel === 'Cash / COD' || channel.toLowerCase() === 'cash') {
        cashSales += amount;
        cashOrders += 1;
      } else if (channel === 'Transfer' || channel.toLowerCase() === 'transfer') {
        transferSales += amount;
        transferOrders += 1;
      } else if (channel === 'Credit Card' || channel.toLowerCase() === 'card') {
        cardSales += amount;
        cardOrders += 1;
      } else if (channel === 'HQ/Credit' || channel.toLowerCase() === 'credit') {
        creditSales += amount;
        creditOrders += 1;
      } else {
        // Fallback default
        cashSales += amount;
        cashOrders += 1;
      }
    });

    const expectedCash = shift.startingCash + cashSales;
    const shortageOverage = data.actualCash - expectedCash;

    const closedShift = await prisma.cashierShift.update({
      where: { id: data.shiftId },
      data: {
        closedAt: new Date(),
        actualCash: data.actualCash,
        cashSales,
        transferSales,
        cardSales,
        creditSales,
        expectedCash,
        shortageOverage,
        status: 'closed',
        notes: data.notes || null,
        totalOrders,
        cashOrders,
        transferOrders,
        cardOrders,
        creditOrders,
      }
    });

    return { success: true, shift: closedShift };
  } catch (e) {
    console.error("Error in closeShiftAction:", e);
    return { success: false, error: (e as Error).message || "Failed to close shift" };
  }
}

export async function getClosedShiftsAction() {
  try {
    const shifts = await prisma.cashierShift.findMany({
      where: { status: 'closed' },
      orderBy: { closedAt: 'desc' }
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


export async function getTopUpTransactionsAction(customerId?: string) {
  const where: any = { type: 'TOPUP' };
  if (customerId) where.memberId = customerId;
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
        }
      }
    },
    orderBy: { createdAt: 'desc' },
  });
  return list;
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



