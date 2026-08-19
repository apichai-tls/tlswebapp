import * as dbActions from '@/actions/db';
import { getServiceSKU, type Customer, type Job, type Rider, type ServiceItem, type PriceList, type ShopLocation } from './store';

const DB_KEY = 'that_laundry_shop_db';

// Simulate network delay
const delay = (ms = 500) => new Promise(resolve => setTimeout(resolve, ms));

// Type for the entire database structure
interface Database {
  customers: Customer[];
  jobs: Job[];
  riders: Rider[];
  services: ServiceItem[];
  priceLists: PriceList[];
  shopLocations: ShopLocation[];
  pois: { id: string; name: string; address: string; coords: { lat: number; lng: number }; placeId?: string; closestShopId?: string; distanceKm?: number }[];
  settings: Record<string, string>;
}

// In-memory cache for fast sync reads, initialized lazily on client
let memoryDb: Database | null = null;
let isDbLoaded = false;

// Initialize the database from server
export const ensureDbLoaded = async () => {
  if (isDbLoaded) return;
  if (typeof window === 'undefined') return;

  // Optimistic UI: Try to load from Cache Storage first for instant rendering
  const isTestEnv = typeof window !== 'undefined' && (!!window.navigator.webdriver || !!(window as any).__playwright_test__);
  if (!isTestEnv) {
    try {
      const cache = await caches.open('tls-cache');
      const cachedRes = await cache.match('/api/db-cache');
      if (cachedRes) {
        const cached = await cachedRes.json();
        const parsed = JSON.parse(JSON.stringify(cached), dateReviver);
        memoryDb = parseMockDb(parsed);
        isDbLoaded = true;
        api.notify();
      }
    } catch(e) {
      console.error('Failed to load from Cache API', e);
    }
  }

  try {
    const res = await fetch('/api/db?t=' + Date.now());
    if (res.ok) {
      const data = await res.json();
      
      // Save to Cache Storage for next refresh
      if (!isTestEnv) {
        try {
          const cache = await caches.open('tls-cache');
          await cache.put('/api/db-cache', new Response(JSON.stringify(data)));
        } catch (e) {
          console.error('Failed to save to Cache API', e);
        }
      }

      const parsed = JSON.parse(JSON.stringify(data), dateReviver);
      memoryDb = parseMockDb(parsed);
      isDbLoaded = true;
      
      // Trigger a re-render for all components using useSyncExternalStore
      api.notify();

      // Background lazy load POIs
      fetch('/api/pois')
        .then(r => r.json())
        .then(poiData => {
          if (memoryDb) {
            const parsedPois = JSON.parse(JSON.stringify(poiData), dateReviver);
            memoryDb.pois = parsedPois;
            api.notify();
          }
        })
        .catch(err => console.error("Failed to load POIs in background", err));
    }
  } catch (error) {
    console.error('Failed to load DB from server', error);
  }
};

let isRefreshing = false; // Guard against concurrent refreshes
const lastUpdatedJobs = new Map<string, number>();

// Callback registered by shiftStore to receive openShifts from poll — avoids circular import
let onOpenShiftsSyncCallback: ((shifts: any[]) => void) | null = null;
export function registerOpenShiftsSyncCallback(cb: (shifts: any[]) => void) {
  onOpenShiftsSyncCallback = cb;
}

export const refreshDb = async () => {
  if (typeof window === 'undefined') return;
  if (isRefreshing) return; // Skip if already fetching — prevents race conditions
  isRefreshing = true;
  try {
    const res = await fetch('/api/db?t=' + Date.now());
    if (res.ok) {
      const data = await res.json();
      const parsed = JSON.parse(JSON.stringify(data), dateReviver);
      if (memoryDb && memoryDb.pois.length > 0) {
        // Preserve POIs as they are loaded separately and heavily cached
        parsed.pois = memoryDb.pois;
      }

      // ✅ FIX: Preserve in-memory GPS location for active riders
      // refreshDb() fetches stale server data which may not have the latest GPS fix yet.
      // We keep the most recent in-memory location so the map doesn't jump backwards.
      if (memoryDb && parsed.riders) {
        parsed.riders = parsed.riders.map((serverRider: any) => {
          const memRider = memoryDb!.riders.find(r => r.id === serverRider.id);
          if (
            memRider &&
            memRider.currentLocation &&
            (serverRider.status === 'online' || serverRider.status === 'busy')
          ) {
            // Keep in-memory location (it's fresher than DB)
            return { ...serverRider, currentLocation: memRider.currentLocation };
          }
          return serverRider;
        });
      }

      // ✅ FIX: Prevent background polling from overwriting recently completed local job status (race condition protection)
      // When a rider completes a job (pickup -> billing, or delivery -> completed), the client updates locally and performs
      // GCS uploads + DB Server Actions. In the meantime, concurrent polling fetch('/api/db') could return stale DB states,
      // reverting the job in UI. We preserve the advanced local status and proof URLs until the server reflects the changes.
      if (memoryDb && parsed.jobs) {
        parsed.jobs = parsed.jobs.map((serverJob: any) => {
          const memJob = memoryDb!.jobs.find(j => j.id === serverJob.id);
          if (memJob) {
            // Stale polling overwrite protection: Keep the local in-memory job if edited within 30s
            const lastUpdated = lastUpdatedJobs.get(serverJob.id);
            if (lastUpdated && (Date.now() - lastUpdated) < 30000) {
              return memJob;
            }

            const isMemPickupCompleted = ["billing", "active", "ready_to_wash", "washed", "delivery", "completed"].includes(memJob.status);
            const isServerPickupCompleted = ["billing", "active", "ready_to_wash", "washed", "delivery", "completed"].includes(serverJob.status);
            
            const isMemDeliveryCompleted = memJob.status === "completed";
            const isServerDeliveryCompleted = serverJob.status === "completed";

            const shouldPreservePickup = isMemPickupCompleted && !isServerPickupCompleted;
            const shouldPreserveDelivery = isMemDeliveryCompleted && !isServerDeliveryCompleted;

            let updatedJob = { ...serverJob };

            if (shouldPreservePickup || shouldPreserveDelivery) {
              updatedJob = {
                ...updatedJob,
                status: memJob.status,
                completedAt: memJob.completedAt || serverJob.completedAt,
                pickupProofImageUrl: memJob.pickupProofImageUrl || serverJob.pickupProofImageUrl,
                deliveryProofImageUrl: memJob.deliveryProofImageUrl || serverJob.deliveryProofImageUrl,
                proofImageUrl: memJob.proofImageUrl || serverJob.proofImageUrl,
              };
            }

            // Always preserve in-memory billImageUrl if client has one but server has stale empty/null data
            if (memJob.billImageUrl && memJob.billImageUrl !== '[]' && (!serverJob.billImageUrl || serverJob.billImageUrl === '[]')) {
              updatedJob.billImageUrl = memJob.billImageUrl;
            }

            // Always preserve billNo across in-memory and server state
            if (memJob.billNo && (!serverJob.billNo || serverJob.billNo === '')) {
              updatedJob.billNo = memJob.billNo;
            } else if (serverJob.billNo && (!memJob.billNo || memJob.billNo === '')) {
              updatedJob.billNo = serverJob.billNo;
            }

            return updatedJob;
          }
          return serverJob;
        });
      }

      // ✅ FIX: Preserve all in-memory jobs (e.g. historical jobs loaded via fetchHistoricalJobs)
      // that are not returned by the server /api/db (which only fetches recent/active jobs).
      if (memoryDb && parsed.jobs) {
        const serverJobIds = new Set(parsed.jobs.map((j: any) => j.id));
        const extraMemJobs = memoryDb.jobs.filter(j => !serverJobIds.has(j.id));
        parsed.jobs = [...parsed.jobs, ...extraMemJobs];
      }

      memoryDb = parseMockDb(parsed);
      api.notify();

      // ✅ Sync shift status from polling data — no separate DB call needed
      if (parsed.openShifts && onOpenShiftsSyncCallback) {
        onOpenShiftsSyncCallback(parsed.openShifts);
      }
    }
  } catch (error) {
    console.error('Failed to refresh DB', error);
  } finally {
    isRefreshing = false;
  }
};



// Start loading the DB immediately if we're on the client
if (typeof window !== 'undefined') {
  ensureDbLoaded();
}

const emptyDb: Database = {
  customers: [],
  jobs: [],
  riders: [],
  services: [],
  priceLists: [],
  shopLocations: [],
  pois: [],
  settings: {}
};

let fallbackDb: Database | null = null;
const initDb = (): Database => {
  if (!memoryDb) {
    // Return a stable reference to empty db as a fallback until the server data loads
    // This fixes the "getServerSnapshot should be cached" SSR infinite loop warning
    if (!fallbackDb) fallbackDb = parseMockDb(emptyDb);
    return fallbackDb;
  }
  return memoryDb;
};

// JSON Reviver to convert ISO string dates back to Date objects
const dateReviver = (key: string, value: unknown) => {
  const isDateKey = key.includes('At') || key === 'date';
  if (typeof value === 'string' && isDateKey && !isNaN(Date.parse(value))) {
    return new Date(value);
  }
  return value;
};

// Parse initial db and convert date strings to Date objects
const parseMockDb = (data: unknown): Database => {
  const db = JSON.parse(JSON.stringify(data), dateReviver) as Database;
  if (!db.priceLists) db.priceLists = [];
  if (!db.shopLocations) db.shopLocations = [];
  if (!db.customers) db.customers = [];
  if (!db.jobs) db.jobs = [];
  if (!db.riders) db.riders = [];
  if (!db.services) db.services = [];
  if (!db.settings) db.settings = {};
  if (!db.pois) db.pois = [];
  return db;
};

type DbChangeListener = () => void;
const dbChangeListeners = new Set<DbChangeListener>();

// --- API METHODS ---

export const api = {
  subscribe(listener: DbChangeListener) {
    dbChangeListeners.add(listener);
    return () => {
      dbChangeListeners.delete(listener);
    };
  },
  notify() {
    dbChangeListeners.forEach(l => l());
  },

  // --- CUSTOMERS ---
  async getCustomers(): Promise<Customer[]> {
    
    return initDb().customers;
  },
  
  async fetchHistoricalJobs(startDate: Date, endDate: Date, riderId?: string) {
    if (typeof window === 'undefined' || !memoryDb) return [];
    if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      console.warn("Invalid start/end date passed to fetchHistoricalJobs", startDate, endDate);
      return [];
    }
    try {
      let url = `/api/jobs/history?start=${startDate.toISOString()}&end=${endDate.toISOString()}`;
      if (riderId) {
        url += `&riderId=${encodeURIComponent(riderId)}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const parsedJobs = JSON.parse(JSON.stringify(data), dateReviver) as Job[];
        
        // Merge: update existing jobs + add new ones
        // IMPORTANT: Must create a NEW array reference for useSyncExternalStore to detect changes
        const existingIds = new Set(memoryDb.jobs.map(j => j.id));
        const historyMap = new Map(parsedJobs.map(j => [j.id, j]));

        // Update existing jobs with fresh data from history
        const updatedJobs = memoryDb.jobs.map(j => {
          if (historyMap.has(j.id)) {
            return { ...j, ...historyMap.get(j.id)! };
          }
          return j;
        });

        // Add new jobs that don't exist yet in memory
        const newJobs = parsedJobs.filter(j => !existingIds.has(j.id));

        memoryDb.jobs = [...updatedJobs, ...newJobs]; // Always new array reference
        api.notify();
        return parsedJobs;
      }
    } catch (error) {
      console.error('Failed to fetch historical jobs', error);
    }
    return [];
  },
  
  async addCustomer(customer: Omit<Customer, 'id'>): Promise<Customer> {
    const db = initDb();
    // Let PostgreSQL generate the UUID; do NOT pass a pre-generated id
    const savedCustomer = await dbActions.addCustomerAction(customer);
    const newCustomer: Customer = {
      ...customer,
      id: savedCustomer.id,
      name: savedCustomer.name,
      memberId: savedCustomer.memberId,
    };
    db.customers = [newCustomer, ...db.customers];
    return newCustomer;
  },

  async updateCustomer(id: string, updates: Partial<Customer>): Promise<Customer> {
    const db = initDb();
    const currentCustomer = db.customers.find(c => c.id === id);
    if (!currentCustomer) throw new Error("Customer not found");

    const savedCustomer = await dbActions.updateCustomerAction(id, updates);

    let updatedCustomer: Customer | null = null;
    db.customers = db.customers.map(c => {
      if (c.id === id) {
        const u: Customer = { 
          ...c, 
          ...updates,
          name: savedCustomer.name,
          memberId: savedCustomer.memberId,
        };
        updatedCustomer = u;
        return u;
      }
      return c;
    });
    if (!updatedCustomer) throw new Error("Customer not found");
    return updatedCustomer;
  },

  async deleteCustomer(id: string): Promise<void> {
    
    const db = initDb();
    db.customers = db.customers.filter(c => c.id !== id);
    await dbActions.deleteCustomerAction(id);
  },

  // --- JOBS ---
  async getJobs(): Promise<Job[]> {
    
    return initDb().jobs;
  },

  async addJob(jobDetails: Partial<Job> & Record<string, unknown>): Promise<Job> {
     // Simulate network
    const db = initDb();
    
    // Copy the exact logic from store.ts for creating a new job
    const pDate = jobDetails.pickupScheduledAt || jobDetails.scheduledAt || new Date();
    const dDate = jobDetails.deliveryScheduledAt || new Date(pDate.getTime() + 86400000); // +1 day default
    const pRider = jobDetails.pickupRiderId;
    const dRider = jobDetails.deliveryRiderId;

    const isPOS = (jobDetails.source || jobDetails.source) === "pos";
    // CSO creates as TBA (hidden from Manager), Manager/Admin creates as Pending.
    // If a rider is assigned during creation, initialize as Pending.
    const creatorRole = (jobDetails as any).creatorRole;
    const initialStatus = jobDetails.status || (isPOS ? "billing" : (
      (creatorRole === 'manager' || creatorRole === 'admin' || jobDetails.pickupRiderId || jobDetails.deliveryRiderId) 
        ? 'pending' 
        : 'tba'
    ));
    const legStatus = (leg: "pickup" | "delivery") => {
      if (isPOS && leg === "pickup") return "completed";
      return "pending";
    };

    const newJob: Job = {
      id: `JOB-${String(db.jobs.length + 1).padStart(3, "0")}`,
      type: jobDetails.type as any || "full_service",
      customerId: jobDetails.customerId,
      customerName: jobDetails.customerName,
      customerPhone: jobDetails.customerPhone,
      pickupLocation: jobDetails.pickupLocation || "",
      dropoffLocation: jobDetails.dropoffLocation || "",
      pickupCoords: jobDetails.pickupCoords || { lat: 0, lng: 0 },
      dropoffCoords: jobDetails.dropoffCoords || { lat: 0, lng: 0 },
      distance: jobDetails.distance || 0,
      fee: jobDetails.fee || 0,
      status: initialStatus,
      subStatus: jobDetails.subStatus as any,
      createdAt: new Date(),
      scheduledAt: pDate,
      pickupRiderId: pRider,
      deliveryRiderId: dRider,
      pickupScheduledAt: pDate,
      pickupScheduledEndAt: jobDetails.pickupScheduledEndAt as Date | undefined,
      deliveryScheduledAt: dDate,
      deliveryScheduledEndAt: jobDetails.deliveryScheduledEndAt as Date | undefined,
      bagImageUrl: jobDetails.bagImageUrl,
      billImageUrl: jobDetails.billImageUrl as string | undefined,
      serviceType: jobDetails.serviceType || "wash_fold",
      laundryTypes: jobDetails.laundryTypes as string[] | undefined,
      source: jobDetails.source || "app",
      totalAmount: jobDetails.totalAmount || ((jobDetails.fee || 0) * 2.5),
      discount: jobDetails.discount || 0,
      discountPercent: jobDetails.discountPercent || 0,
      paymentMethod: jobDetails.paymentMethod as any,
      isPaid: jobDetails.isPaid as boolean | false,
      pickupDistance: jobDetails.pickupDistance,
      deliveryDistance: jobDetails.deliveryDistance,
      pickupCommission: jobDetails.pickupCommission,
      deliveryCommission: jobDetails.deliveryCommission,
      items: jobDetails.items || [],
      riderId: pRider,
      remark: jobDetails.remark as string,
      adminNotesJson: jobDetails.adminNotesJson as string,
      branchId: jobDetails.branchId as string,
      paymentChannel: jobDetails.paymentChannel as string,
      createdBy: jobDetails.createdBy as string | null || null,
      cashPlaced: jobDetails.cashPlaced as boolean || false,
      shiftId: jobDetails.shiftId as string | null || null,
      walletBalanceAfter: jobDetails.walletBalanceAfter as number | null || null,
      legs: {
        pickupOutbound: { scheduledAt: pDate, status: legStatus("pickup"), riderId: pRider, completedAt: isPOS ? new Date() : undefined },
        pickupInbound: { scheduledAt: pDate, status: legStatus("pickup"), riderId: pRider, completedAt: isPOS ? new Date() : undefined },
        deliveryOutbound: { scheduledAt: dDate, status: legStatus("delivery"), riderId: dRider },
        deliveryInbound: { scheduledAt: dDate, status: legStatus("delivery"), riderId: dRider },
      }
    };

    const savedJobInDb = await dbActions.addJobAction({
      ...newJob,
      actorId: jobDetails.actorId,
      actorName: jobDetails.actorName
    });
    
    // Replace the fake ID with the real ID from DB
    const finalJob = { ...newJob, id: savedJobInDb.id };
    
    // Prune old entries
    for (const [key, value] of lastUpdatedJobs.entries()) {
      if (Date.now() - value > 60000) {
        lastUpdatedJobs.delete(key);
      }
    }
    lastUpdatedJobs.set(finalJob.id, Date.now());

    db.jobs = [finalJob, ...db.jobs];
    return finalJob as Job;
  },

  async updateJob(id: string, updates: Partial<Job>): Promise<Job> {
    
    const db = initDb();
    const jobIndex = db.jobs.findIndex(j => j.id === id);
    if (jobIndex === -1) throw new Error("Job not found");
    
    const existingJob = db.jobs[jobIndex];
    const finalUpdates = { ...updates };
    
    // Prevent accidental in-memory erasure of billNo by empty/undefined values if existingJob already has billNo
    if (updates.billNo !== undefined && (!updates.billNo || String(updates.billNo).trim() === '') && existingJob.billNo && String(existingJob.billNo).trim() !== '') {
      delete finalUpdates.billNo;
    }

    if (updates.status === undefined && existingJob.status === 'tba' && (updates.pickupRiderId || updates.deliveryRiderId)) {
      finalUpdates.status = 'pending';
    }
    
    const updatedJob = { ...existingJob, ...finalUpdates, updatedAt: new Date() };
    db.jobs.splice(jobIndex, 1);
    db.jobs.unshift(updatedJob);
    
    // Prune old entries
    for (const [key, value] of lastUpdatedJobs.entries()) {
      if (Date.now() - value > 60000) {
        lastUpdatedJobs.delete(key);
      }
    }
    lastUpdatedJobs.set(id, Date.now());

    await dbActions.updateJobAction(id, updates);
    return updatedJob;
  },

  /**
   * Update in-memory job state immediately (optimistic update) without
   * persisting to DB. Used to make UI respond instantly before the DB
   * round-trip completes.
   */
  optimisticUpdate(id: string, updates: Partial<Job>) {
    const db = initDb();
    const jobIndex = db.jobs.findIndex(j => j.id === id);
    if (jobIndex === -1) return;

    const existingJob = db.jobs[jobIndex];
    const updatedJob = { ...existingJob, ...updates, updatedAt: new Date() };
    db.jobs.splice(jobIndex, 1);
    db.jobs.unshift(updatedJob);
  },

  // --- SERVICES ---
  async getServices(): Promise<ServiceItem[]> {
    
    return initDb().services;
  },

  async addService(service: Omit<ServiceItem, 'id'>): Promise<ServiceItem> {
    
    const db = initDb();
    const newService = {
      ...service,
      id: getServiceSKU({ ...service, id: "" } as ServiceItem, db.services),
    };
    db.services = [newService, ...db.services];
    await dbActions.addServiceAction(newService);
    return newService;
  },

  async updateService(id: string, updates: Partial<ServiceItem>): Promise<ServiceItem> {
    
    const db = initDb();
    let updatedService: ServiceItem | null = null;
    db.services = db.services.map(s => {
      if (s.id === id) {
        updatedService = { ...s, ...updates };
        return updatedService;
      }
      return s;
    });
    if (!updatedService) throw new Error("Service not found");
    await dbActions.updateServiceAction(id, updates);
    return updatedService;
  },

  async deleteService(id: string): Promise<void> {
    
    const db = initDb();
    db.services = db.services.filter(s => s.id !== id);
    await dbActions.deleteServiceAction(id);
  },

  // --- RIDERS ---
  async getRiders(): Promise<Rider[]> {
    
    return initDb().riders;
  },

  async updateRider(id: string, updates: Partial<Rider>): Promise<Rider> {
    
    const db = initDb();
    let updatedRider: Rider | null = null;
    db.riders = db.riders.map(r => {
      if (r.id === id) {
        updatedRider = { ...r, ...updates };
        return updatedRider;
      }
      return r;
    });
    if (!updatedRider) throw new Error("Rider not found");
    await dbActions.updateRiderAction(id, updates);
    return updatedRider;
  },

  async addRider(rider: Omit<Rider, 'id'> & { id?: string }): Promise<Rider> {
    
    const db = initDb();
    const newRider = {
      ...rider,
      id: rider.id || `RIDER-${String(db.riders.length + 1).padStart(3, "0")}`,
    } as Rider;
    db.riders = [newRider, ...db.riders];
    await dbActions.addRiderAction(newRider);
    return newRider;
  },

  async deleteRider(id: string): Promise<void> {
    
    const db = initDb();
    db.riders = db.riders.filter(r => r.id !== id);
    await dbActions.deleteRiderAction(id);
  },

  // --- PRICE LISTS ---
  async getPriceLists(): Promise<PriceList[]> {
    
    return initDb().priceLists;
  },

  async addPriceList(list: Omit<PriceList, 'id'>): Promise<PriceList> {
    
    const db = initDb();
    const newList = {
      ...list,
      id: `PL-${Date.now().toString(36).toUpperCase()}`,
    };
    db.priceLists = [...db.priceLists, newList];
    await dbActions.addPriceListAction(newList);
    return newList;
  },

  async updatePriceList(id: string, updates: Partial<PriceList>): Promise<PriceList> {
    
    const db = initDb();
    let updatedList: PriceList | null = null;
    db.priceLists = db.priceLists.map(p => {
      if (p.id === id) {
        updatedList = { ...p, ...updates };
        return updatedList;
      }
      return p;
    });
    if (!updatedList) throw new Error("Price list not found");
    await dbActions.updatePriceListAction(id, updates);
    return updatedList;
  },

  async deletePriceList(id: string): Promise<void> {
    
    const db = initDb();
    db.priceLists = db.priceLists.filter(p => p.id !== id);
    // Reset customers using this price list to regular
    db.customers = db.customers.map(c => c.priceListId === id ? { ...c, priceListId: "regular" } : c);
    await dbActions.deletePriceListAction(id);
  },

  // --- AUTH/STORE SYNC UTILS ---
  // These synchronous methods let our useSyncExternalStore wrapper fetch the current local DB state
  // without promises, so the UI can hydrate instantly if data is in localStorage.
  sync: {
    getCustomers: () => initDb().customers,
    getJobs: () => initDb().jobs,
    getServices: () => initDb().services,
    getRiders: () => initDb().riders,
    getPriceLists: () => initDb().priceLists,
    getShopLocations: () => initDb().shopLocations,
    getPOIs: () => initDb().pois,
    getSettings: () => initDb().settings,
  },

  // --- SHOP LOCATIONS ---
  async getShopLocations() {
    
    return initDb().shopLocations;
  },
  async addShopLocation(shop: Omit<ShopLocation, 'id'>) {
    const db = initDb();
    const newShop = {
      ...shop,
      id: `SHOP-${Date.now().toString(36).toUpperCase()}`,
    } as ShopLocation;
    db.shopLocations = [...db.shopLocations, newShop];
    await dbActions.addShopLocationAction(newShop);
    return newShop;
  },
  async updateShopLocation(id: string, updates: Partial<ShopLocation>) {
    const db = initDb();
    let updatedShop = null;
    db.shopLocations = db.shopLocations.map(s => {
      if (s.id === id) {
        updatedShop = { ...s, ...updates } as ShopLocation;
        return updatedShop;
      }
      return s;
    });
    if (!updatedShop) throw new Error("Shop not found");
    await dbActions.updateShopLocationAction(id, updates);
    return updatedShop;
  },
  async deleteShopLocation(id: string) {
    
    const db = initDb();
    db.shopLocations = db.shopLocations.filter(s => s.id !== id);
    await dbActions.deleteShopLocationAction(id);
  },

  // --- SETTINGS ---
  async getSettings(): Promise<Record<string, string>> {
    
    return initDb().settings;
  },

  async updateSetting(key: string, value: string): Promise<Record<string, string>> {
    
    const db = initDb();
    db.settings = { ...db.settings, [key]: value };
    await dbActions.updateSettingAction(key, value);
    return db.settings;
  },

  // --- POIS ---
  async getPOIs() {
    
    return initDb().pois;
  },
  async addPOI(poi: Omit<{ id: string; name: string; address: string; coords: { lat: number; lng: number }, placeId?: string }, 'id'>) {
    const db = initDb();
    const newPoi = { ...poi, id: `POI-${Date.now().toString(36).toUpperCase()}` };
    db.pois = [...db.pois, newPoi];
    await dbActions.addPOIAction(newPoi);
    return newPoi;
  },
  async updatePOI(id: string, updates: Partial<{ id: string; name: string; address: string; coords: { lat: number; lng: number }, placeId?: string }>) {
    const db = initDb();
    let updatedPoi = null;
    db.pois = db.pois.map(p => {
      if (p.id === id) {
        updatedPoi = { ...p, ...updates };
        return updatedPoi;
      }
      return p;
    });
    if (!updatedPoi) throw new Error("POI not found");
    await dbActions.updatePOIAction(id, updates);
    return updatedPoi;
  },
  async deletePOI(id: string) {
    const db = initDb();
    db.pois = db.pois.filter(p => p.id !== id);
    await dbActions.deletePOIAction(id);
  },
  async getActiveCashierShift(userId: string) {
    return dbActions.getOpenShiftAction(userId);
  },
  async getBranchActiveCashierShift(branchId: string) {
    return dbActions.getBranchOpenShiftAction(branchId);
  },
  async getShiftStatus(userId: string, branchId?: string) {
    return dbActions.getShiftStatusAction(userId, branchId);
  },
  async openCashierShift(userId: string, userName: string, branchId: string, startingCash: number, notes?: string) {
    const res = await dbActions.openShiftAction({
      userId,
      userName,
      branchId,
      startingCash
    });
    if (!res.success) throw new Error(res.error || "Failed to open shift");
    return res.shift;
  },
  async closeCashierShift(id: string, actualCash: number, notes?: string) {
    const res = await dbActions.closeShiftAction({
      shiftId: id,
      actualCash,
      notes
    });
    if (!res.success) throw new Error(res.error || "Failed to close shift");
    return res.shift;
  },
  async getClosedCashierShifts(tenantId?: string) {
    return dbActions.getClosedShiftsAction();
  },
  async getOpenCashierShifts() {
    return dbActions.getOpenShiftsAction();
  }
};
