import { api } from './api';

export type JobStatus = "tba" | "pending" | "pickup" | "billing" | "delivery" | "completed" | "cancel" | "return";
export type JobType = "pickup" | "delivery" | "full_service";
export type ServiceType = "wash_fold" | "wash_iron_fold" | "wash_iron_hanger";
export type TripStatus = "pending" | "in_transit" | "completed";

export interface TripLeg {
  riderId?: string;
  scheduledAt: Date;
  status: TripStatus;
  completedAt?: Date;
}

export interface JobLegs {
  pickupOutbound: TripLeg;
  pickupInbound: TripLeg;
  deliveryOutbound: TripLeg;
  deliveryInbound: TripLeg;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export type CustomerTier = "regular" | "bronze" | "silver" | "gold" | "platinum";

export interface ShopLocation {
  id: string;
  name: string;
  address: string;
  coords: LatLng;
  noCommission?: boolean;
  area?: string;
}

export interface POI {
  id: string;
  name: string;
  address: string;
  coords: LatLng;
  placeId?: string;
  closestShopId?: string;
  distanceKm?: number;
}

export interface PriceList {
  id: string;
  name: string;
  isDefault?: boolean;
  servicePrices: Record<string, number>; // maps serviceId -> price
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  defaultAddress: string;
  defaultCoords: LatLng;
  priceListId?: string;
  creditBalance?: number; // Credit Wallet
  tier?: CustomerTier; // Legacy
  isMember?: boolean; // Legacy
  memberId?: string | null;
  isVIP?: boolean;
  isCorporate?: boolean;
  isWhatsapp?: boolean;
  email?: string | null;
  lineId?: string | null;
  language?: string | null;
  remark?: string | null;
  secondaryAddress?: string | null;
  dob?: string | null;
  taxId?: string | null;
  companyName?: string | null;
  updatedAt?: Date | string | null;
}

export interface Job {
  id: string;
  type: JobType; // Legacy support and full_service
  customerId?: string; // Links to Customer.id
  customerName?: string;
  customerPhone?: string;
  pickupLocation: string; // Customer location
  pickupRoom?: string;
  dropoffLocation: string; // Shop location
  dropoffRoom?: string;
  pickupCoords: LatLng;
  dropoffCoords: LatLng;
  distance: number; // 1-way km
  fee: number; // Total commission
  status: JobStatus;
  subStatus?: "billing" | "wash" | "dry" | "iron" | "ready";
  createdAt: Date;
  updatedAt?: Date;
  scheduledAt: Date;
  completedAt?: Date;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  proofImageUrl?: string;
  pickupProofImageUrl?: string;
  deliveryProofImageUrl?: string;
  billImageUrl?: string;
  billNo?: string | null;
  riderId?: string; // Legacy assigned rider
  bagImageUrl?: string;
  serviceType?: ServiceType;
  serviceSpeed?: string;
  laundryTypes?: string[];
  source?: "app" | "pos";
  totalAmount?: number; // Customer price
  paymentMethod?: "cash" | "transfer" | "credit" | "card";
  paymentChannel?: string;
  isPaid?: boolean;
  csoPaidAt?: Date | string | null;
  isShopPaid?: boolean;
  shopPaidAt?: Date | string | null;
  discount?: number; // Manual adjustment/discount
  pickupScheduledAt?: Date;
  pickupScheduledEndAt?: Date;
  deliveryScheduledAt?: Date;
  deliveryScheduledEndAt?: Date;
  pickupRiderId?: string;
  deliveryRiderId?: string;
  items?: { name: string; quantity: number; price: number }[];
  
  pickupDistance?: number;
  deliveryDistance?: number;
  pickupCommission?: number;
  deliveryCommission?: number;

  legs?: JobLegs;
  remark?: string;
  adminNotesJson?: string;
  adminNote?: string;
  adminLogs?: any[];
  branchId?: string;
  createdBy?: string | null;
  cashPlaced?: boolean;
  isStuck?: boolean;
}

export interface AdminNoteLog {
  id?: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: string;
  imageUrls?: string[];
  isNew?: boolean;
}

export interface ServiceItem {
  id: string;
  name: string;
  price: number;
  memberPrice: number; // Legacy
  category: string;
  unit?: string;
}

export interface Rider {
  id: string;
  name: string;
  nickname?: string;
  phone: string;
  status: "online" | "offline" | "busy";
  currentLocation?: LatLng;
  avatarUrl?: string;
  rating: number;
  completedJobs: number;
  nationalId?: string;
  color?: string;
  vehicleType?: "motorcycle" | "car" | "truck";
  vehiclePlate?: string;
  commissionBalance?: number;
  branchId?: string;
  isActive?: boolean;
}

export interface RiderTransaction {
  id: string;
  riderId: string;
  jobId?: string;
  amount: number;
  type: string; // "commission_pickup" | "commission_delivery" | "payout"
  detail?: string;
  createdAt: Date;
}

type Listener = () => void;

export function emitAllChanges() {
  customerListeners.forEach(l => l());
  serviceListeners.forEach(l => l());
  riderListeners.forEach(l => l());
  jobListeners.forEach(l => l());
  priceListListeners.forEach(l => l());
  shopListeners.forEach(l => l());
  settingsListeners.forEach(l => l());
  poiListeners.forEach(l => l());
}

// --- CUSTOMER STORE ---
const customerListeners: Set<Listener> = new Set();
function emitCustomerChange() {
  customerListeners.forEach((l) => l());
}
export const customerStore = {
  subscribe(listener: Listener): () => void {
    customerListeners.add(listener);
    return () => customerListeners.delete(listener);
  },
  getSnapshot(): Customer[] {
    return api.sync.getCustomers();
  },
  async addCustomer(customer: Omit<Customer, "id">) {
    const newCustomer = await api.addCustomer(customer);
    emitCustomerChange();
    return newCustomer;
  },
  async updateCustomer(id: string, updates: Partial<Customer>) {
    await api.updateCustomer(id, updates);
    emitCustomerChange();
  },
  async deleteCustomer(id: string) {
    await api.deleteCustomer(id);
    emitCustomerChange();
  }
};

// --- SERVICE STORE ---
const serviceListeners: Set<Listener> = new Set();
export function emitServiceChange() {
  serviceListeners.forEach(l => l());
}
export const serviceStore = {
  subscribe(listener: Listener): () => void {
    serviceListeners.add(listener);
    return () => serviceListeners.delete(listener);
  },
  getSnapshot(): ServiceItem[] {
    return api.sync.getServices();
  },
  async addService(service: Omit<ServiceItem, 'id'>) {
    const newService = await api.addService(service);
    emitServiceChange();
    return newService;
  },
  async updateService(id: string, updates: Partial<ServiceItem>) {
    await api.updateService(id, updates);
    emitServiceChange();
  },
  async deleteService(id: string) {
    await api.deleteService(id);
    emitServiceChange();
  }
};

// --- RIDER STORE ---
const riderListeners: Set<Listener> = new Set();
function emitRiderChange() {
  riderListeners.forEach((l) => l());
}
export const riderStore = {
  subscribe(listener: Listener): () => void {
    riderListeners.add(listener);
    return () => riderListeners.delete(listener);
  },
  getSnapshot(): Rider[] {
    return api.sync.getRiders();
  },
  async updateRider(id: string, updates: Partial<Rider>) {
    await api.updateRider(id, updates);
    emitRiderChange();
  },
  async addRider(rider: Omit<Rider, 'id'> & { id?: string }) {
    const newRider = await api.addRider(rider);
    emitRiderChange();
    return newRider;
  },
  async deleteRider(id: string) {
    await api.deleteRider(id);
    emitRiderChange();
  }
};

// --- JOB STORE ---
// Fee formula: ระยะทางปัดเศษขึ้น คูณ 3 คูณ 10 บาท
export function calculateFee(distanceKm: number): number {
  if (!distanceKm || distanceKm <= 0) return 0;
  
  const distanceFare = Math.ceil(distanceKm * 3) * 10;
  
  // คิดราคาตามระยะทางจริง แต่มีขั้นต่ำที่ 30 บาท
  return Math.max(30, distanceFare);
}

export function randomDistance(): number {
  return Math.round((Math.random() * 15 + 5) * 10) / 10;
}

export function getDirectDistance(coord1: LatLng, coord2: LatLng): number {
  const R = 6371; // km
  const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
  const dLng = (coord2.lng - coord1.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export function getClosestShopIndex(coords: LatLng, shops: ShopLocation[]): number {
  if (!shops || shops.length === 0) return 0;
  let minDistance = Infinity;
  let minIndex = 0;
  shops.forEach((shop, index) => {
    const dist = getDirectDistance(coords, shop.coords);
    if (dist < minDistance) {
      minDistance = dist;
      minIndex = index;
    }
  });
  return minIndex;
}

export function getClosestShopId(coords: LatLng, shops: ShopLocation[]): string {
  if (!shops || shops.length === 0) return "";
  const index = getClosestShopIndex(coords, shops);
  return shops[index]?.id || "";
}

const jobListeners: Set<Listener> = new Set();
function emitJobChange() {
  jobListeners.forEach((l) => l());
}

export const jobStore = {
  notify: emitJobChange,
  subscribe(listener: Listener): () => void {
    jobListeners.add(listener);
    return () => jobListeners.delete(listener);
  },
  getSnapshot(): Job[] {
    return api.sync.getJobs();
  },

  async addJob(details: Parameters<typeof api.addJob>[0]) {
    const newJob = await api.addJob(details);
    emitJobChange();
    return newJob;
  },

  async updateJobLeg(id: string, legKey: keyof JobLegs, updates: Partial<TripLeg>) {
    const jobs = api.sync.getJobs();
    const job = jobs.find(j => j.id === id);
    if (!job || !job.legs) return;

    const updatedLegs = {
      ...job.legs,
      [legKey]: { ...job.legs[legKey], ...updates }
    };

    let overallStatus = job.status;
    if (job.status === "completed") {
      overallStatus = "completed";
    } else if (updatedLegs.deliveryInbound.status === "completed") {
      overallStatus = "completed";
    } else if (updatedLegs.deliveryOutbound.status === "in_transit" || updatedLegs.deliveryInbound.status === "in_transit") {
      overallStatus = "delivery";
    } else if (updatedLegs.pickupInbound.status === "completed") {
      overallStatus = "billing"; // Cleaning phase
    } else if (updatedLegs.pickupOutbound.status === "in_transit" || updatedLegs.pickupInbound.status === "in_transit") {
      overallStatus = "pickup";
    }

    await api.updateJob(id, { 
      legs: updatedLegs, 
      status: overallStatus, 
      completedAt: overallStatus === "completed" ? (job.completedAt || new Date()) : undefined 
    });
    emitJobChange();
  },

  async acceptJob(id: string, riderId: string) {
    await api.updateJob(id, { status: "pickup", riderId, pickupRiderId: riderId });
    emitJobChange();
  },

  async updateJobDetails(id: string, updates: Partial<Job>, actorDetails?: { actorId?: string, actorName?: string, actorRole?: string }) {
    const jobs = api.sync.getJobs();
    const job = jobs.find(j => j.id === id);

    // Auto-hydrate actor details from localStorage on client side if not provided
    let finalActorDetails = { ...actorDetails };
    if (!finalActorDetails.actorId && !finalActorDetails.actorName && typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('authUser');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.id) finalActorDetails.actorId = parsed.id;
          if (parsed?.name || parsed?.email) finalActorDetails.actorName = parsed.name || parsed.email;
          if (parsed?.role) finalActorDetails.actorRole = parsed.role;
        }
      } catch (e) {}
    }

    if (job && job.status === "completed") {
      if (updates.status) {
        updates.completedAt = null as any;
      }
    }

    if (job && job.legs) {
      let legsModified = false;
      const updatedLegs = { ...job.legs };
      
      if (updates.pickupRiderId !== undefined && updates.pickupRiderId !== job.pickupRiderId) {
        updatedLegs.pickupOutbound = { ...updatedLegs.pickupOutbound, riderId: updates.pickupRiderId || "" };
        updatedLegs.pickupInbound = { ...updatedLegs.pickupInbound, riderId: updates.pickupRiderId || "" };
        legsModified = true;
      }
      
      if (updates.deliveryRiderId !== undefined && updates.deliveryRiderId !== job.deliveryRiderId) {
        updatedLegs.deliveryOutbound = { ...updatedLegs.deliveryOutbound, riderId: updates.deliveryRiderId || "" };
        updatedLegs.deliveryInbound = { ...updatedLegs.deliveryInbound, riderId: updates.deliveryRiderId || "" };
        legsModified = true;
      }

      if (updates.pickupScheduledAt !== undefined && updates.pickupScheduledAt !== job.pickupScheduledAt) {
        if (updates.pickupScheduledAt) {
          updatedLegs.pickupOutbound = { ...updatedLegs.pickupOutbound, scheduledAt: updates.pickupScheduledAt };
          updatedLegs.pickupInbound = { ...updatedLegs.pickupInbound, scheduledAt: updates.pickupScheduledAt };
          legsModified = true;
        }
      }

      if (updates.deliveryScheduledAt !== undefined && updates.deliveryScheduledAt !== job.deliveryScheduledAt) {
        if (updates.deliveryScheduledAt) {
          updatedLegs.deliveryOutbound = { ...updatedLegs.deliveryOutbound, scheduledAt: updates.deliveryScheduledAt };
          updatedLegs.deliveryInbound = { ...updatedLegs.deliveryInbound, scheduledAt: updates.deliveryScheduledAt };
          legsModified = true;
        }
      }
      
      if (legsModified) {
        updates.legs = updatedLegs;
      }
    }

    // Include updatedAt from the current in-memory job snapshot for OCC (Optimistic Concurrency Control).
    // This prevents stale overwrites when this function is called from components like AdminTaskTracker.
    const updatedAtForOCC = job?.updatedAt;
    await api.updateJob(id, { ...updates, ...(updatedAtForOCC ? { updatedAt: updatedAtForOCC } : {}), ...finalActorDetails });
    emitJobChange();
  },

  async fetchHistoricalJobs(startDate: Date, endDate: Date, riderId?: string) {
    return await api.fetchHistoricalJobs(startDate, endDate, riderId);
  },

  async assignPickupRider(id: string, riderId: string, scheduledAt?: Date) {
    const jobs = api.sync.getJobs();
    const job = jobs.find(j => j.id === id);
    if (!job || !job.legs) return;

    const sched = scheduledAt || job.pickupScheduledAt || job.scheduledAt;

    const updatedLegs = {
      ...job.legs,
      pickupOutbound: { ...job.legs.pickupOutbound, riderId, scheduledAt: sched },
      pickupInbound: { ...job.legs.pickupInbound, riderId, scheduledAt: sched }
    };

    await api.updateJob(id, { legs: updatedLegs, pickupRiderId: riderId, pickupScheduledAt: sched });
    emitJobChange();
  },

  async assignDeliveryRider(id: string, riderId: string, scheduledAt: Date) {
    const jobs = api.sync.getJobs();
    const job = jobs.find(j => j.id === id);
    if (!job || !job.legs) return;

    const updatedLegs = {
      ...job.legs,
      deliveryOutbound: { ...job.legs.deliveryOutbound, riderId, scheduledAt },
      deliveryInbound: { ...job.legs.deliveryInbound, riderId, scheduledAt }
    };

    await api.updateJob(id, { legs: updatedLegs, deliveryRiderId: riderId, deliveryScheduledAt: scheduledAt });
    emitJobChange();
  },

  async completeJob(id: string, proofImageUrl?: string, legType?: "pickup" | "delivery", actorDetails?: { actorId?: string, actorName?: string, actorRole?: string }) {
    const jobs = api.sync.getJobs();
    const job = jobs.find(j => j.id === id);
    if (!job) return;

    // proofImageUrl may already be a JSON array string (e.g. '["url1","url2"]')
    // or a single URL string. Normalise to a JSON array string.
    const toJsonArray = (val?: string): string | undefined => {
      if (!val) return undefined;
      try {
        const parsed = JSON.parse(val);
        // Already a valid JSON array → store as-is
        if (Array.isArray(parsed)) return val;
        // Was a JSON primitive → wrap in array
        return JSON.stringify([parsed]);
      } catch {
        // Plain URL string → wrap in array
        return JSON.stringify([val]);
      }
    };

    const proofJson = toJsonArray(proofImageUrl);

    // Determine completion leg
    const isPickupLeg = legType 
      ? legType === "pickup"
      : ["pending", "pickup", "billing"].includes(job.status);

    // Add leg validation - legs might not exist for old jobs
    if (isPickupLeg) {
      const updatedLegs = job.legs ? {
        ...job.legs,
        pickupOutbound: { ...job.legs.pickupOutbound, status: "completed" as const, completedAt: new Date() },
        pickupInbound: { ...job.legs.pickupInbound, status: "completed" as const, completedAt: new Date() }
      } : undefined;

      await api.updateJob(id, {
        status: "billing",
        pickupProofImageUrl: proofJson,
        legs: updatedLegs,
        ...actorDetails
      });
    } else {
      const updatedLegs = job.legs ? {
        ...job.legs,
        deliveryOutbound: { ...job.legs.deliveryOutbound, status: "completed" as const, completedAt: new Date() },
        deliveryInbound: { ...job.legs.deliveryInbound, status: "completed" as const, completedAt: new Date() }
      } : undefined;

      await api.updateJob(id, {
        status: "completed",
        completedAt: job.completedAt || new Date(),
        deliveryProofImageUrl: proofJson,
        proofImageUrl: proofJson,
        legs: updatedLegs,
        ...actorDetails
      });
    }
    emitJobChange();
  },
};

// --- PRICE LIST STORE ---
const priceListListeners: Set<Listener> = new Set();
function emitPriceListChange() {
  priceListListeners.forEach((l) => l());
}

export const priceListStore = {
  subscribe(listener: Listener): () => void {
    priceListListeners.add(listener);
    return () => priceListListeners.delete(listener);
  },
  getSnapshot(): PriceList[] {
    return api.sync.getPriceLists();
  },
  async addPriceList(list: Omit<PriceList, "id">) {
    const newList = await api.addPriceList(list);
    emitPriceListChange();
    return newList;
  },
  async updatePriceList(id: string, updates: Partial<PriceList>) {
    await api.updatePriceList(id, updates);
    emitPriceListChange();
  },
  async deletePriceList(id: string) {
    await api.deletePriceList(id);
    emitPriceListChange();
  }
};

// --- SHOP STORE ---
const shopListeners: Set<Listener> = new Set();
function emitShopChange() {
  shopListeners.forEach((l) => l());
}

export const shopStore = {
  subscribe(listener: Listener): () => void {
    shopListeners.add(listener);
    return () => shopListeners.delete(listener);
  },
  getSnapshot(): ShopLocation[] {
    return api.sync.getShopLocations();
  },
  async addShopLocation(shop: Omit<ShopLocation, "id">) {
    const newShop = await api.addShopLocation(shop);
    emitShopChange();
    return newShop;
  },
  async updateShopLocation(id: string, updates: Partial<ShopLocation>) {
    await api.updateShopLocation(id, updates);
    emitShopChange();
  },
  async deleteShopLocation(id: string) {
    await api.deleteShopLocation(id);
    emitShopChange();
  }
};

// --- SETTINGS STORE ---
const settingsListeners: Set<Listener> = new Set();
function emitSettingsChange() {
  settingsListeners.forEach((l) => l());
}

export const settingsStore = {
  subscribe(listener: Listener): () => void {
    settingsListeners.add(listener);
    return () => settingsListeners.delete(listener);
  },
  getSnapshot(): Record<string, string> {
    return api.sync.getSettings();
  },
  async updateSetting(key: string, value: string) {
    await api.updateSetting(key, value);
    emitSettingsChange();
  }
};

// --- POI STORE ---
const poiListeners: Set<Listener> = new Set();
function emitPoiChange() {
  poiListeners.forEach((l) => l());
}

export const poiStore = {
  subscribe(listener: Listener): () => void {
    poiListeners.add(listener);
    return () => poiListeners.delete(listener);
  },
  getSnapshot(): POI[] {
    return api.sync.getPOIs();
  },
  async addPOI(poi: Omit<POI, "id">) {
    const newPoi = await api.addPOI(poi);
    emitPoiChange();
    return newPoi;
  },
  async updatePOI(id: string, updates: Partial<POI>) {
    await api.updatePOI(id, updates);
    emitPoiChange();
  },
  async deletePOI(id: string) {
    await api.deletePOI(id);
    emitPoiChange();
  }
};

// Subscribe to synchronous API changes to trigger UI updates automatically
api.subscribe(() => {
  emitAllChanges();
});
