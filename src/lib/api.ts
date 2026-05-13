import * as dbActions from '@/actions/db';
import type { Customer, Job, Rider, ServiceItem, PriceList } from './store'; // we'll use types from store.ts for now

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
  shopLocations: { id: string; name: string; address: string; coords: { lat: number; lng: number } }[];
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
  try {
    const cache = await caches.open('tls-cache');
    const cachedRes = await cache.match('/api/db-cache');
    if (cachedRes) {
      const cached = await cachedRes.json();
      const parsed = JSON.parse(JSON.stringify(cached), dateReviver);
      memoryDb = parseMockDb(parsed);
      isDbLoaded = true;
      import('./store').then(m => m.emitAllChanges());
    }
  } catch(e) {
    console.error('Failed to load from Cache API', e);
  }

  try {
    const res = await fetch('/api/db');
    if (res.ok) {
      const data = await res.json();
      
      // Save to Cache Storage for next refresh
      try {
        const cache = await caches.open('tls-cache');
        await cache.put('/api/db-cache', new Response(JSON.stringify(data)));
      } catch (e) {
        console.error('Failed to save to Cache API', e);
      }

      const parsed = JSON.parse(JSON.stringify(data), dateReviver);
      memoryDb = parseMockDb(parsed);
      isDbLoaded = true;
      
      // Trigger a re-render for all components using useSyncExternalStore
      import('./store').then(m => m.emitAllChanges());

      // Background lazy load POIs
      fetch('/api/pois')
        .then(r => r.json())
        .then(poiData => {
          if (memoryDb) {
            const parsedPois = JSON.parse(JSON.stringify(poiData), dateReviver);
            memoryDb.pois = parsedPois;
            import('./store').then(m => m.emitAllChanges());
          }
        })
        .catch(err => console.error("Failed to load POIs in background", err));
    }
  } catch (error) {
    console.error('Failed to load DB from server', error);
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

// --- API METHODS ---

export const api = {
  // --- CUSTOMERS ---
  async getCustomers(): Promise<Customer[]> {
    
    return initDb().customers;
  },
  
  async addCustomer(customer: Omit<Customer, 'id'>): Promise<Customer> {
    
    const db = initDb();
    const newCustomer = {
      ...customer,
      id: `CUST-${String(db.customers.length + 1).padStart(3, "0")}`,
    };
    db.customers = [newCustomer, ...db.customers];
    await dbActions.addCustomerAction(newCustomer);
    return newCustomer;
  },

  async updateCustomer(id: string, updates: Partial<Customer>): Promise<Customer> {
    
    const db = initDb();
    let updatedCustomer: Customer | null = null;
    db.customers = db.customers.map(c => {
      if (c.id === id) {
        updatedCustomer = { ...c, ...updates };
        return updatedCustomer;
      }
      return c;
    });
    if (!updatedCustomer) throw new Error("Customer not found");
    await dbActions.updateCustomerAction(id, updates);
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
    const initialStatus = isPOS ? "active" : "pending";
    const legStatus = (leg: "pickup" | "delivery") => {
      if (isPOS && leg === "pickup") return "completed";
      return "pending";
    };

    const newJob: Job = {
      id: `JOB-${String(db.jobs.length + 1).padStart(3, "0")}`,
      type: "full_service",
      customerName: jobDetails.customerName,
      customerPhone: jobDetails.customerPhone,
      pickupLocation: jobDetails.pickupLocation || "",
      dropoffLocation: jobDetails.dropoffLocation || "",
      pickupCoords: jobDetails.pickupCoords || { lat: 0, lng: 0 },
      dropoffCoords: jobDetails.dropoffCoords || { lat: 0, lng: 0 },
      distance: jobDetails.distance || 0,
      fee: jobDetails.fee || 0,
      status: initialStatus,
      createdAt: new Date(),
      scheduledAt: pDate,
      pickupRiderId: pRider,
      deliveryRiderId: dRider,
      pickupScheduledAt: pDate,
      deliveryScheduledAt: dDate,
      bagImageUrl: jobDetails.bagImageUrl,
      serviceType: jobDetails.serviceType || "wash_fold",
      source: jobDetails.source || "app",
      totalAmount: jobDetails.totalAmount || ((jobDetails.fee || 0) * 2.5),
      discount: jobDetails.discount || 0,
      pickupDistance: jobDetails.pickupDistance,
      deliveryDistance: jobDetails.deliveryDistance,
      pickupCommission: jobDetails.pickupCommission,
      deliveryCommission: jobDetails.deliveryCommission,
      items: jobDetails.items || [],
      riderId: pRider,
      legs: {
        pickupOutbound: { scheduledAt: pDate, status: legStatus("pickup"), riderId: pRider, completedAt: isPOS ? new Date() : undefined },
        pickupInbound: { scheduledAt: pDate, status: legStatus("pickup"), riderId: pRider, completedAt: isPOS ? new Date() : undefined },
        deliveryOutbound: { scheduledAt: dDate, status: legStatus("delivery"), riderId: dRider },
        deliveryInbound: { scheduledAt: dDate, status: legStatus("delivery"), riderId: dRider },
      }
    };

    db.jobs = [newJob, ...db.jobs];
    await dbActions.addJobAction(newJob);
    return newJob;
  },

  async updateJob(id: string, updates: Partial<Job>): Promise<Job> {
    
    const db = initDb();
    let updatedJob: Job | null = null;
    db.jobs = db.jobs.map(j => {
      if (j.id === id) {
        updatedJob = { ...j, ...updates };
        return updatedJob;
      }
      return j;
    });
    if (!updatedJob) throw new Error("Job not found");
    await dbActions.updateJobAction(id, updates);
    return updatedJob;
  },

  // --- SERVICES ---
  async getServices(): Promise<ServiceItem[]> {
    
    return initDb().services;
  },

  async addService(service: Omit<ServiceItem, 'id'>): Promise<ServiceItem> {
    
    const db = initDb();
    const newService = {
      ...service,
      id: `SRV-${String(db.services.length + 1).padStart(3, "0")}`,
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
  async addShopLocation(shop: Omit<{ id: string; name: string; address: string; coords: { lat: number; lng: number } }, 'id'>) {
    
    const db = initDb();
    const newShop = {
      ...shop,
      id: `SHOP-${Date.now().toString(36).toUpperCase()}`,
    };
    db.shopLocations = [...db.shopLocations, newShop];
    await dbActions.addShopLocationAction(newShop);
    return newShop;
  },
  async updateShopLocation(id: string, updates: Partial<{ id: string; name: string; address: string; coords: { lat: number; lng: number } }>) {
    
    const db = initDb();
    let updatedShop = null;
    db.shopLocations = db.shopLocations.map(s => {
      if (s.id === id) {
        updatedShop = { ...s, ...updates };
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
  }
};
