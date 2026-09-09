"use client";

import React, { useState, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useRiders } from "@/lib/use-riders";
import { shopStore, riderStore, type Rider } from "@/lib/store";
import { useSyncExternalStore } from "react";
import { useAuth } from "@/providers/auth-provider";

// Helper to create a custom div icon with the rider's avatar
function createAvatarIcon(rider: Rider) {
  return L.divIcon({
    className: "bg-transparent border-none overflow-visible",
    html: `
      <div style="position: absolute; width: 56px; height: 56px; transform: translate(-28px, -56px);" class="rounded-full shadow-lg transition-all duration-1000 ease-linear">
        <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm border border-slate-700 z-20 whitespace-nowrap">
          Live
        </div>
        <div class="relative w-full h-full rounded-full border-[3px] bg-white ${
          rider.status === 'online' ? 'border-emerald-500' :
          rider.status === 'busy' ? 'border-amber-500' : 'border-slate-400'
        }">
          <img src="${rider.avatarUrl || 'https://i.pravatar.cc/150'}" style="width: 100%; height: 100%; object-fit: cover;" class="rounded-full" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(rider.name)}&background=64748b&color=fff'" />
          <div class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${
            rider.status === 'online' ? 'bg-emerald-500' :
            rider.status === 'busy' ? 'bg-amber-500' : 'bg-slate-400'
          }"></div>
        </div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -60],
  });
}

// Icon caches to prevent Leaflet from destroying/re-creating DOM nodes every render
const avatarIconCache = new Map<string, L.DivIcon>();
function getAvatarIcon(rider: Rider) {
  const key = `${rider.id}-${rider.status}-${rider.avatarUrl || 'default'}`;
  let icon = avatarIconCache.get(key);
  if (!icon) {
    icon = createAvatarIcon(rider);
    avatarIconCache.set(key, icon);
  }
  return icon;
}

// Shop Marker Icon
function createShopIcon(shop: { name: string, address: string }) {
  return L.divIcon({
    className: "bg-transparent border-none overflow-visible",
    html: `
      <div style="position: absolute; transform: translate(-16px, -32px);" class="flex flex-col items-center">
        <div class="w-8 h-8 bg-white rounded-full border border-indigo-200 shadow-md flex items-center justify-center p-1 relative z-10 transition-transform hover:scale-110">
          <img src="/logo.png" class="object-contain w-full h-full opacity-90" />
        </div>
        <div class="w-2 h-2 bg-white border-b border-r border-indigo-200 rotate-45 -mt-1.5 shadow-sm"></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
    popupAnchor: [0, -36],
  });
}

const shopIconCache = new Map<string, L.DivIcon>();
function getShopIcon(shop: { id?: string, name: string, address: string }) {
  const key = shop.id || shop.name;
  let icon = shopIconCache.get(key);
  if (!icon) {
    icon = createShopIcon(shop);
    shopIconCache.set(key, icon);
  }
  return icon;
}

function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, 12, { duration: 1.5 });
  }, [center, map]);
  return null;
}

export const AdminLiveMap = React.memo(function AdminLiveMap({ minimal = false }: { minimal?: boolean }) {
  let riders = useRiders();
  const { user } = useAuth();
  const shopLocations = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  const [isMounted, setIsMounted] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([13.736717, 100.523186]); // Default Bangkok

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Real-time GPS Polling: Fetch fresh rider locations every 10s while map is mounted
  useEffect(() => {
    let isSubscribed = true;

    const pollRiderLocations = async () => {
      try {
        const res = await fetch("/api/rider-location");
        if (!res.ok) return;
        const freshRiders = await res.json();
        if (!isSubscribed || !Array.isArray(freshRiders)) return;

        for (const r of freshRiders) {
          if (r.id) {
            const updates: Partial<Rider> = { status: r.status };
            if (r.currentLat && r.currentLng) {
              updates.currentLocation = { lat: r.currentLat, lng: r.currentLng };
            }
            riderStore.updateRider(r.id, updates);
          }
        }
      } catch {
        // Silently ignore network blips
      }
    };

    pollRiderLocations();
    const interval = setInterval(pollRiderLocations, 10000);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, []);

  // Filter riders by area (manager scope)
  const filteredRiders = useMemo(() => {
    if (user?.role === 'manager' && user.area && user.area !== 'ALL') {
      return riders.filter(r => {
        const branch = shopLocations.find(s => s.id === r.branchId);
        return branch?.area === user.area;
      });
    }
    return riders;
  }, [riders, user?.role, user?.area, shopLocations]);

  // Compute active riders with fallback to assigned branch coordinates if GPS is missing or mock (13.73, 100.53)
  const activeRiders = useMemo(() => {
    return filteredRiders
      .filter(r => r.status === 'online' || r.status === 'busy')
      .map(r => {
        let loc = r.currentLocation;
        // Fallback: If rider has no GPS or default mock (13.73, 100.53) but is assigned to a specific branch (like Pattaya)
        if ((!loc || (loc.lat === 13.73 && loc.lng === 100.53)) && r.branchId) {
          const assignedBranch = shopLocations.find(s => s.id === r.branchId);
          if (assignedBranch && (assignedBranch.coords.lat !== 13.73 || assignedBranch.coords.lng !== 100.53)) {
            loc = assignedBranch.coords;
          }
        }
        return {
          ...r,
          effectiveLocation: loc,
        };
      })
      .filter(r => Boolean(r.effectiveLocation));
  }, [filteredRiders, shopLocations]);

  const { onlineCount, busyCount } = useMemo(() => {
    let online = 0;
    let busy = 0;
    for (const r of activeRiders) {
      if (r.status === 'online') online++;
      else if (r.status === 'busy') busy++;
    }
    return { onlineCount: online, busyCount: busy };
  }, [activeRiders]);

  if (!isMounted) return null;

  return (
    <div className={`relative flex flex-col h-full bg-slate-50 w-full overflow-hidden ${minimal ? '' : 'flex-1 rounded-tl-xl border-t border-l border-slate-200'}`}>
      {!minimal && (
        <div className="absolute top-4 left-4 sm:left-6 z-[1000] flex flex-col sm:flex-row items-start sm:items-center gap-2 pointer-events-none">
          <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
            <h2 className="text-sm sm:text-lg font-bold text-slate-900 bg-white/95 px-3 py-1.5 sm:px-5 sm:py-2.5 rounded-xl shadow-lg border border-slate-200/60 backdrop-blur-md">
              Live Fleet Monitor
            </h2>
            <div className="flex gap-2 text-[10px] sm:text-xs font-medium bg-white/95 px-2.5 py-1.5 sm:px-4 sm:py-2.5 rounded-xl shadow-lg border border-slate-200/60 animate-in fade-in duration-300">
              <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Online ({onlineCount})</span>
              <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500" /> Busy ({busyCount})</span>
            </div>
          </div>
        </div>
      )}

      <div className={`absolute z-[1000] pointer-events-auto ${minimal ? 'top-2 right-2' : 'top-4 right-4 sm:right-6'} bg-white/95 px-2 py-1.5 sm:px-3 sm:py-2 rounded-xl shadow-lg border border-slate-200/60 flex items-center gap-2`}>
        {!minimal && <label className="text-[10px] sm:text-xs font-bold text-slate-700 uppercase tracking-widest hidden md:block">Region Focus</label>}
        <select 
          className="text-xs sm:text-sm border border-slate-200 rounded px-1.5 py-0.5 sm:px-2 sm:py-1 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer text-slate-700 font-semibold"
          onChange={(e) => {
            const val = e.target.value;
            if (val === "bangkok") setMapCenter([13.736717, 100.523186]);
            else if (val === "pattaya") setMapCenter([12.9236, 100.8825]);
            else {
              const shop = shopLocations.find(s => s.id === val);
              if (shop) setMapCenter([shop.coords.lat, shop.coords.lng]);
            }
          }}
        >
          <option value="bangkok">Bangkok (Default)</option>
          <option value="pattaya">Pattaya</option>
          {shopLocations.map(shop => (
            <option key={shop.id} value={shop.id}>{shop.name}</option>
          ))}
        </select>
      </div>

      <MapContainer
        center={mapCenter}
        zoom={12}
        className="h-full w-full z-0"
        zoomControl={true}
        dragging={true}
        scrollWheelZoom={!minimal}
      >
        <MapUpdater center={mapCenter} />
        <TileLayer
          attribution='&copy; <a href="https://maps.google.com">Google Maps</a>'
          url="https://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}"
        />
        
        {/* Render Shop Markers */}
        {shopLocations.map((shop) => (
          <Marker 
            key={`shop-${shop.id}`}
            position={[shop.coords.lat, shop.coords.lng]}
            icon={getShopIcon(shop)}
            zIndexOffset={500}
          >
            <Tooltip direction="top" className="font-sans font-bold text-xs shadow-md border-0 bg-slate-900 text-white" opacity={0.9} offset={[0, -20]}>
              {shop.name}
            </Tooltip>
          </Marker>
        ))}
        
        {/* Render Live Riders */}
        {activeRiders.map((rider) => (
          <Marker 
            key={rider.id}
            position={[rider.effectiveLocation!.lat, rider.effectiveLocation!.lng]}
            icon={getAvatarIcon(rider)}
            zIndexOffset={1000}
          >
            <Popup className="rounded-xl font-sans" offset={[0, -20]}>
              <div className="p-1 min-w-[170px]">
                <div className="flex items-center gap-2 mb-2">
                   <h3 className="font-bold text-slate-900 text-sm m-0">{rider.name}</h3>
                   <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold text-white ${rider.status === 'busy' ? 'bg-amber-500' : 'bg-emerald-500'}`}>
                     {rider.status}
                   </span>
                </div>

                {rider.status === 'busy' ? (
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 mb-2 shadow-sm text-center">
                    <span className="text-xs font-bold text-amber-700">Currently on a delivery</span>
                  </div>
                ) : (
                  <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-100 mb-2 text-emerald-700 text-xs font-medium text-center shadow-sm">
                    Available for jobs
                  </div>
                )}

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span className="flex items-center gap-1 text-amber-500">★ {rider.rating.toFixed(1)}</span>
                  <span>{rider.completedJobs} jobs</span>
                </div>
                {rider.vehiclePlate && (
                   <div className="mt-2 text-[10px] text-slate-500 bg-slate-50 p-1.5 rounded-md text-center border border-slate-200">
                      {rider.vehicleType === 'motorcycle' ? '🏍️' : rider.vehicleType === 'truck' ? '🚚' : '🚗'} {rider.vehiclePlate}
                   </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
});
