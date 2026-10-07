export interface DbCacheState {
  payload: any | null;
  lastTime: number;
  etag: string | null;
  version: number;
  riderEarnings: {
    lifetimeEarnings: any[];
    monthEarnings: any[];
    completedJobsCounts: any[];
  } | null;
  lastRiderEarningsTime: number;
  masterData: {
    services: any[];
    priceListsRaw: any[];
    shopLocations: any[];
    settingsRaw: any[];
  } | null;
  lastMasterDataTime: number;
  customers: any[] | null;
  lastCustomersTime: number;
}

const globalForCache = globalThis as unknown as {
  __tlsDbCache?: DbCacheState;
};

export const dbCache: DbCacheState = globalForCache.__tlsDbCache || {
  payload: null,
  lastTime: 0,
  etag: null,
  version: 1,
  riderEarnings: null,
  lastRiderEarningsTime: 0,
  masterData: null,
  lastMasterDataTime: 0,
  customers: null,
  lastCustomersTime: 0,
};

if (process.env.NODE_ENV !== 'production') {
  globalForCache.__tlsDbCache = dbCache;
}

export function invalidateDbCache() {
  dbCache.payload = null;
  dbCache.lastTime = 0;
  dbCache.customers = null;
  dbCache.lastCustomersTime = 0;
  dbCache.masterData = null;
  dbCache.lastMasterDataTime = 0;
  dbCache.version++;
  dbCache.etag = `W/"v${dbCache.version}-${Date.now()}"`;
}
