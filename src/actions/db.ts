'use server';

import { prisma } from '@/lib/prisma';

// CUSTOMERS
async function generateMemberId() {
  const lastMember = await prisma.customer.findFirst({
    where: { memberId: { not: null } },
    orderBy: { memberId: 'desc' },
  });
  if (!lastMember || !lastMember.memberId) return "00001";
  const num = parseInt(lastMember.memberId, 10);
  if (isNaN(num)) return "00001";
  return String(num + 1).padStart(5, '0');
}

export async function addCustomerAction(data: any) {
  let memberId = null;
  if (data.isMember) {
    memberId = await generateMemberId();
  }

  const c = await prisma.customer.create({
    data: {
      id: data.id,
      name: data.name,
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
    }
  });
  return c;
}

export async function updateCustomerAction(id: string, updates: any) {
  const data: any = {};
  if (updates.name !== undefined) data.name = updates.name;
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
    if (updates.isMember === true) {
      const current = await prisma.customer.findUnique({ where: { id } });
      if (current && !current.memberId) {
        data.memberId = await generateMemberId();
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

  return prisma.customer.update({ where: { id }, data });
}

export async function deleteCustomerAction(id: string) {
  return prisma.customer.delete({ where: { id } });
}

export async function addJobAction(data: any) {
  let jobId = data.id;
  
  if (!jobId || String(jobId).startsWith('JOB-')) {
    const year = new Date().getFullYear().toString();
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

  return prisma.job.create({
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
      fee: data.fee || 0,
      status: data.status,
      createdAt: data.createdAt,
      scheduledAt: data.scheduledAt,
      completedAt: data.completedAt,
      proofImageUrl: data.proofImageUrl,
      riderId: data.riderId,
      bagImageUrl: data.bagImageUrl,
      serviceType: data.serviceType,
      source: data.source,
      totalAmount: data.totalAmount,
      paymentMethod: data.paymentMethod,
      discount: data.discount || 0,
      pickupDistance: data.pickupDistance,
      deliveryDistance: data.deliveryDistance,
      pickupCommission: data.pickupCommission,
      deliveryCommission: data.deliveryCommission,
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
    }
  });
}

export async function updateJobAction(id: string, updates: any) {
  const data: any = {};
  if (updates.status !== undefined) data.status = updates.status;
  if (updates.completedAt !== undefined) data.completedAt = updates.completedAt;
  if (updates.proofImageUrl !== undefined) data.proofImageUrl = updates.proofImageUrl;
  if (updates.riderId !== undefined) data.riderId = updates.riderId;
  if (updates.legs) data.legsJson = JSON.stringify(updates.legs);
  if (updates.pickupRiderId !== undefined) data.pickupRiderId = updates.pickupRiderId;
  if (updates.pickupScheduledAt !== undefined) data.pickupScheduledAt = updates.pickupScheduledAt;
  if (updates.deliveryRiderId !== undefined) data.deliveryRiderId = updates.deliveryRiderId;
  if (updates.deliveryScheduledAt !== undefined) data.deliveryScheduledAt = updates.deliveryScheduledAt;

  // Additional fields for full job edits
  if (updates.customerName !== undefined) data.customerName = updates.customerName;
  if (updates.customerPhone !== undefined) data.customerPhone = updates.customerPhone;
  if (updates.pickupLocation !== undefined) data.pickupLocation = updates.pickupLocation;
  if (updates.dropoffLocation !== undefined) data.dropoffLocation = updates.dropoffLocation;
  if (updates.pickupCoords) {
    data.pickupLat = updates.pickupCoords.lat;
    data.pickupLng = updates.pickupCoords.lng;
  }
  if (updates.dropoffCoords) {
    data.dropoffLat = updates.dropoffCoords.lat;
    data.dropoffLng = updates.dropoffCoords.lng;
  }
  if (updates.bagImageUrl !== undefined) data.bagImageUrl = updates.bagImageUrl;
  if (updates.paymentMethod !== undefined) data.paymentMethod = updates.paymentMethod;
  if (updates.fee !== undefined) data.fee = updates.fee;
  if (updates.totalAmount !== undefined) data.totalAmount = updates.totalAmount;
  if (updates.serviceType !== undefined) data.serviceType = updates.serviceType;
  if (updates.remark !== undefined) data.remark = updates.remark;
  if (updates.adminNotesJson !== undefined) data.adminNotesJson = updates.adminNotesJson;
  if (updates.scheduledAt !== undefined) data.scheduledAt = updates.scheduledAt;

  if (updates.pickupDistance !== undefined) data.pickupDistance = updates.pickupDistance;
  if (updates.deliveryDistance !== undefined) data.deliveryDistance = updates.deliveryDistance;
  if (updates.pickupCommission !== undefined) data.pickupCommission = updates.pickupCommission;
  if (updates.deliveryCommission !== undefined) data.deliveryCommission = updates.deliveryCommission;

  // Check if a leg was just completed by comparing status
  if (updates.status) {
    const existingJob = await prisma.job.findUnique({ where: { id } });
    if (existingJob) {
      // Pickup completed
      if (existingJob.status !== 'pickup_completed' && existingJob.status !== 'completed' && updates.status === 'pickup_completed' && existingJob.pickupCommission != null && existingJob.pickupRiderId) {
        // Check if transaction already exists to avoid duplicates
        const existingTx = await prisma.riderTransaction.findFirst({
          where: { jobId: id, type: 'commission_pickup' }
        });
        if (!existingTx) {
          await prisma.riderTransaction.create({
            data: {
              riderId: existingJob.pickupRiderId,
              jobId: id,
              amount: existingJob.pickupCommission,
              type: 'commission_pickup',
              detail: `Job ${id} - Pickup`
            }
          });
          await prisma.rider.update({
            where: { id: existingJob.pickupRiderId },
            data: { commissionBalance: { increment: existingJob.pickupCommission } }
          });
        }
      }
      
      // Delivery completed
      if (existingJob.status !== 'completed' && updates.status === 'completed' && existingJob.deliveryCommission != null && existingJob.deliveryRiderId) {
        // Check if transaction already exists to avoid duplicates
        const existingTx = await prisma.riderTransaction.findFirst({
          where: { jobId: id, type: 'commission_delivery' }
        });
        if (!existingTx) {
          await prisma.riderTransaction.create({
            data: {
              riderId: existingJob.deliveryRiderId,
              jobId: id,
              amount: existingJob.deliveryCommission,
              type: 'commission_delivery',
              detail: `Job ${id} - Delivery`
            }
          });
          await prisma.rider.update({
            where: { id: existingJob.deliveryRiderId },
            data: { commissionBalance: { increment: existingJob.deliveryCommission } }
          });
        }
      }
    }
  }

  return prisma.job.update({ where: { id }, data });
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
  return prisma.rider.update({ where: { id }, data });
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
      lat: data.coords.lat,
      lng: data.coords.lng,
      noCommission: data.noCommission || false,
    }
  });
}

export async function updateShopLocationAction(id: string, updates: any) {
  const data: any = {};
  if (updates.name) data.name = updates.name;
  if (updates.address) data.address = updates.address;
  if (updates.coords) {
    data.lat = updates.coords.lat;
    data.lng = updates.coords.lng;
  }
  if (typeof updates.noCommission !== 'undefined') {
    data.noCommission = updates.noCommission;
  }
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
  return prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}
