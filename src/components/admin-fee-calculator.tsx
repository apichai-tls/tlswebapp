"use client";

import { useState, useSyncExternalStore, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Calculator,
  MapPin,
  Store,
  Navigation,
  Database,
  Plus,
  Sparkles,
  ArrowUpDown,
  RotateCcw,
  Copy,
  Check,
  ExternalLink,
  Search,
  Crown,
  Truck,
  Package,
  Route,
  Info,
  X,
} from "lucide-react";
import { poiStore, shopStore, type LatLng } from "@/lib/store";
import { getClosestShopByRoute } from "@/lib/map-api";
import { Button } from "@/components/ui/button";
import { LocationInput } from "@/components/location-input";
import { toast } from "sonner";

// Dynamically import Map to avoid SSR issues
const CreateJobMap = dynamic(
  () => import("@/components/create-job-map").then((mod) => mod.CreateJobMap),
  { ssr: false, loading: () => <div className="h-full w-full bg-slate-100 animate-pulse rounded-2xl" /> }
);

interface AdminFeeCalculatorProps {
  onNavigateToPois?: () => void;
}

export default function AdminFeeCalculator({ onNavigateToPois }: AdminFeeCalculatorProps = {}) {
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
  const [poiQuickFilter, setPoiQuickFilter] = useState("");
  const [copiedQuote, setCopiedQuote] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Set default shop if none selected
  const activeShop = useMemo(() => {
    if (selectedShopId) return shops.find((s) => s.id === selectedShopId) || shops[0];
    return shops[0];
  }, [shops, selectedShopId]);

  const getGoogleMapsUrl = (loc: { name: string; address: string; coords: LatLng; placeId?: string }) => {
    if (loc.address?.startsWith("http")) return loc.address;
    if (loc.placeId) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.name)}&query_place_id=${loc.placeId}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.name)}`;
  };

  const roundHalfUp = (val: number) => Math.ceil(val * 2) / 2;

  const ratePerKm = isVip ? 4 : 10;
  const billablePickupKm = isPickup && pickupDist > 0 ? roundHalfUp(pickupDist * 2) : 0;
  const billableDeliveryKm = isDelivery && deliveryDist > 0 ? roundHalfUp(deliveryDist) : 0;
  const totalBillableKm = billablePickupKm + billableDeliveryKm;
  const pickupLegFee = billablePickupKm * ratePerKm;
  const deliveryLegFee = billableDeliveryKm * ratePerKm;
  const rawCalculatedFee = pickupLegFee + deliveryLegFee;

  const fee = useMemo(() => {
    let total = 0;
    const rate = isVip ? 4 : 10;
    if (isPickup && pickupDist > 0) total += roundHalfUp(pickupDist * 2) * rate;
    if (isDelivery && deliveryDist > 0) total += roundHalfUp(deliveryDist) * rate;
    return Math.max(isPickup || isDelivery ? 30 : 0, total);
  }, [pickupDist, deliveryDist, isPickup, isDelivery, isVip]);

  const isMinFeeApplied = (isPickup || isDelivery) && fee === 30 && rawCalculatedFee < 30;

  const localDataForSearch = useMemo(() => {
    return pois.map((p) => ({
      name: p.name,
      address: p.address,
      lat: p.coords.lat,
      lng: p.coords.lng,
      placeId: p.placeId || p.id,
      isLocal: true,
    }));
  }, [pois]);

  const filteredPois = useMemo(() => {
    const q = poiQuickFilter.trim().toLowerCase();
    if (!q) return pois.slice(0, 60);
    return pois
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.address && p.address.toLowerCase().includes(q))
      )
      .slice(0, 60);
  }, [pois, poiQuickFilter]);

  const handleSelectPickup = async (loc: { name: string; address?: string; lat: number; lng: number; placeId?: string }) => {
    setPickupSearchQuery(loc.name);
    const newCoords = { lat: loc.lat, lng: loc.lng };
    const nextLoc = {
      name: loc.name,
      address: loc.address || loc.name,
      coords: newCoords,
      placeId: loc.placeId,
    };
    setPickupLoc(nextLoc);
    if (!isDeliveryDirty) {
      setDeliverySearchQuery(loc.name);
      setDeliveryLoc(nextLoc);
    }
    if (isAutoSelectShop) {
      setIsCalculatingShop(true);
      try {
        const closestShopId = await getClosestShopByRoute(newCoords, shops, loc.address || loc.name);
        if (closestShopId) setSelectedShopId(closestShopId);
      } finally {
        setIsCalculatingShop(false);
      }
    }
  };

  const handleSelectDelivery = (loc: { name: string; address?: string; lat: number; lng: number; placeId?: string }) => {
    setIsDeliveryDirty(true);
    setDeliverySearchQuery(loc.name);
    setDeliveryLoc({
      name: loc.name,
      address: loc.address || loc.name,
      coords: { lat: loc.lat, lng: loc.lng },
      placeId: loc.placeId,
    });
  };

  const handleSwapLocations = () => {
    if (!pickupLoc && !deliveryLoc) return;
    const tempLoc = pickupLoc;
    const tempQuery = pickupSearchQuery;
    setPickupLoc(deliveryLoc);
    setPickupSearchQuery(deliverySearchQuery);
    setDeliveryLoc(tempLoc);
    setDeliverySearchQuery(tempQuery);
    setIsDeliveryDirty(true);
  };

  const handleResetRoute = () => {
    setPickupSearchQuery("");
    setDeliverySearchQuery("");
    setPickupLoc(null);
    setDeliveryLoc(null);
    setIsDeliveryDirty(false);
    setPickupDist(0);
    setDeliveryDist(0);
  };

  const handleCopyQuote = () => {
    const lines = [
      `🧺 Delivery Fee Quote — ${activeShop?.name || "That Laundry Shop"}`,
      pickupLoc && isPickup ? `📍 Pickup: ${pickupLoc.name} (${billablePickupKm.toFixed(1)} km billable)` : null,
      deliveryLoc && isDelivery ? `🚚 Delivery: ${deliveryLoc.name} (${billableDeliveryKm.toFixed(1)} km billable)` : null,
      `📏 Total Billable Distance: ${totalBillableKm > 0 ? `${totalBillableKm.toFixed(1)} km` : "-"}`,
      `💳 Rate Tier: ${isVip ? "VIP (฿4/km)" : "Standard (฿10/km, Min ฿30)"}`,
      `💰 Total Delivery Fee: ฿${fee.toLocaleString()}`,
    ].filter(Boolean);

    navigator.clipboard.writeText(lines.join("\n"));
    setCopiedQuote(true);
    toast.success("Delivery fee quote copied to clipboard!");
    setTimeout(() => setCopiedQuote(false), 2000);
  };

  if (!mounted) {
    return (
      <div className="flex-1 bg-slate-50/80 p-4 lg:p-6 flex flex-col h-full overflow-hidden">
        <div className="mb-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 bg-slate-200 rounded-xl animate-pulse" />
            <div>
              <div className="h-6 w-56 bg-slate-200 rounded-lg animate-pulse mb-1.5" />
              <div className="h-4 w-80 bg-slate-200 rounded-lg animate-pulse" />
            </div>
          </div>
        </div>
        <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
          <div className="w-full lg:w-[400px] bg-slate-200 rounded-2xl animate-pulse" />
          <div className="flex-1 bg-slate-200 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-slate-50/70 p-4 lg:p-5 flex flex-col min-h-0 lg:h-[calc(100vh-4rem)] overflow-y-auto lg:overflow-hidden">
      {/* Top Header Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-2xl flex items-center justify-center shadow-sm shadow-indigo-500/20 shrink-0">
            <Calculator size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Delivery Fee Calculator</h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80">
                <Route size={11} /> Real-Time Route Pricing
              </span>
            </div>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              Search addresses or pick a saved location to calculate exact branch distances and delivery fees.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(pickupLoc || deliveryLoc) && (
            <Button
              type="button"
              variant="outline"
              onClick={handleResetRoute}
              className="h-9 px-3.5 text-xs font-bold border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-xl cursor-pointer"
            >
              <RotateCcw size={13.5} className="mr-1.5" />
              Reset Route
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={handleCopyQuote}
            className="h-9 px-3.5 text-xs font-bold border-indigo-200 text-indigo-700 bg-indigo-50/70 hover:bg-indigo-100/80 rounded-xl cursor-pointer"
          >
            {copiedQuote ? <Check size={13.5} className="mr-1.5 text-emerald-600" /> : <Copy size={13.5} className="mr-1.5" />}
            {copiedQuote ? "Quote Copied!" : "Copy Fee Quote"}
          </Button>
          {onNavigateToPois ? (
            <Button
              onClick={onNavigateToPois}
              variant="outline"
              className="h-9 px-4 border-slate-200/90 text-xs font-bold bg-white hover:bg-slate-50 text-slate-800 rounded-xl shadow-2xs cursor-pointer"
            >
              <Database size={14} className="mr-1.5 text-indigo-600" />
              Manage POIs
              <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 text-[10px] font-extrabold">
                {pois.length}
              </span>
            </Button>
          ) : (
            <Link href="/admin?tab=pois">
              <Button
                variant="outline"
                className="h-9 px-4 border-slate-200/90 text-xs font-bold bg-white hover:bg-slate-50 text-slate-800 rounded-xl shadow-2xs cursor-pointer"
              >
                <Database size={14} className="mr-1.5 text-indigo-600" />
                Manage POIs
                <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 text-[10px] font-extrabold">
                  {pois.length}
                </span>
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        {/* LEFT SIDEBAR: Route Planner, Service Tier & Saved POIs Quick List */}
        <div className="w-full lg:w-[390px] xl:w-[415px] flex flex-col gap-3.5 shrink-0 min-h-0 lg:h-full">
          {/* Card 1: Origin Branch & Pickup / Delivery Inputs */}
          <div className="bg-white rounded-2xl shadow-2xs border border-slate-200/90 p-4 space-y-3.5 shrink-0">
            {/* Origin Branch Selector */}
            <div className="space-y-1.5 pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 text-[11px] font-extrabold text-slate-600 uppercase tracking-wider">
                  <Store size={13} className="text-emerald-600" />
                  Origin Branch
                  {isCalculatingShop && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 normal-case">
                      <span className="w-2.5 h-2.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                      Finding nearest...
                    </span>
                  )}
                </label>

                <button
                  type="button"
                  onClick={async () => {
                    const next = !isAutoSelectShop;
                    setIsAutoSelectShop(next);
                    if (next && pickupLoc) {
                      setIsCalculatingShop(true);
                      try {
                        const closestShopId = await getClosestShopByRoute(pickupLoc.coords, shops, pickupLoc.address);
                        if (closestShopId) setSelectedShopId(closestShopId);
                      } finally {
                        setIsCalculatingShop(false);
                      }
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-bold border transition-all cursor-pointer ${
                    isAutoSelectShop
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 shadow-2xs"
                      : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                  }`}
                  title="Automatically select the closest laundry branch based on real driving distance"
                >
                  <Sparkles size={11} className={isAutoSelectShop ? "text-emerald-600" : "text-slate-400"} />
                  <span>Auto Nearest</span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isAutoSelectShop ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                  />
                </button>
              </div>

              <select
                className="w-full bg-slate-50/90 hover:bg-slate-100/70 border border-slate-200/90 text-slate-900 text-xs font-bold rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 block px-3 py-2.5 transition-colors cursor-pointer"
                value={activeShop?.id || selectedShopId}
                onChange={(e) => {
                  setSelectedShopId(e.target.value);
                  setIsAutoSelectShop(false);
                }}
              >
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Pickup Location Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <MapPin size={10.5} />
                  </span>
                  Pickup Location
                </label>
                <div className="flex items-center gap-1.5">
                  {pickupDist > 0 && (
                    <span className="text-[10.5px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.2 rounded-full">
                      {pickupDist.toFixed(1)} km one-way • {billablePickupKm.toFixed(1)} km (×2)
                    </span>
                  )}
                  {pickupSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setPickupSearchQuery("");
                        setPickupLoc(null);
                        setPickupDist(0);
                      }}
                      className="text-slate-400 hover:text-slate-600 p-0.5 rounded-md hover:bg-slate-100 cursor-pointer"
                      title="Clear Pickup Location"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
              <LocationInput
                id="pickup-location"
                placeholder="Search pickup condo, hotel, or address..."
                value={pickupSearchQuery}
                localData={localDataForSearch}
                onChange={setPickupSearchQuery}
                onSelectLocation={handleSelectPickup}
                className="[&_input]:h-9.5 [&_input]:rounded-xl [&_input]:text-xs [&_input]:bg-slate-50/70 [&_input]:border-slate-200/90"
              />
            </div>

            {/* Quick Connector Actions between Pickup & Delivery */}
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                onClick={() => {
                  if (pickupLoc) {
                    setDeliveryLoc(pickupLoc);
                    setDeliverySearchQuery(pickupLoc.name);
                    setIsDeliveryDirty(false);
                  }
                }}
                disabled={!pickupLoc}
                className={`inline-flex items-center gap-1 text-[10.5px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                  !isDeliveryDirty && pickupLoc
                    ? "bg-indigo-50 text-indigo-700 border-indigo-200/80"
                    : pickupLoc
                      ? "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 cursor-pointer"
                      : "bg-slate-50/50 text-slate-400 border-slate-100 cursor-not-allowed"
                }`}
              >
                <Check size={11} className={!isDeliveryDirty && pickupLoc ? "text-indigo-600" : "opacity-40"} />
                <span>Same as Pickup</span>
              </button>

              <button
                type="button"
                onClick={handleSwapLocations}
                disabled={!pickupLoc && !deliveryLoc}
                className="inline-flex items-center gap-1 text-[10.5px] font-bold text-slate-600 hover:text-indigo-600 bg-slate-50 hover:bg-indigo-50/60 px-2.5 py-1 rounded-lg border border-slate-200/80 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                title="Swap Pickup and Delivery Locations"
              >
                <ArrowUpDown size={11} />
                <span>Swap Locations</span>
              </button>
            </div>

            {/* Delivery Location Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center">
                    <Navigation size={10.5} />
                  </span>
                  Delivery Location
                </label>
                <div className="flex items-center gap-1.5">
                  {deliveryDist > 0 && (
                    <span className="text-[10.5px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2 py-0.2 rounded-full">
                      {billableDeliveryKm.toFixed(1)} km (×1)
                    </span>
                  )}
                  {deliverySearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeliverySearchQuery("");
                        setDeliveryLoc(null);
                        setDeliveryDist(0);
                      }}
                      className="text-slate-400 hover:text-slate-600 p-0.5 rounded-md hover:bg-slate-100 cursor-pointer"
                      title="Clear Delivery Location"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
              <LocationInput
                id="delivery-location"
                placeholder="Search delivery condo, hotel, or address..."
                value={deliverySearchQuery}
                localData={localDataForSearch}
                onChange={(val) => {
                  setDeliverySearchQuery(val);
                  setIsDeliveryDirty(true);
                }}
                onSelectLocation={handleSelectDelivery}
                className="[&_input]:h-9.5 [&_input]:rounded-xl [&_input]:text-xs [&_input]:bg-slate-50/70 [&_input]:border-slate-200/90"
              />
            </div>

            {/* Service Mode & VIP Toggles */}
            <div className="pt-2 border-t border-slate-100 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setIsPickup((v) => !v)}
                className={`flex flex-col items-start p-2 rounded-xl border text-left transition-all cursor-pointer ${
                  isPickup
                    ? "bg-emerald-50/80 border-emerald-300 text-emerald-950 shadow-2xs"
                    : "bg-slate-50/70 border-slate-200 text-slate-400 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[11px] font-extrabold flex items-center gap-1">
                    <Package size={12} className={isPickup ? "text-emerald-600" : "text-slate-400"} />
                    Pickup
                  </span>
                  <input
                    type="checkbox"
                    checked={isPickup}
                    readOnly
                    className="rounded border-slate-300 text-emerald-600 h-3.5 w-3.5 pointer-events-none"
                  />
                </div>
                <span className="text-[9.5px] font-semibold opacity-75 mt-0.5">
                  {pickupDist > 0 ? `${billablePickupKm.toFixed(1)} km • ฿${pickupLegFee}` : "Round-trip (×2)"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsDelivery((v) => !v)}
                className={`flex flex-col items-start p-2 rounded-xl border text-left transition-all cursor-pointer ${
                  isDelivery
                    ? "bg-indigo-50/80 border-indigo-300 text-indigo-950 shadow-2xs"
                    : "bg-slate-50/70 border-slate-200 text-slate-400 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[11px] font-extrabold flex items-center gap-1">
                    <Truck size={12} className={isDelivery ? "text-indigo-600" : "text-slate-400"} />
                    Delivery
                  </span>
                  <input
                    type="checkbox"
                    checked={isDelivery}
                    readOnly
                    className="rounded border-slate-300 text-indigo-600 h-3.5 w-3.5 pointer-events-none"
                  />
                </div>
                <span className="text-[9.5px] font-semibold opacity-75 mt-0.5">
                  {deliveryDist > 0 ? `${billableDeliveryKm.toFixed(1)} km • ฿${deliveryLegFee}` : "One-way (×1)"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setIsVip((v) => !v)}
                className={`flex flex-col items-start p-2 rounded-xl border text-left transition-all cursor-pointer ${
                  isVip
                    ? "bg-gradient-to-br from-amber-50 to-yellow-100/80 border-amber-400 text-amber-950 shadow-2xs"
                    : "bg-slate-50/70 border-slate-200 text-slate-500 hover:bg-amber-50/40"
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[11px] font-black flex items-center gap-1 uppercase">
                    <Crown size={12} className={isVip ? "text-amber-600" : "text-slate-400"} />
                    VIP Tier
                  </span>
                  <input
                    type="checkbox"
                    checked={isVip}
                    readOnly
                    className="rounded border-amber-400 text-amber-500 h-3.5 w-3.5 pointer-events-none"
                  />
                </div>
                <span className="text-[9.5px] font-bold opacity-80 mt-0.5">
                  {isVip ? "฿4 / km active" : "Std ฿10 / km"}
                </span>
              </button>
            </div>
          </div>

          {/* Card 2: Saved Locations / Quick-Select POIs List */}
          <div className="bg-white rounded-2xl shadow-2xs border border-slate-200/90 flex-1 min-h-[240px] flex flex-col overflow-hidden">
            <div className="p-3.5 border-b border-slate-100 space-y-2.5 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center">
                    <Database size={13} />
                  </span>
                  <div>
                    <h3 className="text-xs font-extrabold text-slate-800 leading-none">Saved Locations (POIs)</h3>
                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                      Click any location to calculate route immediately
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-extrabold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                  {filteredPois.length}
                </span>
              </div>

              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={poiQuickFilter}
                  onChange={(e) => setPoiQuickFilter(e.target.value)}
                  placeholder="Filter saved condos, hotels, landmarks..."
                  className="w-full h-8 pl-8 pr-7 text-xs bg-slate-50/90 border border-slate-200/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                />
                {poiQuickFilter && (
                  <button
                    type="button"
                    onClick={() => setPoiQuickFilter("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100/80 p-1.5">
              {filteredPois.length === 0 ? (
                <div className="py-10 text-center px-4">
                  <MapPin size={24} className="mx-auto text-slate-300 mb-1.5" />
                  <p className="text-xs font-bold text-slate-500">No matching saved locations</p>
                  <p className="text-[10.5px] text-slate-400 mt-0.5">
                    Use the search inputs above to look up any address on Google Maps.
                  </p>
                </div>
              ) : (
                filteredPois.map((poi) => {
                  const isSelectedPickup = pickupLoc?.name === poi.name;
                  const isSelectedDelivery = deliveryLoc?.name === poi.name;
                  return (
                    <div
                      key={poi.id}
                      onClick={() => {
                        setIsDeliveryDirty(false);
                        handleSelectPickup({
                          name: poi.name,
                          address: poi.address,
                          lat: poi.coords.lat,
                          lng: poi.coords.lng,
                          placeId: poi.placeId || poi.id,
                        });
                      }}
                      className={`group flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl transition-all cursor-pointer ${
                        isSelectedPickup || isSelectedDelivery
                          ? "bg-indigo-50/80 border border-indigo-200/80"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-800 truncate group-hover:text-indigo-700">
                            {poi.name}
                          </span>
                          {isSelectedPickup && (
                            <span className="px-1.5 py-0 rounded text-[9px] font-extrabold bg-emerald-100 text-emerald-800 shrink-0">
                              Pickup
                            </span>
                          )}
                          {isSelectedDelivery && (
                            <span className="px-1.5 py-0 rounded text-[9px] font-extrabold bg-indigo-100 text-indigo-800 shrink-0">
                              Delivery
                            </span>
                          )}
                        </div>
                        {poi.address && !poi.address.startsWith("http") && (
                          <p className="text-[10px] text-slate-400 truncate mt-0.5">{poi.address}</p>
                        )}
                      </div>

                      <div
                        className="flex items-center gap-1 shrink-0 opacity-85 group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            handleSelectPickup({
                              name: poi.name,
                              address: poi.address,
                              lat: poi.coords.lat,
                              lng: poi.coords.lng,
                              placeId: poi.placeId || poi.id,
                            })
                          }
                          className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 transition-colors cursor-pointer"
                          title="Set as Pickup Location"
                        >
                          Pickup
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleSelectDelivery({
                              name: poi.name,
                              address: poi.address,
                              lat: poi.coords.lat,
                              lng: poi.coords.lng,
                              placeId: poi.placeId || poi.id,
                            })
                          }
                          className="px-2 py-1 rounded-lg text-[10px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 transition-colors cursor-pointer"
                          title="Set as Delivery Location"
                        >
                          Delivery
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: KPI Summary Strip + Interactive Live Map */}
        <div className="flex-1 flex flex-col gap-3.5 min-h-0">
          {/* Top 4-Card Summary Strip */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 shrink-0">
            {/* KPI 1: Origin Branch */}
            <div className="bg-white rounded-2xl p-3.5 border border-slate-200/90 shadow-2xs flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200/70 text-emerald-600 flex items-center justify-center shrink-0">
                <Store size={19} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Origin Branch</span>
                  {isAutoSelectShop && (
                    <span className="text-[9px] font-extrabold px-1.5 py-0 rounded bg-emerald-100 text-emerald-800">
                      AUTO
                    </span>
                  )}
                </div>
                <div className="text-xs font-black text-slate-900 truncate mt-0.5" title={activeShop?.name}>
                  {activeShop?.name || "Select Branch"}
                </div>
                <div className="text-[10px] text-slate-400 font-medium truncate">
                  {isCalculatingShop ? "Calculating nearest branch..." : "Active routing origin"}
                </div>
              </div>
            </div>

            {/* KPI 2: Pickup Leg Breakdown */}
            <div className={`rounded-2xl p-3.5 border shadow-2xs flex items-center gap-3 transition-colors ${
              isPickup ? "bg-white border-slate-200/90" : "bg-slate-50/70 border-slate-200/60 opacity-60"
            }`}>
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200/70 text-emerald-600 flex items-center justify-center shrink-0">
                <Package size={19} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Pickup Leg (×2)</span>
                  {isPickup && pickupDist > 0 && (
                    <span className="text-[10.5px] font-black text-emerald-700">฿{pickupLegFee.toLocaleString()}</span>
                  )}
                </div>
                <div className="text-base font-black text-slate-900 leading-tight mt-0.5">
                  {isPickup && pickupDist > 0 ? `${billablePickupKm.toFixed(1)} km` : "—"}
                </div>
                <div className="text-[10px] text-slate-400 font-medium truncate">
                  {isPickup
                    ? pickupDist > 0
                      ? `${pickupDist.toFixed(2)} km one-way × 2`
                      : "Select pickup to calculate"
                    : "Pickup leg disabled"}
                </div>
              </div>
            </div>

            {/* KPI 3: Delivery Leg Breakdown */}
            <div className={`rounded-2xl p-3.5 border shadow-2xs flex items-center gap-3 transition-colors ${
              isDelivery ? "bg-white border-slate-200/90" : "bg-slate-50/70 border-slate-200/60 opacity-60"
            }`}>
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200/70 text-indigo-600 flex items-center justify-center shrink-0">
                <Truck size={19} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Delivery Leg (×1)</span>
                  {isDelivery && deliveryDist > 0 && (
                    <span className="text-[10.5px] font-black text-indigo-700">฿{deliveryLegFee.toLocaleString()}</span>
                  )}
                </div>
                <div className="text-base font-black text-slate-900 leading-tight mt-0.5">
                  {isDelivery && deliveryDist > 0 ? `${billableDeliveryKm.toFixed(1)} km` : "—"}
                </div>
                <div className="text-[10px] text-slate-400 font-medium truncate">
                  {isDelivery
                    ? deliveryDist > 0
                      ? `${deliveryDist.toFixed(2)} km one-way`
                      : "Select delivery to calculate"
                    : "Delivery leg disabled"}
                </div>
              </div>
            </div>

            {/* KPI 4: Total Delivery Fee Hero Card */}
            <div className="bg-gradient-to-br from-indigo-600 via-indigo-600 to-violet-700 text-white rounded-2xl p-3.5 shadow-sm shadow-indigo-500/15 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-100">
                    Total Delivery Fee
                  </span>
                  {isVip && (
                    <span className="px-1.5 py-0 rounded text-[9px] font-black bg-amber-300 text-amber-950">
                      VIP
                    </span>
                  )}
                </div>
                <div className="text-2xl font-black tracking-tight leading-tight mt-0.5">
                  {fee > 0 ? `฿${fee.toLocaleString()}` : "฿0"}
                </div>
                <div className="text-[10px] text-indigo-100/90 font-medium truncate">
                  {totalBillableKm > 0
                    ? `${totalBillableKm.toFixed(1)} km total • ฿${ratePerKm}/km${isMinFeeApplied ? " (Min ฿30)" : ""}`
                    : `Base Min ฿30 • ฿${ratePerKm}/km`}
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyQuote}
                className="p-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors shrink-0 cursor-pointer"
                title="Copy delivery fee quote"
              >
                {copiedQuote ? <Check size={17} /> : <Copy size={17} />}
              </button>
            </div>
          </div>

          {/* Interactive Live Map Container (Always Rendered!) */}
          <div className="flex-1 min-h-[420px] bg-white rounded-2xl shadow-2xs border border-slate-200/90 overflow-hidden relative">
            <CreateJobMap
              branchCoords={activeShop?.coords || { lat: 13.7367, lng: 100.5231 }}
              pickupCoords={pickupLoc?.coords || null}
              deliveryCoords={deliveryLoc?.coords || null}
              onMarkerDrag={async (type, coords) => {
                if (type === "pickup") {
                  setPickupLoc((prev) => {
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
                } else if (type === "delivery") {
                  setIsDeliveryDirty(true);
                  setDeliveryLoc((prev) => (prev ? { ...prev, coords } : null));
                }
              }}
              onDistanceCalculated={(pDist, dDist) => {
                setPickupDist(pDist);
                setDeliveryDist(dDist);
              }}
              className="w-full h-full border-0 rounded-none"
            />

            {/* Floating Map Legend (Top Right) */}
            <div className="absolute top-3.5 right-3.5 z-[400] bg-white/95 backdrop-blur-md px-3 py-2 rounded-xl shadow-md border border-slate-200/80 flex items-center gap-3 text-[10.5px] font-bold text-slate-700">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-200" />
                Pickup Route
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-rose-200" />
                Delivery Route
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-slate-400 font-medium">
                <Info size={11} /> Drag pins to fine-tune
              </span>
            </div>

            {/* Floating Guidance Pill when no destination is selected yet */}
            {!(pickupLoc || deliveryLoc) && (
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-[400] bg-slate-900/85 backdrop-blur-md text-white px-4 py-2.5 rounded-2xl shadow-lg border border-white/10 flex items-center gap-2.5 max-w-md w-[92%] sm:w-auto pointer-events-none">
                <div className="w-7 h-7 rounded-xl bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center shrink-0">
                  <Navigation size={14} className="text-indigo-200" />
                </div>
                <div className="text-xs leading-snug">
                  <span className="font-bold">Select a Destination: </span>
                  <span className="text-slate-200">
                    Search an address or click any Saved Location on the left to calculate the route.
                  </span>
                </div>
              </div>
            )}

            {/* Floating Selected Locations Overlay (Top Left) */}
            {(pickupLoc || deliveryLoc) && (
              <div className="absolute top-3.5 left-3.5 z-[400] bg-white/95 backdrop-blur-md p-3.5 rounded-2xl shadow-lg border border-slate-200/90 max-w-xs w-[88%] sm:w-80 space-y-2.5">
                {pickupLoc && (
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 p-1.5 bg-emerald-100 text-emerald-700 rounded-lg shrink-0">
                      <MapPin size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">
                          Pickup Point
                        </span>
                        {pickupDist > 0 && (
                          <span className="text-[10px] font-black text-slate-700">
                            {pickupDist.toFixed(1)} km
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-slate-900 text-xs leading-tight truncate mt-0.5" title={pickupLoc.name}>
                        {pickupLoc.name}
                      </h4>
                      {!pickupLoc.address?.startsWith("http") && (
                        <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{pickupLoc.address}</p>
                      )}
                      <div className="mt-2 flex items-center gap-1.5">
                        <a
                          href={getGoogleMapsUrl(pickupLoc)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors flex-1"
                        >
                          <ExternalLink size={10.5} /> Google Maps
                        </a>
                        {!pois.some((p) => p.name === pickupLoc.name) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] font-bold px-2 rounded-lg border-indigo-200 text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                            onClick={async () => {
                              try {
                                await poiStore.addPOI({
                                  name: pickupLoc.name,
                                  address: pickupLoc.address,
                                  coords: pickupLoc.coords,
                                  placeId: pickupLoc.placeId,
                                });
                                toast.success("Pickup location saved to POIs!");
                              } catch (err: any) {
                                toast.error(err.message || "Failed to save location");
                              }
                            }}
                          >
                            <Plus size={11} className="mr-0.5" /> Save POI
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {deliveryLoc && (deliveryLoc.name !== pickupLoc?.name || isDeliveryDirty) && (
                  <div className={`flex items-start gap-2.5 ${pickupLoc ? "pt-2.5 border-t border-slate-100" : ""}`}>
                    <div className="mt-0.5 p-1.5 bg-indigo-100 text-indigo-700 rounded-lg shrink-0">
                      <Navigation size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">
                          Delivery Point
                        </span>
                        {deliveryDist > 0 && (
                          <span className="text-[10px] font-black text-slate-700">
                            {deliveryDist.toFixed(1)} km
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-slate-900 text-xs leading-tight truncate mt-0.5" title={deliveryLoc.name}>
                        {deliveryLoc.name}
                      </h4>
                      {!deliveryLoc.address?.startsWith("http") && (
                        <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{deliveryLoc.address}</p>
                      )}
                      <div className="mt-2 flex items-center gap-1.5">
                        <a
                          href={getGoogleMapsUrl(deliveryLoc)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors flex-1"
                        >
                          <ExternalLink size={10.5} /> Google Maps
                        </a>
                        {!pois.some((p) => p.name === deliveryLoc.name) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] font-bold px-2 rounded-lg border-indigo-200 text-indigo-600 hover:bg-indigo-50 cursor-pointer"
                            onClick={async () => {
                              try {
                                await poiStore.addPOI({
                                  name: deliveryLoc.name,
                                  address: deliveryLoc.address,
                                  coords: deliveryLoc.coords,
                                  placeId: deliveryLoc.placeId,
                                });
                                toast.success("Delivery location saved to POIs!");
                              } catch (err: any) {
                                toast.error(err.message || "Failed to save location");
                              }
                            }}
                          >
                            <Plus size={11} className="mr-0.5" /> Save POI
                          </Button>
                        )}
                      </div>
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
