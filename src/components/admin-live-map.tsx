"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useRiders } from "@/lib/use-riders";
import { shopStore, type Rider, type LatLng } from "@/lib/store";
import { useSyncExternalStore } from "react";

// OSRM Path Fetcher
async function fetchOSRMRoute(start: LatLng, end: LatLng): Promise<LatLng[] | null> {
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`);
    const data = await res.json();
    if (data.routes && data.routes.length > 0) {
      return data.routes[0].geometry.coordinates.map((c: [number, number]) => ({ lat: c[1], lng: c[0] }));
    }
  } catch (e) {
    console.error("OSRM Error:", e);
  }
  return null;
}

// Math util for interpolation
function getEuclideanDistance(p1: LatLng, p2: LatLng) {
  const dx = p1.lng - p2.lng;
  const dy = p1.lat - p2.lat;
  return Math.sqrt(dx * dx + dy * dy);
}

function getPointAtDistance(path: LatLng[], targetDist: number): LatLng | null {
  if (!path || path.length === 0) return null;
  let currDist = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const d = getEuclideanDistance(path[i], path[i + 1]);
    if (currDist + d >= targetDist) {
      const remain = targetDist - currDist;
      const progress = d > 0 ? remain / d : 0;
      return { 
        lat: path[i].lat + (path[i + 1].lat - path[i].lat) * progress, 
        lng: path[i].lng + (path[i + 1].lng - path[i].lng) * progress 
      };
    }
    currDist += d;
  }
  return path[path.length - 1]; // End of path
}



// Helper to create a custom div icon with the rider's avatar
function createAvatarIcon(rider: Rider & { _speed?: number }) {
  const speed = rider._speed || 0;
  return L.divIcon({
    className: "bg-transparent border-none overflow-visible",
    html: `
      <div style="position: absolute; width: 56px; height: 56px; transform: translate(-28px, -56px);" class="rounded-full shadow-lg transition-all duration-1000 ease-linear">
        <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm border border-slate-700 z-20 whitespace-nowrap">
          ${speed} km/h
        </div>
        <div class="relative w-full h-full rounded-full border-[3px] bg-white ${
          rider.status === 'online' ? 'border-emerald-500' :
          rider.status === 'busy' ? 'border-amber-500' : 'border-slate-400'
        }">
          <img src="${rider.avatarUrl || 'https://i.pravatar.cc/150'}" style="width: 100%; height: 100%; object-fit: cover;" class="rounded-full" />
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

export function AdminLiveMap({ minimal = false }: { minimal?: boolean }) {
  const riders = useRiders();
  const shopLocations = useSyncExternalStore(shopStore.subscribe, shopStore.getSnapshot, shopStore.getSnapshot);
  const [isMounted, setIsMounted] = useState(false);
  const [simulatedRiders, setSimulatedRiders] = useState<Rider[]>([]);

  // Waypoints for simulation (Bangkok specific areas)
  const waypoints = [
    { name: "Asoke", lat: 13.7380, lng: 100.5600 },
    { name: "Nana", lat: 13.7420, lng: 100.5500 },
    { name: "Phloen Chit", lat: 13.7460, lng: 100.5400 },
    { name: "Silom", lat: 13.7300, lng: 100.5300 },
    { name: "Sathorn", lat: 13.7200, lng: 100.5200 },
    { name: "Thong Lo", lat: 13.7500, lng: 100.5700 },
    { name: "Ekkamai", lat: 13.7600, lng: 100.5800 },
  ];

  // Initialize simulation
  useEffect(() => {
    setIsMounted(true);
    setSimulatedRiders(riders.map((r, i) => {
      const idx = (i * 2) % waypoints.length;
      return {
        ...r,
        // Assign a source/destination explicitly for line tracing
        _startWaypoint: (idx + 1) % waypoints.length,
        _targetWaypoint: idx,
        _progress: 0.2 // Start partway through
      };
    }));
  }, [riders]);

  const simulatedRidersRef = useRef(simulatedRiders);
  useEffect(() => {
    simulatedRidersRef.current = simulatedRiders;
  }, [simulatedRiders]);

  // Simulation loop
  useEffect(() => {
    if (!isMounted) return;

    // We keep a single timeout loop to manage all riders cleanly
    let active = true;

    async function tick() {
      if (!active) return;
      
      const updatedRiders = await Promise.all(
        simulatedRidersRef.current.map(async (rider: any) => {
          if (!rider.currentLocation) return rider;

          let targetWpIndex = rider._targetWaypoint ?? 0;
          let startWpIndex = rider._startWaypoint ?? 0;
          let path = rider._path;
          let distanceTraveled = rider._distanceTraveled ?? 0;
          
          let speedKmh = rider._speed;
          if (!speedKmh) speedKmh = rider.status === 'busy' ? 50 + Math.floor(Math.random() * 20) : 35 + Math.floor(Math.random() * 15);

          // Fetch path if missing
          if (!path && !rider._fetchingRoute) {
            rider._fetchingRoute = true;
            const route = await fetchOSRMRoute(waypoints[startWpIndex], waypoints[targetWpIndex]);
            if (route) {
              path = route;
              rider._path = path;
              rider._distanceTraveled = 0;
            }
            rider._fetchingRoute = false;
          }

          if (path) {
            // Calculate step size based on approx map scaling (this is a rough Euclidean approximation for visuals)
            // 1 degree lat/lng ~= 111km. So speed in degrees per sec = (speedKmh / 3600) / 111.
            const speedDegPerSec = (speedKmh / 3600) / 111;
            distanceTraveled += speedDegPerSec;

            const newLoc = getPointAtDistance(path, distanceTraveled);
            
            if (newLoc !== path[path.length - 1]) {
              // Still moving
              return {
                ...rider,
                currentLocation: newLoc,
                _distanceTraveled: distanceTraveled,
                _speed: speedKmh,
                _path: path
              };
            } else {
              // Reached target
              startWpIndex = targetWpIndex;
              targetWpIndex = Math.floor(Math.random() * waypoints.length);
              if (targetWpIndex === startWpIndex) targetWpIndex = (startWpIndex + 1) % waypoints.length;
              
              return {
                ...rider,
                currentLocation: waypoints[startWpIndex],
                _startWaypoint: startWpIndex,
                _targetWaypoint: targetWpIndex,
                _path: null, // Clear path to re-fetch next tick
                _distanceTraveled: 0,
                // Add jitter to speed for realism
                _speed: rider.status === 'busy' ? 50 + Math.floor(Math.random() * 20) : 35 + Math.floor(Math.random() * 15)
              };
            }
          }

          return rider; // Fallback while fetching
        })
      );

      if (active) {
        setSimulatedRiders(updatedRiders);
        setTimeout(tick, 1500); // 1.5 second tick
      }
    }

    // Delay start slightly to allow initial render
    const t = setTimeout(tick, 500);

    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [isMounted]);

  if (!isMounted) return null;

  return (
    <div className={`relative flex flex-col h-full bg-slate-50 w-full overflow-hidden ${minimal ? '' : 'flex-1 rounded-tl-xl border-t border-l border-slate-200'}`}>
      {!minimal && (
        <div className="absolute top-4 left-6 z-[1000] flex items-center gap-3">
          <h2 className="text-lg font-bold text-slate-900 bg-white/95 px-5 py-2.5 rounded-xl shadow-lg border border-slate-200/60 backdrop-blur-md">
            Live Fleet Monitor
          </h2>
          <div className="flex gap-2 text-xs font-medium bg-white/95 px-4 py-2.5 rounded-xl shadow-lg border border-slate-200/60">
            <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Online ({simulatedRiders.filter(r => r.status === 'online').length})</span>
            <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-amber-500" /> Busy ({simulatedRiders.filter(r => r.status === 'busy').length})</span>
          </div>
        </div>
      )}

      <MapContainer
        center={[13.736717, 100.523186]}
        zoom={12}
        className="h-full w-full z-0"
        zoomControl={true}
        dragging={true}
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://maps.google.com">Google Maps</a>'
          url="http://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}"
        />
        
        {/* Render Shop Markers */}
        {shopLocations.map((shop, i) => (
          <Marker 
            key={`shop-${shop.id}`}
            position={[shop.coords.lat, shop.coords.lng]}
            icon={createShopIcon(shop)}
            zIndexOffset={500}
          >
            <Tooltip direction="top" className="font-sans font-bold text-xs shadow-md border-0 bg-slate-900 text-white" opacity={0.9} offset={[0, -20]}>
              {shop.name}
            </Tooltip>
          </Marker>
        ))}
        
        {simulatedRiders.map((r) => {
          const rider = r as any;
          if (!rider.currentLocation) return null;
          
          const targetWpIndex = rider._targetWaypoint ?? 0;
          const startWpIndex = rider._startWaypoint ?? 0;
          const target = waypoints[targetWpIndex];
          const start = waypoints[startWpIndex];

          return (
            <div key={rider.id}>
              {/* Draw True Road Polyline if busy */}
              {rider.status === 'busy' && rider._path && (
                <Polyline 
                  positions={rider._path.map((p: LatLng) => [p.lat, p.lng])} 
                  pathOptions={{ 
                    color: '#f59e0b', 
                    weight: 4, 
                    dashArray: '4, 6', // Dotted trace route
                    opacity: 0.8 
                  }} 
                />
              )}

              {/* End Point Dot */}
              {rider.status === 'busy' && (
                <Marker
                  position={[target.lat, target.lng]}
                  icon={L.divIcon({
                    className: "bg-transparent border-none overflow-visible",
                    html: `<div style="width: 12px; height: 12px; transform: translate(-6px, -6px);" class="bg-white border-4 border-amber-500 rounded-full shadow-sm"></div>`,
                    iconSize: [0,0], iconAnchor: [0,0]
                  })}
                  zIndexOffset={400}
                >
                  <Tooltip direction="top" offset={[0, -10]} className="font-sans font-bold text-[10px] uppercase tracking-wider text-amber-900 bg-amber-100 border-amber-200">
                    Destination: {target.name}
                  </Tooltip>
                </Marker>
              )}

              <Marker 
                position={[rider.currentLocation.lat, rider.currentLocation.lng]}
                icon={createAvatarIcon(rider)}
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
                      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 mb-2 shadow-sm">
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2">Current Delivery</div>
                        <div className="text-xs text-slate-700 flex flex-col gap-1.5 relative pl-3">
                          <div className="absolute left-[3px] top-2 bottom-2 border-l-2 border-dashed border-slate-200"></div>
                          <span className="flex items-center gap-2 relative z-10 bg-slate-50">
                            <div className="w-2.5 h-2.5 rounded-full border-2 border-slate-400 bg-white -ml-[8px] flex-shrink-0"></div> 
                            <span className="truncate">{start.name}</span>
                          </span>
                          <span className="flex items-center gap-2 relative z-10 bg-slate-50">
                            <div className="w-2.5 h-2.5 rounded-full border-2 border-amber-500 bg-white -ml-[8px] flex-shrink-0"></div> 
                            <span className="truncate font-bold text-amber-700">{target.name}</span>
                          </span>
                        </div>
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
            </div>
          );
        })}
      </MapContainer>
    </div>
  );
}
