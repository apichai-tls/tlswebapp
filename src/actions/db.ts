'use server';

import { prisma } from '@/lib/prisma';

// CUSTOMERS
export async function addCustomerAction(data: any) {
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
  if (updates.isMember !== undefined) data.isMember = updates.isMember;

  return prisma.customer.update({ where: { id }, data });
}

export async function deleteCustomerAction(id: string) {
  return prisma.customer.delete({ where: { id } });
}

// JOBS
export async function addJobAction(data: any) {
  return prisma.job.create({
    data: {
      id: data.id,
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
      pickupScheduledAt: data.pickupScheduledAt,
      deliveryScheduledAt: data.deliveryScheduledAt,
      pickupRiderId: data.pickupRiderId,
      deliveryRiderId: data.deliveryRiderId,
      itemsJson: data.items ? JSON.stringify(data.items) : null,
      legsJson: data.legs ? JSON.stringify(data.legs) : null,
      remark: data.remark,
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
    }
  });
}

export async function updatePOIAction(id: string, updates: any) {
  const data: any = {};
  if (updates.name) data.name = updates.name;
  if (updates.address) data.address = updates.address;
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
