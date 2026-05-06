"use client";

import { useState, useSyncExternalStore, useMemo, useDeferredValue } from "react";
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

  const [searchQuery, setSearchQuery] = useState("");
  const [googleSearchQuery, setGoogleSearchQuery] = useState("");
  const [selectedShopId, setSelectedShopId] = useState<string>("");
  const [targetLocation, setTargetLocation] = useState<{ name: string; address: string; coords: LatLng; placeId?: string } | null>(null);
  
  const [distanceKm, setDistanceKm] = useState<number>(0);
  const [isCalculatingShop, setIsCalculatingShop] = useState(false);
  const [isAutoSelectShop, setIsAutoSelectShop] = useState(true);
  
  const [isPickup, setIsPickup] = useState(true);
  const [isDelivery, setIsDelivery] = useState(true);
  const [isVip, setIsVip] = useState(false);

  // Set default shop if none selected
  const activeShop = useMemo(() => {
    if (selectedShopId) return shops.find(s => s.id === selectedShopId) || shops[0];
    return shops[0];
  }, [shops, selectedShopId]);

  const deferredSearchQuery = useDeferredValue(searchQuery);

  const filteredPois = useMemo(() => {
    if (!deferredSearchQuery.trim()) return pois;
    const lowerQuery = deferredSearchQuery.toLowerCase();
    return pois.filter(p => 
      p.name.toLowerCase().includes(lowerQuery) || 
      p.address.toLowerCase().includes(lowerQuery)
    );
  }, [pois, deferredSearchQuery]);

  const handleSelectPoi = async (poi: POI) => {
    setGoogleSearchQuery("");
    setTargetLocation({
      name: poi.name,
      address: poi.address,
      coords: poi.coords,
      placeId: poi.placeId
    });
    
    if (isAutoSelectShop) {
      if (poi.closestShopId && poi.distanceKm !== undefined && poi.distanceKm !== null) {
        setSelectedShopId(poi.closestShopId);
        setDistanceKm(poi.distanceKm);
      } else {
        setIsCalculatingShop(true);
        try {
          const closestShopId = await getClosestShopByRoute(poi.coords, shops);
          if (closestShopId) setSelectedShopId(closestShopId);
        } finally {
          setIsCalculatingShop(false);
        }
      }
    }
  };

  const roundHalfUp = (val: number) => Math.ceil(val * 2) / 2;

  const fee = useMemo(() => {
    if (distanceKm <= 0) return 0;
    let total = 0;
    const ratePerKm = isVip ? 4 : 10;
    if (isPickup) total += roundHalfUp(distanceKm * 2) * ratePerKm;
    if (isDelivery) total += roundHalfUp(distanceKm) * ratePerKm;
    return Math.max(isPickup || isDelivery ? 30 : 0, total);
  }, [distanceKm, isPickup, isDelivery, isVip]);

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8 flex flex-col h-screen overflow-hidden">
      <div className="mb-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl">
            <Calculator size={28} />
          </div>
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
        {/* Left Panel: POI List */}
        <div className="w-full lg:w-[400px] flex flex-col bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden shrink-0">
          <div className="p-5 border-b border-slate-100 space-y-4 bg-slate-50/50">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Search Database</label>
              <div className="relative">
                <Input 
                  placeholder="Search saved locations..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-12 bg-white rounded-xl shadow-sm"
                />
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Or Search Google Maps</label>
              <LocationInput 
                id="custom-location"
                placeholder="Type any address..."
                value={googleSearchQuery}
                onChange={setGoogleSearchQuery}
                onSelectLocation={async (loc) => {
                  setGoogleSearchQuery(loc.name);
                  const newCoords = { lat: loc.lat, lng: loc.lng };
                  setTargetLocation({
                    name: loc.name,
                    address: loc.address || loc.name,
                    coords: newCoords,
                    placeId: loc.placeId
                  });
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
                className="[&_input]:h-12 [&_input]:rounded-xl [&_input]:shadow-sm"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-2">Saved Locations ({filteredPois.length})</div>
            <div className="space-y-1">
              {filteredPois.map(poi => (
                <div 
                  key={poi.id}
                  onClick={() => handleSelectPoi(poi)}
                  className={`p-3 rounded-xl cursor-pointer transition-all border ${targetLocation?.name === poi.name ? 'bg-indigo-50 border-indigo-200' : 'border-transparent hover:bg-slate-50 hover:border-slate-200'}`}
                >
                  <div className="font-bold text-slate-900 line-clamp-1">{poi.name}</div>
                  <div className="text-xs text-slate-500 line-clamp-1 mt-0.5">{poi.address}</div>
                </div>
              ))}
              {filteredPois.length === 0 && (
                <div className="text-center p-8 text-slate-400 text-sm font-medium">
                  No locations found matching "{searchQuery}"
                </div>
              )}
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
                        if (checked && targetLocation) {
                          setIsCalculatingShop(true);
                          try {
                            const closestShopId = await getClosestShopByRoute(targetLocation.coords, shops);
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
                <span className="text-sm font-bold text-slate-700">ไปรับ (Pickup){distanceKm > 0 && <span className="text-xs font-medium text-slate-400 ml-1">• {roundHalfUp(distanceKm * 2).toFixed(1)} km</span>}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors">
                <input 
                  type="checkbox" 
                  checked={isDelivery}
                  onChange={(e) => setIsDelivery(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 h-4 w-4"
                />
                <span className="text-sm font-bold text-slate-700">ไปส่ง (Delivery){distanceKm > 0 && <span className="text-xs font-medium text-slate-400 ml-1">• {roundHalfUp(distanceKm).toFixed(1)} km</span>}</span>
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
                  {distanceKm > 0 && (isPickup || isDelivery) 
                    ? `${((isPickup ? roundHalfUp(distanceKm * 2) : 0) + (isDelivery ? roundHalfUp(distanceKm) : 0)).toFixed(1)} km` 
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
            {!targetLocation ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
                <Navigation size={48} className="mb-4 opacity-20" />
                <h3 className="text-lg font-bold text-slate-600 mb-1">Select a Destination</h3>
                <p className="text-sm font-medium">Search or click a location from the list to calculate the route.</p>
              </div>
            ) : (
              <CreateJobMap
                branchCoords={activeShop?.coords || { lat: 13.7367, lng: 100.5231 }}
                pickupCoords={targetLocation.coords}
                deliveryCoords={null}
                onMarkerDrag={async (type, coords) => {
                  if (type === 'pickup') {
                    setTargetLocation(prev => prev ? { ...prev, coords } : null);
                    if (isAutoSelectShop) {
                      setIsCalculatingShop(true);
                      try {
                        const closestShopId = await getClosestShopByRoute(coords, shops);
                        if (closestShopId) setSelectedShopId(closestShopId);
                      } finally {
                        setIsCalculatingShop(false);
                      }
                    }
                  }
                }}
                onDistanceCalculated={(pDist) => setDistanceKm(pDist)}
                className="w-full h-full"
              />
            )}
            
            {/* Removed blocking UI */}
            
            {targetLocation && (
              <div className="absolute top-4 left-4 z-[400] bg-white/90 backdrop-blur-md p-4 rounded-2xl shadow-lg border border-slate-200 max-w-sm">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-1.5 bg-blue-100 text-blue-600 rounded-lg shrink-0">
                    <MapPin size={16} />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-bold text-slate-900 text-sm leading-tight">{targetLocation.name}</h4>
                    <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 break-all">{targetLocation.address}</p>
                    {(() => {
                      let mapsUrl = `https://www.google.com/maps/search/?api=1&query=${targetLocation.coords.lat},${targetLocation.coords.lng}`;
                      if (targetLocation.address && targetLocation.address.startsWith('http')) {
                        mapsUrl = targetLocation.address;
                      } else if (targetLocation.placeId) {
                        mapsUrl += `&query_place_id=${targetLocation.placeId}`;
                      } else {
                        const isPoi = pois.some(p => p.name === targetLocation.name);
                        if (isPoi) {
                          mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${targetLocation.name} ${targetLocation.address || ''}`.trim())}`;
                        }
                      }
                      return (
                        <a 
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors bg-blue-50 px-2 py-1 rounded-md hover:bg-blue-100"
                        >
                          <MapPin size={10} /> Open in Google Maps
                        </a>
                      );
                    })()}
                    
                    {!pois.some(p => p.name === targetLocation.name) && (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="mt-3 h-7 text-[10px] font-bold px-2.5 rounded-lg border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 w-full"
                        onClick={async () => {
                          try {
                            await poiStore.addPOI({
                              name: targetLocation.name,
                              address: targetLocation.address,
                              coords: targetLocation.coords,
                              placeId: targetLocation.placeId
                            });
                            toast.success("Location saved to database!");
                          } catch (err: any) {
                            toast.error(err.message || "Failed to save location");
                          }
                        }}
                      >
                        <Plus size={12} className="mr-1" /> Save to Database
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
