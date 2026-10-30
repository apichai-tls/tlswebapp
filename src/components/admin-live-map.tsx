"use client";

import React, { useState, useEffect, useMemo, useSyncExternalStore } from "react";
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, ZoomControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  Navigation,
  RefreshCw,
  Search,
  Store,
  Users,
  MapPin,
  Phone,
  Star,
  Truck,
  CheckCircle2,
  Clock,
  ExternalLink,
  Compass,
  Layers,
  X,
  ChevronRight,
  Package,
} from "lucide-react";
import { useRiders } from "@/lib/use-riders";
import { shopStore, riderStore, jobStore, type Rider } from "@/lib/store";
import { useAuth } from "@/providers/auth-provider";
import { authFetch } from "@/lib/api";
import { getUserAssignedBranchIds } from "@/components/branch-filter-dropdown";

// Helper to create a custom div icon with the rider's avatar + clear name badge
function createAvatarIcon(rider: Rider, isSelected = false, activeOrderCount = 0) {
  const displayName = rider.nickname || rider.name.split(" ")[0] || rider.name;
  const statusRing =
    rider.status === "online"
      ? "border-emerald-500 ring-4 ring-emerald-500/20"
      : rider.status === "busy"
        ? "border-amber-500 ring-4 ring-amber-500/25"
        : "border-slate-400 ring-2 ring-slate-400/20";
  const statusDot =
    rider.status === "online"
      ? "bg-emerald-500"
      : rider.status === "busy"
        ? "bg-amber-500"
        : "bg-slate-400";
  const selectedScale = isSelected ? "scale-110 ring-4 ring-indigo-500/40" : "";

  return L.divIcon({
    className: "bg-transparent border-none overflow-visible",
    html: `
      <div style="position: absolute; width: 52px; height: 52px; transform: translate(-26px, -54px);" class="transition-all duration-500 ease-out ${selectedScale}">
        ${
          activeOrderCount > 0
            ? `<div class="absolute -top-2.5 -right-2 bg-indigo-600 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full shadow-md border border-white z-30 whitespace-nowrap">${activeOrderCount} job${activeOrderCount > 1 ? "s" : ""}</div>`
            : `<div class="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-[8.5px] font-bold px-1.5 py-0.2 rounded-full shadow-sm border border-slate-700 z-20 whitespace-nowrap">LIVE</div>`
        }
        <div class="relative w-full h-full rounded-full border-[3px] bg-white shadow-lg ${statusRing}">
          <img src="${rider.avatarUrl || "https://i.pravatar.cc/150"}" style="width: 100%; height: 100%; object-fit: cover;" class="rounded-full" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(rider.name)}&background=4f46e5&color=fff'" />
          <div class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${statusDot}"></div>
        </div>
        <div class="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-xs text-slate-900 text-[10px] font-extrabold px-2 py-0.5 rounded-md shadow-md border border-slate-200/90 whitespace-nowrap z-20">
          ${displayName}
        </div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -58],
  });
}

// Icon caches to prevent Leaflet from destroying/re-creating DOM nodes every render
const avatarIconCache = new Map<string, L.DivIcon>();
function getAvatarIcon(rider: Rider, isSelected = false, activeOrderCount = 0) {
  const key = `${rider.id}-${rider.status}-${rider.avatarUrl || "default"}-${isSelected ? "sel" : "norm"}-${activeOrderCount}`;
  let icon = avatarIconCache.get(key);
  if (!icon) {
    icon = createAvatarIcon(rider, isSelected, activeOrderCount);
    avatarIconCache.set(key, icon);
  }
  return icon;
}

// Shop Marker Icon
function createShopIcon(shop: { name: string; address: string }) {
  const shortLabel = shop.name.replace("That Laundry Shop", "TLS").trim();
  return L.divIcon({
    className: "bg-transparent border-none overflow-visible",
    html: `
      <div style="position: absolute; transform: translate(-18px, -36px);" class="flex flex-col items-center group">
        <div class="w-9 h-9 bg-white rounded-2xl border-2 border-indigo-600 shadow-md flex items-center justify-center p-1.5 relative z-10 transition-transform hover:scale-110">
          <img src="/logo.png" class="object-contain w-full h-full" />
        </div>
        <div class="w-2.5 h-2.5 bg-indigo-600 rotate-45 -mt-1.5 shadow-xs"></div>
        <div class="mt-0.5 bg-indigo-950/90 text-white text-[9px] font-bold px-1.5 py-0.2 rounded shadow-xs whitespace-nowrap">
          ${shortLabel}
        </div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -40],
  });
}

const shopIconCache = new Map<string, L.DivIcon>();
function getShopIcon(shop: { id?: string; name: string; address: string }) {
  const key = shop.id || shop.name;
  let icon = shopIconCache.get(key);
  if (!icon) {
    icon = createShopIcon(shop);
    shopIconCache.set(key, icon);
  }
  return icon;
}

function MapUpdater({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.2 });
  }, [center[0], center[1], zoom, map]);
  return null;
}

function formatRiderGpsTimestamp(iso?: string | null): { label: string; isToday: boolean } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const bkkOffsetMs = 7 * 60 * 60 * 1000;
  const nowBkk = new Date(Date.now() + bkkOffsetMs);
  const dBkk = new Date(d.getTime() + bkkOffsetMs);

  const todayKey = nowBkk.toISOString().slice(0, 10);
  const dateKey = dBkk.toISOString().slice(0, 10);
  const isToday = todayKey === dateKey;

  const yesterdayBkk = new Date(nowBkk.getTime() - 24 * 60 * 60 * 1000);
  const isYesterday = yesterdayBkk.toISOString().slice(0, 10) === dateKey;

  const hh = String(dBkk.getUTCHours()).padStart(2, "0");
  const mm = String(dBkk.getUTCMinutes()).padStart(2, "0");
  const ss = String(dBkk.getUTCSeconds()).padStart(2, "0");

  if (isToday) {
    return { label: `วันนี้ ${hh}:${mm}:${ss} น.`, isToday: true };
  }
  if (isYesterday) {
    return { label: `เมื่อวาน ${hh}:${mm} น.`, isToday: false };
  }
  const day = dBkk.getUTCDate();
  const monthsTh = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const month = monthsTh[dBkk.getUTCMonth()] || "";
  return { label: `${day} ${month} ${hh}:${mm} น.`, isToday: false };
}

export const AdminLiveMap = React.memo(function AdminLiveMap({ minimal = false }: { minimal?: boolean }) {
  const riders = useRiders();
  const { user } = useAuth();
  const shopLocations = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  const jobs = useSyncExternalStore(jobStore.subscribe, jobStore.getSnapshot, jobStore.getSnapshot);

  const [isMounted, setIsMounted] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<string>("bangkok");
  const [hasAutoCentered, setHasAutoCentered] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([13.736717, 100.523186]); // Default Bangkok
  const [mapZoom, setMapZoom] = useState<number>(12);

  const [sidebarTab, setSidebarTab] = useState<"riders" | "branches">("riders");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "busy" | "offline">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [showShopMarkers, setShowShopMarkers] = useState(true);

  useEffect(() => {
    setIsMounted(true);
    setLastSyncedAt(new Date());
  }, []);

  const pollRiderLocations = async (manual = false) => {
    if (!manual && typeof document !== "undefined" && document.visibilityState === "hidden") return;
    if (manual) setIsRefreshing(true);
    try {
      const res = await authFetch("/api/rider-location");
      if (!res.ok) return;
      const freshRiders = await res.json();
      if (!Array.isArray(freshRiders)) return;

      for (const r of freshRiders) {
        if (r.id) {
          const updates: Partial<Rider> = { status: r.status };
          if (r.currentLat && r.currentLng) {
            updates.currentLocation = { lat: r.currentLat, lng: r.currentLng };
          }
          if (r.gpsUpdatedAt !== undefined) {
            updates.gpsUpdatedAt = r.gpsUpdatedAt;
          }
          riderStore.updateRiderLocal(r.id, updates);
        }
      }
      setLastSyncedAt(new Date());
    } catch {
      // Silently ignore network blips
    } finally {
      if (manual) setIsRefreshing(false);
    }
  };

  // Real-time GPS Polling: Fetch fresh rider locations every 15s while map is mounted
  useEffect(() => {
    pollRiderLocations(false);
    const interval = setInterval(() => pollRiderLocations(false), 15000);
    return () => clearInterval(interval);
  }, []);

  // Filter riders by user's assigned branches/area (manager/staff scope)
  const isBranchRestricted = Boolean(
    user &&
      user.role !== "admin" &&
      ((user.area && user.area !== "ALL") || (user.branchId && user.branchId !== "all" && user.branchId !== "ALL"))
  );

  const allowedBranchIds = useMemo(
    () => new Set(getUserAssignedBranchIds(user, shopLocations)),
    [user, shopLocations]
  );

  // Auto-center map to the user's assigned branch or region on initial load
  useEffect(() => {
    if (hasAutoCentered || !user || shopLocations.length === 0) return;
    setHasAutoCentered(true);
    if (!isBranchRestricted) return;

    const assignedShops = shopLocations.filter((s) => allowedBranchIds.has(s.id));
    if (assignedShops.length === 1) {
      const shop = assignedShops[0];
      setSelectedRegion(shop.id);
      setMapCenter([shop.coords.lat, shop.coords.lng]);
      setMapZoom(13);
    } else if (assignedShops.length > 0 && assignedShops.every((s) => (s.area || "").toUpperCase() === "PTY")) {
      setSelectedRegion("pattaya");
      setMapCenter([12.9236, 100.8825]);
      setMapZoom(13);
    }
  }, [hasAutoCentered, user, shopLocations, isBranchRestricted, allowedBranchIds]);

  // Exclude resigned riders (r.isActive === false) and respect branch restrictions
  const workingRiders = useMemo(() => {
    const activeEmployment = riders.filter((r) => r.isActive !== false);
    if (isBranchRestricted && shopLocations.length > 0) {
      return activeEmployment.filter((r) => Boolean(r.branchId && allowedBranchIds.has(r.branchId)));
    }
    return activeEmployment;
  }, [riders, isBranchRestricted, allowedBranchIds, shopLocations.length]);

  // Count active pickup/delivery tasks per rider
  const activeTaskCountByRider = useMemo(() => {
    const counts = new Map<string, { pickup: number; delivery: number; total: number }>();
    for (const j of jobs) {
      if (j.status === "pickup") {
        const rid = j.pickupRiderId || j.riderId;
        if (rid) {
          const prev = counts.get(rid) || { pickup: 0, delivery: 0, total: 0 };
          prev.pickup++;
          prev.total++;
          counts.set(rid, prev);
        }
      } else if (j.status === "delivery") {
        const rid = j.deliveryRiderId || j.riderId;
        if (rid) {
          const prev = counts.get(rid) || { pickup: 0, delivery: 0, total: 0 };
          prev.delivery++;
          prev.total++;
          counts.set(rid, prev);
        }
      }
    }
    return counts;
  }, [jobs]);

  // Compute working riders with effective location + smart spider offset when multiple riders share the same spot
  const ridersWithLocations = useMemo(() => {
    const baseList = workingRiders.map((r) => {
      let loc = r.currentLocation;
      if ((!loc || (loc.lat === 13.73 && loc.lng === 100.53)) && r.branchId) {
        const assignedBranch = shopLocations.find((s) => s.id === r.branchId);
        if (assignedBranch && (assignedBranch.coords.lat !== 13.73 || assignedBranch.coords.lng !== 100.53)) {
          loc = assignedBranch.coords;
        }
      }
      if (!loc && shopLocations[0]) {
        loc = shopLocations[0].coords;
      }
      return {
        ...r,
        effectiveLocation: loc,
      };
    });

    // Group riders that are at virtually the same coordinate (< 0.0008 deg) so their pins fan out cleanly instead of stacking
    const groups = new Map<string, typeof baseList>();
    for (const r of baseList) {
      if (!r.effectiveLocation) continue;
      const key = `${Math.round(r.effectiveLocation.lat * 1000)}:${Math.round(r.effectiveLocation.lng * 1000)}`;
      const arr = groups.get(key) || [];
      arr.push(r);
      groups.set(key, arr);
    }

    const offsetMap = new Map<string, { lat: number; lng: number }>();
    for (const [, group] of groups.entries()) {
      if (group.length === 1) {
        offsetMap.set(group[0].id, group[0].effectiveLocation!);
      } else {
        const radius = 0.0022; // ~240m visual separation at city zoom so avatars never collide
        group.forEach((r, idx) => {
          const angle = (2 * Math.PI * idx) / group.length;
          offsetMap.set(r.id, {
            lat: r.effectiveLocation!.lat + radius * Math.sin(angle),
            lng: r.effectiveLocation!.lng + radius * Math.cos(angle),
          });
        });
      }
    }

    return baseList.map((r) => ({
      ...r,
      displayLocation: offsetMap.get(r.id) || r.effectiveLocation,
    }));
  }, [workingRiders, shopLocations]);

  // Active riders shown as pins on the map (online + busy, plus selected rider even if offline)
  const mapVisibleRiders = useMemo(() => {
    return ridersWithLocations.filter(
      (r) =>
        Boolean(r.displayLocation) &&
        (r.status === "online" || r.status === "busy" || r.id === selectedRiderId)
    );
  }, [ridersWithLocations, selectedRiderId]);

  const { onlineCount, busyCount, offlineCount } = useMemo(() => {
    let online = 0;
    let busy = 0;
    let offline = 0;
    for (const r of workingRiders) {
      if (r.status === "online") online++;
      else if (r.status === "busy") busy++;
      else offline++;
    }
    return { onlineCount: online, busyCount: busy, offlineCount: offline };
  }, [workingRiders]);

  const filteredSidebarRiders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ridersWithLocations
      .filter((r) => {
        if (statusFilter !== "all" && r.status !== statusFilter) return false;
        if (!q) return true;
        const branchName = shopLocations.find((s) => s.id === r.branchId)?.name || "";
        return (
          r.name.toLowerCase().includes(q) ||
          (r.nickname && r.nickname.toLowerCase().includes(q)) ||
          (r.phone && r.phone.toLowerCase().includes(q)) ||
          branchName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const score = (s: string) => (s === "busy" ? 3 : s === "online" ? 2 : 1);
        if (score(a.status) !== score(b.status)) return score(b.status) - score(a.status);
        return (a.nickname || a.name).localeCompare(b.nickname || b.name);
      });
  }, [ridersWithLocations, statusFilter, searchQuery, shopLocations]);

  const selectedRider = useMemo(
    () => ridersWithLocations.find((r) => r.id === selectedRiderId) || null,
    [ridersWithLocations, selectedRiderId]
  );

  const handleFocusRider = (rider: (typeof ridersWithLocations)[number]) => {
    setSelectedRiderId(rider.id);
    if (rider.displayLocation) {
      setMapCenter([rider.displayLocation.lat, rider.displayLocation.lng]);
      setMapZoom(15);
    }
  };

  const handleRegionChange = (val: string) => {
    setSelectedRegion(val);
    setSelectedRiderId(null);
    if (val === "bangkok") {
      setMapCenter([13.736717, 100.523186]);
      setMapZoom(12);
    } else if (val === "pattaya") {
      setMapCenter([12.9236, 100.8825]);
      setMapZoom(13);
    } else {
      const shop = shopLocations.find((s) => s.id === val);
      if (shop) {
        setMapCenter([shop.coords.lat, shop.coords.lng]);
        setMapZoom(14);
      }
    }
  };

  if (!isMounted) return null;

  // Compact mode for embedded dashboard widget
  if (minimal) {
    return (
      <div className="relative flex flex-col h-full bg-slate-50 w-full overflow-hidden rounded-xl">
        <div className="absolute top-2.5 left-2.5 z-[1000] flex items-center gap-1.5 bg-white/95 backdrop-blur-md px-2.5 py-1.5 rounded-xl shadow-md border border-slate-200/80 text-[11px] font-bold">
          <span className="flex items-center gap-1 text-emerald-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> {onlineCount} Online
          </span>
          <span className="text-slate-300">•</span>
          <span className="flex items-center gap-1 text-amber-700">
            <span className="w-2 h-2 rounded-full bg-amber-500" /> {busyCount} Busy
          </span>
        </div>

        <div className="absolute top-2.5 right-2.5 z-[1000] bg-white/95 backdrop-blur-md px-2 py-1 rounded-xl shadow-md border border-slate-200/80">
          <select
            value={selectedRegion}
            className="text-xs bg-transparent focus:outline-none cursor-pointer text-slate-700 font-bold"
            onChange={(e) => handleRegionChange(e.target.value)}
          >
            <option value="bangkok">Bangkok</option>
            <option value="pattaya">Pattaya</option>
            {shopLocations.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name}
              </option>
            ))}
          </select>
        </div>

        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          className="h-full w-full z-0"
          zoomControl={false}
          dragging={true}
          scrollWheelZoom={false}
        >
          <ZoomControl position="bottomright" />
          <MapUpdater center={mapCenter} zoom={mapZoom} />
          <TileLayer
            attribution='&copy; <a href="https://maps.google.com">Google Maps</a>'
            url="https://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}"
          />
          {shopLocations.map((shop) => (
            <Marker key={`shop-${shop.id}`} position={[shop.coords.lat, shop.coords.lng]} icon={getShopIcon(shop)} zIndexOffset={500} />
          ))}
          {mapVisibleRiders.map((rider) => {
            const taskCounts = activeTaskCountByRider.get(rider.id);
            return (
              <Marker
                key={rider.id}
                position={[rider.displayLocation!.lat, rider.displayLocation!.lng]}
                icon={getAvatarIcon(rider, rider.id === selectedRiderId, taskCounts?.total || 0)}
                zIndexOffset={1000}
              />
            );
          })}
        </MapContainer>
      </div>
    );
  }

  // Full Modern Fleet & Live GPS Command Center
  return (
    <div className="flex-1 bg-slate-50/70 p-4 lg:p-5 flex flex-col min-h-0 lg:h-[calc(100vh-4rem)] overflow-y-auto lg:overflow-hidden">
      {/* Top Header & Region / Status Command Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 bg-gradient-to-br from-emerald-600 to-teal-600 text-white rounded-2xl flex items-center justify-center shadow-sm shadow-emerald-500/20 shrink-0">
            <Compass size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-black text-slate-900 tracking-tight">Live Fleet GPS Monitor</h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Telemetry
              </span>
              {lastSyncedAt && (
                <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-slate-400 font-medium">
                  <Clock size={11} /> Updated {lastSyncedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              )}
            </div>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              Real-time GPS tracking for active working riders, branch hubs, and ongoing pickup & delivery dispatches.
            </p>
          </div>
        </div>

        {/* Right Controls: Quick Region Switcher + Branch Selector + Refresh */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Region Segmented Buttons */}
          <div className="inline-flex items-center bg-white p-1 rounded-xl border border-slate-200/90 shadow-2xs">
            <button
              type="button"
              onClick={() => handleRegionChange("bangkok")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedRegion === "bangkok"
                  ? "bg-indigo-600 text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              Bangkok
            </button>
            <button
              type="button"
              onClick={() => handleRegionChange("pattaya")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedRegion === "pattaya"
                  ? "bg-indigo-600 text-white shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              Pattaya
            </button>
          </div>

          {/* Branch Focus Dropdown */}
          <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-slate-200/90 shadow-2xs">
            <Store size={14} className="text-indigo-600 shrink-0" />
            <select
              value={selectedRegion}
              onChange={(e) => handleRegionChange(e.target.value)}
              className="text-xs font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer pr-1"
            >
              <option value="bangkok">All Bangkok Branches</option>
              <option value="pattaya">All Pattaya Branches</option>
              <optgroup label="Jump to Specific Branch">
                {shopLocations.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Manual Refresh GPS Button */}
          <button
            type="button"
            onClick={() => pollRiderLocations(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 text-xs font-bold shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
            title="Refresh Rider GPS Coordinates Now"
          >
            <RefreshCw size={13.5} className={isRefreshing ? "animate-spin text-indigo-600" : "text-slate-500"} />
            <span className="hidden sm:inline">Refresh GPS</span>
          </button>
        </div>
      </div>

      {/* Main Content Split: Left Fleet Roster Sidebar + Right Interactive Map */}
      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        {/* LEFT SIDEBAR: Active Working Riders & Branches Roster */}
        <div className="w-full lg:w-[355px] xl:w-[380px] flex flex-col gap-3.5 shrink-0 min-h-0 lg:h-full">
          {/* Fleet KPI Summary Strip */}
          <div className="grid grid-cols-3 gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSidebarTab("riders");
                setStatusFilter(statusFilter === "online" ? "all" : "online");
              }}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                statusFilter === "online"
                  ? "bg-emerald-50/90 border-emerald-300 ring-2 ring-emerald-500/15"
                  : "bg-white border-slate-200/90 hover:border-emerald-200 shadow-2xs"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Online</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="text-xl font-black text-emerald-700 mt-0.5">{onlineCount}</div>
              <div className="text-[10px] font-medium text-slate-400">Ready for jobs</div>
            </button>

            <button
              type="button"
              onClick={() => {
                setSidebarTab("riders");
                setStatusFilter(statusFilter === "busy" ? "all" : "busy");
              }}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                statusFilter === "busy"
                  ? "bg-amber-50/90 border-amber-300 ring-2 ring-amber-500/15"
                  : "bg-white border-slate-200/90 hover:border-amber-200 shadow-2xs"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Busy</span>
                <span className="w-2 h-2 rounded-full bg-amber-500" />
              </div>
              <div className="text-xl font-black text-amber-700 mt-0.5">{busyCount}</div>
              <div className="text-[10px] font-medium text-slate-400">On dispatch</div>
            </button>

            <button
              type="button"
              onClick={() => {
                setSidebarTab("riders");
                setStatusFilter(statusFilter === "offline" ? "all" : "offline");
              }}
              className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                statusFilter === "offline"
                  ? "bg-slate-100 border-slate-300 ring-2 ring-slate-400/15"
                  : "bg-white border-slate-200/90 hover:border-slate-300 shadow-2xs"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Offline</span>
                <span className="w-2 h-2 rounded-full bg-slate-300" />
              </div>
              <div className="text-xl font-black text-slate-700 mt-0.5">{offlineCount}</div>
              <div className="text-[10px] font-medium text-slate-400">Off duty</div>
            </button>
          </div>

          {/* Roster Directory Card */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex-1 min-h-[280px] flex flex-col overflow-hidden">
            {/* Sidebar Mode Switcher (Working Riders vs Branches) */}
            <div className="p-3 border-b border-slate-100 space-y-2.5 shrink-0">
              <div className="grid grid-cols-2 gap-1.5 bg-slate-100/80 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setSidebarTab("riders")}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                    sidebarTab === "riders"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Users size={13.5} className={sidebarTab === "riders" ? "text-indigo-600" : "text-slate-400"} />
                  <span>Working Riders ({workingRiders.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarTab("branches")}
                  className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer ${
                    sidebarTab === "branches"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <Store size={13.5} className={sidebarTab === "branches" ? "text-indigo-600" : "text-slate-400"} />
                  <span>Branches ({shopLocations.length})</span>
                </button>
              </div>

              {sidebarTab === "riders" && (
                <>
                  {/* Search Input */}
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search rider name, nickname, or branch..."
                      className="w-full h-8.5 pl-8 pr-7 text-xs bg-slate-50/90 border border-slate-200/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  {/* Filter Pills */}
                  <div className="flex items-center gap-1">
                    {(["all", "online", "busy", "offline"] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setStatusFilter(st)}
                        className={`flex-1 py-1 rounded-lg text-[10.5px] font-bold capitalize transition-colors cursor-pointer ${
                          statusFilter === st
                            ? "bg-slate-900 text-white"
                            : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                        }`}
                      >
                        {st === "all" ? `All (${workingRiders.length})` : st}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Scrollable List Content */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2 space-y-1">
              {sidebarTab === "riders" ? (
                filteredSidebarRiders.length === 0 ? (
                  <div className="py-12 text-center px-4">
                    <Users size={26} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-xs font-bold text-slate-500">No riders match your filter</p>
                    <p className="text-[10.5px] text-slate-400 mt-0.5">
                      Try switching the status tab or clearing your search query.
                    </p>
                  </div>
                ) : (
                  filteredSidebarRiders.map((rider) => {
                    const isSelected = rider.id === selectedRiderId;
                    const assignedBranch = shopLocations.find((s) => s.id === rider.branchId);
                    const tasks = activeTaskCountByRider.get(rider.id);

                    return (
                      <div
                        key={rider.id}
                        onClick={() => handleFocusRider(rider)}
                        className={`group flex items-center justify-between gap-2.5 p-2.5 rounded-xl transition-all cursor-pointer ${
                          isSelected
                            ? "bg-indigo-50/90 border border-indigo-300 shadow-2xs"
                            : "hover:bg-slate-50 border border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="relative shrink-0">
                            <img
                              src={
                                rider.avatarUrl ||
                                `https://ui-avatars.com/api/?name=${encodeURIComponent(rider.name)}&background=4f46e5&color=fff`
                              }
                              alt={rider.name}
                              className={`w-10 h-10 rounded-full object-cover border-2 ${
                                rider.status === "online"
                                  ? "border-emerald-500"
                                  : rider.status === "busy"
                                    ? "border-amber-500"
                                    : "border-slate-300 opacity-75"
                              }`}
                            />
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                                rider.status === "online"
                                  ? "bg-emerald-500"
                                  : rider.status === "busy"
                                    ? "bg-amber-500"
                                    : "bg-slate-400"
                              }`}
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-extrabold text-slate-900 truncate">
                                {rider.nickname ? `${rider.nickname} (${rider.name})` : rider.name}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span
                                className={`inline-flex items-center px-1.5 py-0 rounded text-[9px] font-extrabold uppercase ${
                                  rider.status === "online"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : rider.status === "busy"
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {rider.status}
                              </span>
                              {assignedBranch && (
                                <span className="text-[10px] font-semibold text-slate-500 truncate max-w-[140px]">
                                  • {assignedBranch.name.replace("That Laundry Shop ", "")}
                                </span>
                              )}
                            </div>

                            {(() => {
                              const gpsInfo = formatRiderGpsTimestamp(rider.gpsUpdatedAt);
                              if (!gpsInfo) return null;
                              return (
                                <div className="flex items-center gap-1 mt-1">
                                  <Clock size={10} className={gpsInfo.isToday ? "text-emerald-600" : "text-slate-400"} />
                                  <span className={`text-[10px] font-semibold ${gpsInfo.isToday ? "text-emerald-700" : "text-slate-500"}`}>
                                    พิกัดล่าสุด: {gpsInfo.label}
                                  </span>
                                </div>
                              );
                            })()}

                            {tasks && tasks.total > 0 && (
                              <div className="flex items-center gap-1.5 mt-1">
                                {tasks.pickup > 0 && (
                                  <span className="inline-flex items-center gap-0.5 text-[9.5px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0 rounded-md">
                                    <Package size={9.5} /> {tasks.pickup} Pickup
                                  </span>
                                )}
                                {tasks.delivery > 0 && (
                                  <span className="inline-flex items-center gap-0.5 text-[9.5px] font-bold text-teal-800 bg-teal-50 border border-teal-200 px-1.5 py-0 rounded-md">
                                    <Truck size={9.5} /> {tasks.delivery} Delivery
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 group-hover:translate-x-0.5 transition-transform">
                            Locate <ChevronRight size={12} />
                          </span>
                          <span className="text-[9.5px] font-semibold text-slate-400">
                            ★ {rider.rating.toFixed(1)} • {rider.completedJobs} jobs
                          </span>
                        </div>
                      </div>
                    );
                  })
                )
              ) : (
                shopLocations.map((shop) => {
                  const branchRiders = workingRiders.filter((r) => r.branchId === shop.id);
                  const activeBranchRiders = branchRiders.filter((r) => r.status === "online" || r.status === "busy");
                  const isFocused = selectedRegion === shop.id;

                  return (
                    <div
                      key={shop.id}
                      onClick={() => handleRegionChange(shop.id)}
                      className={`flex items-center justify-between gap-2.5 p-2.5 rounded-xl transition-all cursor-pointer ${
                        isFocused
                          ? "bg-indigo-50/90 border border-indigo-300 shadow-2xs"
                          : "hover:bg-slate-50 border border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                          <Store size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-extrabold text-slate-900 truncate">{shop.name}</div>
                          <div className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                            {activeBranchRiders.length} active / {branchRiders.length} assigned riders
                          </div>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-indigo-600 shrink-0 flex items-center gap-0.5">
                        Focus <ChevronRight size={12} />
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: Interactive Live Map Canvas & Floating Overlays */}
        <div className="flex-1 min-h-[450px] bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden relative">
          {/* Top-Left Map Legend & Layer Toggle */}
          <div className="absolute top-3.5 left-3.5 z-[1000] flex flex-wrap items-center gap-2 pointer-events-auto">
            <div className="bg-white/95 backdrop-blur-md px-3 py-2 rounded-xl shadow-md border border-slate-200/80 flex items-center gap-3 text-[11px] font-bold text-slate-700">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-200 animate-pulse" />
                Online ({onlineCount})
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-amber-200" />
                Busy ({busyCount})
              </span>
              <button
                type="button"
                onClick={() => setShowShopMarkers((v) => !v)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] transition-colors cursor-pointer ${
                  showShopMarkers
                    ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                    : "bg-slate-50 text-slate-400 border-slate-200"
                }`}
                title="Toggle Store Branch Pins on Map"
              >
                <Layers size={11} />
                <span>Branches ({shopLocations.length})</span>
              </button>
            </div>
          </div>

          {/* Selected Rider Spotlight Overlay Card (Bottom Left of Map) */}
          {selectedRider && (
            <div className="absolute bottom-4 left-4 z-[1000] bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-slate-200/90 w-[300px] sm:w-[330px] animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <img
                    src={
                      selectedRider.avatarUrl ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedRider.name)}&background=4f46e5&color=fff`
                    }
                    alt={selectedRider.name}
                    className="w-12 h-12 rounded-full object-cover border-2 border-indigo-500 shadow-xs"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm font-black text-slate-900">
                        {selectedRider.nickname ? `${selectedRider.nickname} (${selectedRider.name})` : selectedRider.name}
                      </h3>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase text-white ${
                          selectedRider.status === "online"
                            ? "bg-emerald-500"
                            : selectedRider.status === "busy"
                              ? "bg-amber-500"
                              : "bg-slate-400"
                        }`}
                      >
                        {selectedRider.status}
                      </span>
                    </div>
                    <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                      {shopLocations.find((s) => s.id === selectedRider.branchId)?.name || "All Branches"}
                    </p>
                    {(() => {
                      const gpsInfo = formatRiderGpsTimestamp(selectedRider.gpsUpdatedAt);
                      return (
                        <p className={`text-[10.5px] font-bold mt-1 flex items-center gap-1 ${gpsInfo?.isToday ? "text-emerald-700" : "text-slate-500"}`}>
                          <Clock size={11} />
                          <span>อัปเดตพิกัดล่าสุด: {gpsInfo ? gpsInfo.label : "ยังไม่มีข้อมูลเวลา"}</span>
                        </p>
                      );
                    })()}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRiderId(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-50 rounded-xl p-2 border border-slate-100">
                  <div className="text-[9.5px] font-bold text-slate-400 uppercase">Rating</div>
                  <div className="text-xs font-black text-amber-600 mt-0.5 flex items-center justify-center gap-0.5">
                    <Star size={11} className="fill-amber-400 text-amber-400" /> {selectedRider.rating.toFixed(1)}
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-2 border border-slate-100">
                  <div className="text-[9.5px] font-bold text-slate-400 uppercase">Completed</div>
                  <div className="text-xs font-black text-slate-800 mt-0.5">{selectedRider.completedJobs}</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-2 border border-slate-100">
                  <div className="text-[9.5px] font-bold text-slate-400 uppercase">Active Now</div>
                  <div className="text-xs font-black text-indigo-600 mt-0.5">
                    {activeTaskCountByRider.get(selectedRider.id)?.total || 0} jobs
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                {selectedRider.phone && (
                  <a
                    href={`tel:${selectedRider.phone}`}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                  >
                    <Phone size={12} /> {selectedRider.phone}
                  </a>
                )}
                {selectedRider.effectiveLocation && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${selectedRider.effectiveLocation.lat},${selectedRider.effectiveLocation.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors"
                  >
                    <ExternalLink size={12} /> Google Maps
                  </a>
                )}
              </div>
            </div>
          )}

          <MapContainer
            center={mapCenter}
            zoom={mapZoom}
            className="h-full w-full z-0"
            zoomControl={false}
            dragging={true}
            scrollWheelZoom={true}
          >
            <ZoomControl position="bottomright" />
            <MapUpdater center={mapCenter} zoom={mapZoom} />
            <TileLayer
              attribution='&copy; <a href="https://maps.google.com">Google Maps</a>'
              url="https://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}"
            />

            {/* Render Shop Markers */}
            {showShopMarkers &&
              shopLocations.map((shop) => (
                <Marker
                  key={`shop-${shop.id}`}
                  position={[shop.coords.lat, shop.coords.lng]}
                  icon={getShopIcon(shop)}
                  zIndexOffset={500}
                >
                  <Tooltip
                    direction="top"
                    className="font-sans font-bold text-xs shadow-md border-0 bg-slate-900 text-white"
                    opacity={0.95}
                    offset={[0, -32]}
                  >
                    {shop.name}
                  </Tooltip>
                </Marker>
              ))}

            {/* Render Live Riders (De-clustered with clear name badges) */}
            {mapVisibleRiders.map((rider) => {
              const taskCounts = activeTaskCountByRider.get(rider.id);
              return (
                <Marker
                  key={rider.id}
                  position={[rider.displayLocation!.lat, rider.displayLocation!.lng]}
                  icon={getAvatarIcon(rider, rider.id === selectedRiderId, taskCounts?.total || 0)}
                  zIndexOffset={rider.id === selectedRiderId ? 2000 : 1000}
                  eventHandlers={{
                    click: () => setSelectedRiderId(rider.id),
                  }}
                >
                  <Popup className="rounded-xl font-sans" offset={[0, -24]}>
                    <div className="p-1 min-w-[180px]">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <h3 className="font-bold text-slate-900 text-sm m-0">
                          {rider.nickname ? `${rider.nickname} (${rider.name})` : rider.name}
                        </h3>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold text-white ${
                            rider.status === "busy"
                              ? "bg-amber-500"
                              : rider.status === "online"
                                ? "bg-emerald-500"
                                : "bg-slate-400"
                          }`}
                        >
                          {rider.status}
                        </span>
                      </div>

                      {rider.status === "busy" ? (
                        <div className="p-2 bg-amber-50 rounded-lg border border-amber-200 mb-2 text-center">
                          <span className="text-xs font-bold text-amber-800">
                            On active dispatch ({taskCounts?.total || 1} job)
                          </span>
                        </div>
                      ) : rider.status === "online" ? (
                        <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200 mb-2 text-emerald-700 text-xs font-bold text-center">
                          Available for dispatch
                        </div>
                      ) : (
                        <div className="p-2 bg-slate-50 rounded-lg border border-slate-200 mb-2 text-slate-600 text-xs font-semibold text-center">
                          Currently offline
                        </div>
                      )}

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-700">
                        <span className="flex items-center gap-1 text-amber-500">★ {rider.rating.toFixed(1)}</span>
                        <span>{rider.completedJobs} completed</span>
                      </div>
                      {(() => {
                        const gpsInfo = formatRiderGpsTimestamp(rider.gpsUpdatedAt);
                        return (
                          <div className={`mt-1.5 text-[10.5px] px-2 py-1 rounded-md border flex items-center justify-center gap-1 font-semibold ${
                            gpsInfo?.isToday
                              ? "bg-emerald-50/70 text-emerald-800 border-emerald-200/80"
                              : "bg-slate-50 text-slate-600 border-slate-200"
                          }`}>
                            <Clock size={10.5} />
                            <span>พิกัดล่าสุด: {gpsInfo ? gpsInfo.label : "ยังไม่มีข้อมูลเวลา"}</span>
                          </div>
                        );
                      })()}
                      {rider.vehiclePlate && (
                        <div className="mt-2 text-[10px] text-slate-500 bg-slate-50 p-1.5 rounded-md text-center border border-slate-200 font-semibold">
                          {rider.vehicleType === "motorcycle" ? "🏍️" : rider.vehicleType === "truck" ? "🚚" : "🚗"}{" "}
                          {rider.vehiclePlate}
                        </div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      </div>
    </div>
  );
});
