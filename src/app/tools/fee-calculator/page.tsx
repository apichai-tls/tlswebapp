"use client";

import { useState, useSyncExternalStore, useMemo, useDeferredValue, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Calculator, MapPin, Search, Store, Navigation, Database, Plus } from "lucide-react";
import { poiStore, shopStore, calculateFee, type ShopLocation, type POI, type LatLng } from "@/lib/store";
import { getClosestShopByRoute } from "@/lib/map-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocationInput } from "@/components/location-input";
import { toast } from "sonner";

// Dynamically import Map to avoid SSR issues
const CreateJobMap = dynamic(
  () => import("@/components/create-job-map").then((mod) => mod.CreateJobMap),
  { ssr: false, loading: () => <div className="h-full w-full bg-slate-100 animate-pulse rounded-xl" /> }
);

export default function FeeCalculatorPage() {
  const pois = useSyncExternalStore(poiStore.subscribe, poiStore.getSnapshot, poiStore.getSnapshot);
  const shops = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);


  const [pickupSearchQuery, setPickupSearchQuery] = useState("");
  const [deliverySearchQuery, setDeliverySearchQuery] = useState("");
  const [selectedShopId, setSelectedShopId] = useState<string>("");
  const [pickupLoc, setPickupLoc] = useState<{ name: string; address: string; coords: LatLng; placeId?: string } | null>(null);
  const [deliveryLoc, setDeliveryLoc] = useState<{ name: string; address: string; coords: LatLng; placeId?: string } | null>(null);
  const [isDeliveryDirty, setIsDeliveryDirty] = useState(false);
  
  const [pickupDist, setPickupDist] = useState<number>(0);
  const [deliveryDist, setDeliveryDist] = useState<number>(0);
  const [isCalculatingShop, setIsCalculatingShop] = useState(false);
  const [isAutoSelectShop, setIsAutoSelectShop] = useState(true);
  
  const [isPickup, setIsPickup] = useState(true);
  const [isDelivery, setIsDelivery] = useState(true);
  const [isVip, setIsVip] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Set default shop if none selected
  const activeShop = useMemo(() => {
    if (selectedShopId) return shops.find(s => s.id === selectedShopId) || shops[0];
    return shops[0];
  }, [shops, selectedShopId]);

  const getGoogleMapsUrl = (loc: { name: string; address: string; coords: LatLng; placeId?: string }) => {
    if (loc.address?.startsWith('http')) return loc.address;
    if (loc.placeId) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.name)}&query_place_id=${loc.placeId}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.name)}`;
  };

  const roundHalfUp = (val: number) => Math.ceil(val * 2) / 2;

  const fee = useMemo(() => {
    let total = 0;
    const ratePerKm = isVip ? 4 : 10;
    if (isPickup && pickupDist > 0) total += roundHalfUp(pickupDist * 2) * ratePerKm;
    if (isDelivery && deliveryDist > 0) total += roundHalfUp(deliveryDist) * ratePerKm;
    return Math.max(isPickup || isDelivery ? 30 : 0, total);
  }, [pickupDist, deliveryDist, isPickup, isDelivery, isVip]);

  const localDataForSearch = useMemo(() => {
    return pois.map(p => ({
      name: p.name,
      address: p.address,
      lat: p.coords.lat,
      lng: p.coords.lng,
      placeId: p.placeId || p.id,
      isLocal: true
    }));
  }, [pois]);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 lg:p-8 flex flex-col h-screen overflow-hidden">
        <div className="mb-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-slate-200 rounded-2xl animate-pulse"></div>
            <div>
              <div className="h-8 w-64 bg-slate-200 rounded-lg animate-pulse mb-2"></div>
              <div className="h-4 w-96 bg-slate-200 rounded-lg animate-pulse"></div>
            </div>
          </div>
        </div>
        <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
          <div className="w-full lg:w-[400px] bg-slate-200 rounded-3xl animate-pulse"></div>
          <div className="flex-1 bg-slate-200 rounded-3xl animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8 flex flex-col h-screen overflow-hidden">
      <div className="mb-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/admin" className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl hover:bg-indigo-200 transition-colors cursor-pointer block">
            <Calculator size={28} />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Delivery Fee Calculator</h1>
            <p className="text-sm font-medium text-slate-500">Search locations and calculate precise delivery fees based on real routing.</p>
          </div>
        </div>
        <Link href="/tools/poi-importer">
          <Button variant="outline" className="h-10 md:h-12 px-4 md:px-6 border-slate-300 font-bold bg-white hover:bg-slate-50">
            <Database size={18} className="mr-2 hidden md:block" />
            Manage POIs
          </Button>
        </Link>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
        {/* Left Panel: Location Search */}
        <div className="w-full lg:w-[350px] flex flex-col shrink-0">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-5 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"><MapPin size={12} className="text-emerald-500" /> Pickup Location</label>
              <LocationInput 
                id="pickup-location"
                placeholder="Type pickup address..."
                value={pickupSearchQuery}
                localData={localDataForSearch}
                onChange={setPickupSearchQuery}
                onSelectLocation={async (loc) => {
                  setPickupSearchQuery(loc.name);
                  const newCoords = { lat: loc.lat, lng: loc.lng };
                  setPickupLoc({
                    name: loc.name,
                    address: loc.address || loc.name,
                    coords: newCoords,
                    placeId: loc.placeId
                  });
                  if (!isDeliveryDirty) {
                    setDeliverySearchQuery(loc.name);
                    setDeliveryLoc({
                      name: loc.name,
                      address: loc.address || loc.name,
                      coords: newCoords,
                      placeId: loc.placeId
                    });
                  }
                  if (isAutoSelectShop) {
                    setIsCalculatingShop(true);
                    try {
                      const closestShopId = await getClosestShopByRoute(newCoords, shops);
                      if (closestShopId) setSelectedShopId(closestShopId);
                    } finally {
                      setIsCalculatingShop(false);
                    }
                  }
                }}
                className="[&_input]:h-10 [&_input]:rounded-xl [&_input]:shadow-sm"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"><Navigation size={12} className="text-indigo-500" /> Delivery Location</label>
              <LocationInput 
                id="delivery-location"
                placeholder="Type delivery address..."
                value={deliverySearchQuery}
                localData={localDataForSearch}
                onChange={(val) => { setDeliverySearchQuery(val); setIsDeliveryDirty(true); }}
                onSelectLocation={async (loc) => {
                  setIsDeliveryDirty(true);
                  setDeliverySearchQuery(loc.name);
                  setDeliveryLoc({
                    name: loc.name,
                    address: loc.address || loc.name,
                    coords: { lat: loc.lat, lng: loc.lng },
                    placeId: loc.placeId
                  });
                }}
                className="[&_input]:h-10 [&_input]:rounded-xl [&_input]:shadow-sm"
              />
            </div>
          </div>
        </div>

        {/* Right Panel: Map & Result */}
        <div className="flex-1 flex flex-col gap-6 min-h-0">
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <Store className="text-emerald-500 shrink-0" size={20} />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <label className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Origin Branch
                    {isCalculatingShop && <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>}
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={isAutoSelectShop}
                      onChange={async (e) => {
                        const checked = e.target.checked;
                        setIsAutoSelectShop(checked);
                        if (checked && pickupLoc) {
                          setIsCalculatingShop(true);
                          try {
                            const closestShopId = await getClosestShopByRoute(pickupLoc.coords, shops);
                            if (closestShopId) setSelectedShopId(closestShopId);
                          } finally {
                            setIsCalculatingShop(false);
                          }
                        }
                      }}
                      className="w-3 h-3 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span className="text-[10px] font-bold text-slate-500 hover:text-slate-700">Auto Nearest</span>
                  </label>
                </div>
                <select 
                  className="w-full md:w-[250px] bg-slate-50 border border-slate-200 text-slate-900 text-sm font-bold rounded-lg focus:ring-emerald-500 focus:border-emerald-500 block p-2.5"
                  value={selectedShopId}
                  onChange={(e) => {
                    setSelectedShopId(e.target.value);
                    setIsAutoSelectShop(false);
                  }}
                >
                  {shops.map(shop => (
                    <option key={shop.id} value={shop.id}>{shop.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4 w-full md:w-auto">
              <label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
                <input 
                  type="checkbox" 
                  checked={isPickup}
                  onChange={(e) => setIsPickup(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 h-4 w-4"
                />
                <span className="text-sm font-bold text-slate-700">ไปรับ (Pickup){pickupDist > 0 && <span className="text-xs font-medium text-slate-400 ml-1">• {roundHalfUp(pickupDist * 2).toFixed(1)} km</span>}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
                <input 
                  type="checkbox" 
                  checked={isDelivery}
                  onChange={(e) => setIsDelivery(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 h-4 w-4"
                />
                <span className="text-sm font-bold text-slate-700">ไปส่ง (Delivery){deliveryDist > 0 && <span className="text-xs font-medium text-slate-400 ml-1">• {roundHalfUp(deliveryDist).toFixed(1)} km</span>}</span>
              </label>
              <div className="w-px bg-slate-200 h-6 mx-1 hidden md:block"></div>
              <label className="flex items-center gap-2 cursor-pointer bg-amber-50 px-3 py-2 rounded-lg border border-amber-200 hover:bg-amber-100 transition-colors">
                <input 
                  type="checkbox" 
                  checked={isVip}
                  onChange={(e) => setIsVip(e.target.checked)}
                  className="rounded border-amber-400 text-amber-500 focus:ring-amber-500 h-4 w-4"
                />
                <span className="text-sm font-black text-amber-700 uppercase tracking-wide">VIP</span>
              </label>
            </div>

            <div className="flex gap-6 w-full md:w-auto justify-between md:justify-end">
              <div className="text-right">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Distance</div>
                <div className="text-xl font-black text-slate-900">
                  {(pickupDist > 0 || deliveryDist > 0) && (isPickup || isDelivery) 
                    ? `${((isPickup ? roundHalfUp(pickupDist * 2) : 0) + (isDelivery ? roundHalfUp(deliveryDist) : 0)).toFixed(1)} km` 
                    : '-'}
                </div>
              </div>
              <div className="w-px bg-slate-200 h-10 hidden md:block"></div>
              <div className="text-right">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Delivery Fee</div>
                <div className="text-2xl font-black text-indigo-600">{fee > 0 ? `฿${fee.toLocaleString()}` : '-'}</div>
              </div>
            </div>
          </div>

          <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative">
            {!(pickupLoc || deliveryLoc) ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                <Navigation size={48} className="mb-4 opacity-20" />
                <h3 className="text-lg font-bold text-slate-600 mb-1">Select a Destination</h3>
                <p className="text-sm font-medium">Search or click a location from the list to calculate the route.</p>
              </div>
            ) : (
              <CreateJobMap
                branchCoords={activeShop?.coords || { lat: 13.7367, lng: 100.5231 }}
                pickupCoords={pickupLoc?.coords || null}
                deliveryCoords={deliveryLoc?.coords || null}
                onMarkerDrag={async (type, coords) => {
                  if (type === 'pickup') {
                    setPickupLoc(prev => {
                      if (!prev) return null;
                      const newLoc = { ...prev, coords };
                      if (!isDeliveryDirty) setDeliveryLoc(newLoc);
                      return newLoc;
                    });
                    if (isAutoSelectShop) {
                      setIsCalculatingShop(true);
                      try {
                        const closestShopId = await getClosestShopByRoute(coords, shops);
                        if (closestShopId) setSelectedShopId(closestShopId);
                      } finally {
                        setIsCalculatingShop(false);
                      }
                    }
                  } else if (type === 'delivery') {
                    setIsDeliveryDirty(true);
                    setDeliveryLoc(prev => prev ? { ...prev, coords } : null);
                  }
                }}
                onDistanceCalculated={(pDist, dDist) => {
                  setPickupDist(pDist);
                  setDeliveryDist(dDist);
                }}
                className="w-full h-full"
              />
            )}
            
            {(pickupLoc || deliveryLoc) && (
              <div className="absolute top-4 left-4 z-[400] bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-lg border border-slate-200 max-w-sm space-y-3">
                {pickupLoc && (
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 p-1.5 bg-emerald-100 text-emerald-600 rounded-lg shrink-0">
                      <MapPin size={16} />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-900 text-sm leading-tight">Pickup: {pickupLoc.name}</h4>
                      {!pickupLoc.address?.startsWith('http') && (
                        <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 break-all">{pickupLoc.address}</p>
                      )}
                      <a 
                        href={getGoogleMapsUrl(pickupLoc)} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors w-full justify-center"
                      >
                        <MapPin size={12} /> Open in Google Maps
                      </a>
                      
                      {!pois.some(p => p.name === pickupLoc.name) && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="mt-3 h-7 text-[10px] font-bold px-2.5 rounded-lg border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 w-full"
                          onClick={async () => {
                            try {
                              await poiStore.addPOI({
                                name: pickupLoc.name,
                                address: pickupLoc.address,
                                coords: pickupLoc.coords,
                                placeId: pickupLoc.placeId
                              });
                              toast.success("Pickup location saved to database!");
                            } catch (err: any) {
                              toast.error(err.message || "Failed to save location");
                            }
                          }}
                        >
                          <Plus size={12} className="mr-1" /> Save Pickup Location
                        </Button>
                      )}
                    </div>
                  </div>
                )}
                {deliveryLoc && (
                  <div className={`flex items-start gap-3 ${pickupLoc ? 'pt-3 border-t border-slate-100' : ''}`}>
                    <div className="mt-0.5 p-1.5 bg-indigo-100 text-indigo-600 rounded-lg shrink-0">
                      <Navigation size={16} />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-900 text-sm leading-tight">Delivery: {deliveryLoc.name}</h4>
                      {!deliveryLoc.address?.startsWith('http') && (
                        <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 break-all">{deliveryLoc.address}</p>
                      )}
                      <a 
                        href={getGoogleMapsUrl(deliveryLoc)} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors w-full justify-center"
                      >
                        <MapPin size={12} /> Open in Google Maps
                      </a>
                      
                      {!pois.some(p => p.name === deliveryLoc.name) && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="mt-3 h-7 text-[10px] font-bold px-2.5 rounded-lg border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 w-full"
                          onClick={async () => {
                            try {
                              await poiStore.addPOI({
                                name: deliveryLoc.name,
                                address: deliveryLoc.address,
                                coords: deliveryLoc.coords,
                                placeId: deliveryLoc.placeId
                              });
                              toast.success("Delivery location saved to database!");
                            } catch (err: any) {
                              toast.error(err.message || "Failed to save location");
                            }
                          }}
                        >
                          <Plus size={12} className="mr-1" /> Save Delivery Location
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
