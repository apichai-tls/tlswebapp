import mockDb from './data/mock-db.json';
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
  pois: { id: string; name: string; address: string; coords: { lat: number; lng: number } }[];
  settings: Record<string, string>;
}

// In-memory cache for fast sync reads, initialized lazily on client
let memoryDb: Database | null = null;
let isDbLoaded = false;

// Initialize the database from server
export const ensureDbLoaded = async () => {
  if (isDbLoaded) return;
  if (typeof window === 'undefined') return;

  try {
    const res = await fetch('/api/db');
    if (res.ok) {
      const data = await res.json();
      const parsed = JSON.parse(JSON.stringify(data), dateReviver);
      memoryDb = parseMockDb(parsed);
      isDbLoaded = true;
      
      // Trigger a re-render for all components using useSyncExternalStore
      // We do this by importing emitAllChanges dynamically to avoid circular dependency issues during load
      import('./store').then(m => m.emitAllChanges());
    }
  } catch (error) {
    console.error('Failed to load DB from server', error);
  }
};

// Start loading the DB immediately if we're on the client
if (typeof window !== 'undefined') {
  ensureDbLoaded();
}

let fallbackDb: Database | null = null;
const initDb = (): Database => {
  if (!memoryDb) {
    // Return a stable reference to mockDb as a fallback until the server data loads
    // This fixes the "getServerSnapshot should be cached" SSR infinite loop warning
    if (!fallbackDb) fallbackDb = parseMockDb(mockDb);
    return fallbackDb;
  }
  return memoryDb;
};

// Helper to save to server
const saveDb = async (db: Database) => {
  memoryDb = db;
  if (typeof window !== 'undefined') {
    try {
      await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(db)
      });
    } catch (error) {
      console.error('Failed to save DB to server', error);
    }
  }
};

// JSON Reviver to convert ISO string dates back to Date objects
const dateReviver = (key: string, value: unknown) => {
  const isDateKey = key.includes('At') || key === 'date';
  if (typeof value === 'string' && isDateKey && !isNaN(Date.parse(value))) {
    return new Date(value);
  }
  return value;
};

// Parse initial mock db and convert date strings to Date objects
const parseMockDb = (data: unknown): Database => {
  const db = JSON.parse(JSON.stringify(data), dateReviver) as Database;
  if (!db.priceLists || db.priceLists.length === 0) {
    db.priceLists = [{
      id: "regular",
      name: "Regular (Standard Pricing)",
      isDefault: true,
      servicePrices: {}
    }];
  }
  if (!db.shopLocations || db.shopLocations.length === 0) {
    db.shopLocations = [
      {
        id: "shop-main",
        name: "Main branch",
        address: "220/13, Sukhumvit 1/1, Sukhumvit Road, North Klongtoey, Wattana, Bangkok 10110.",
        coords: { lat: 13.7417, lng: 100.5526 }
      },
      {
        id: "shop-head",
        name: "Head Office",
        address: "12/500, 15 Sukhumvit Residences, G/F, Sukhumvit 15, North Klongtoey Wattana, Bangkok 10110.",
        coords: { lat: 13.7438, lng: 100.5583 }
      },
      {
        id: "shop-rhythm",
        name: "Rhythm Asoke",
        address: "299/1, Rhythm Asoke, Asoke Din-Deang Road, Makkasan, Ratchathewi Bangkok 10400",
        coords: { lat: 13.7540, lng: 100.5645 }
      }
    ];
  }
  if (db.customers) {
    db.customers = db.customers.map(c => ({
      ...c,
      priceListId: c.priceListId || "regular",
      creditBalance: c.creditBalance || 0
    }));
  }
  if (!db.settings) {
    db.settings = {};
  }
  if (!db.pois) {
    db.pois = [];
  }
  return db;
};

// --- API METHODS ---

export const api = {
  // --- CUSTOMERS ---
  async getCustomers(): Promise<Customer[]> {
    await delay();
    return initDb().customers;
  },
  
  async addCustomer(customer: Omit<Customer, 'id'>): Promise<Customer> {
    await delay();
    const db = initDb();
    const newCustomer = {
      ...customer,
      id: `CUST-${String(db.customers.length + 1).padStart(3, "0")}`,
    };
    db.customers = [newCustomer, ...db.customers];
    saveDb(db);
    return newCustomer;
  },

  async updateCustomer(id: string, updates: Partial<Customer>): Promise<Customer> {
    await delay();
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
    saveDb(db);
    return updatedCustomer;
  },

  async deleteCustomer(id: string): Promise<void> {
    await delay();
    const db = initDb();
    db.customers = db.customers.filter(c => c.id !== id);
    saveDb(db);
  },

  // --- JOBS ---
  async getJobs(): Promise<Job[]> {
    await delay();
    return initDb().jobs;
  },

  async addJob(jobDetails: Partial<Job> & Record<string, unknown>): Promise<Job> {
    await delay(800); // Simulate network
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
      pickupLocation: jobDetails.pickupLocation,
      dropoffLocation: jobDetails.dropoffLocation,
      pickupCoords: jobDetails.pickupCoords,
      dropoffCoords: jobDetails.dropoffCoords,
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
      totalAmount: jobDetails.totalAmount || (jobDetails.fee * 2.5),
      discount: jobDetails.discount || 0,
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
    saveDb(db);
    return newJob;
  },

  async updateJob(id: string, updates: Partial<Job>): Promise<Job> {
    await delay();
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
    saveDb(db);
    return updatedJob;
  },

  // --- SERVICES ---
  async getServices(): Promise<ServiceItem[]> {
    await delay(300);
    return initDb().services;
  },

  // --- RIDERS ---
  async getRiders(): Promise<Rider[]> {
    await delay(300);
    return initDb().riders;
  },

  async updateRider(id: string, updates: Partial<Rider>): Promise<Rider> {
    await delay();
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
    saveDb(db);
    return updatedRider;
  },

  // --- PRICE LISTS ---
  async getPriceLists(): Promise<PriceList[]> {
    await delay(200);
    return initDb().priceLists;
  },

  async addPriceList(list: Omit<PriceList, 'id'>): Promise<PriceList> {
    await delay(300);
    const db = initDb();
    const newList = {
      ...list,
      id: `PL-${Date.now().toString(36).toUpperCase()}`,
    };
    db.priceLists = [...db.priceLists, newList];
    saveDb(db);
    return newList;
  },

  async updatePriceList(id: string, updates: Partial<PriceList>): Promise<PriceList> {
    await delay(300);
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
    saveDb(db);
    return updatedList;
  },

  async deletePriceList(id: string): Promise<void> {
    await delay(300);
    const db = initDb();
    db.priceLists = db.priceLists.filter(p => p.id !== id);
    // Reset customers using this price list to regular
    db.customers = db.customers.map(c => c.priceListId === id ? { ...c, priceListId: "regular" } : c);
    saveDb(db);
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
    await delay(200);
    return initDb().shopLocations;
  },
  async addShopLocation(shop: Omit<{ id: string; name: string; address: string; coords: { lat: number; lng: number } }, 'id'>) {
    await delay(300);
    const db = initDb();
    const newShop = {
      ...shop,
      id: `SHOP-${Date.now().toString(36).toUpperCase()}`,
    };
    db.shopLocations = [...db.shopLocations, newShop];
    saveDb(db);
    return newShop;
  },
  async updateShopLocation(id: string, updates: Partial<{ id: string; name: string; address: string; coords: { lat: number; lng: number } }>) {
    await delay(300);
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
    saveDb(db);
    return updatedShop;
  },
  async deleteShopLocation(id: string) {
    await delay(300);
    const db = initDb();
    db.shopLocations = db.shopLocations.filter(s => s.id !== id);
    saveDb(db);
  },

  // --- SETTINGS ---
  async getSettings(): Promise<Record<string, string>> {
    await delay(100);
    return initDb().settings;
  },

  async updateSetting(key: string, value: string): Promise<Record<string, string>> {
    await delay(200);
    const db = initDb();
    db.settings = { ...db.settings, [key]: value };
    saveDb(db);
    return db.settings;
  },

  // --- POIS ---
  async getPOIs() {
    await delay(100);
    return initDb().pois;
  },
  async addPOI(poi: Omit<{ id: string; name: string; address: string; coords: { lat: number; lng: number } }, 'id'>) {
    const db = initDb();
    const newPoi = { ...poi, id: `POI-${Date.now().toString(36).toUpperCase()}` };
    db.pois = [...db.pois, newPoi];
    saveDb(db);
    return newPoi;
  },
  async updatePOI(id: string, updates: Partial<{ id: string; name: string; address: string; coords: { lat: number; lng: number } }>) {
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
    saveDb(db);
    return updatedPoi;
  },
  async deletePOI(id: string) {
    const db = initDb();
    db.pois = db.pois.filter(p => p.id !== id);
    saveDb(db);
  }
};
