"use client";

import "leaflet/dist/leaflet.css";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";
import "leaflet-defaulticon-compatibility";

import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from "react-leaflet";
import L from "leaflet";
import { useEffect, useState } from "react";
import type { LatLng } from "@/lib/store";

export const pickupIcon = new L.DivIcon({
  className: "custom-marker",
  html: `<div style="
    width: 28px; height: 28px;
    background: #059669;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    display: flex; align-items: center; justify-content: center;
  "><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
});

export const dropoffIcon = new L.DivIcon({
  className: "custom-marker",
  html: `<div style="
    width: 28px; height: 28px;
    background: #ef4444;
    border: 3px solid white;
    border-radius: 50%;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    display: flex; align-items: center; justify-content: center;
  "><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
  popupAnchor: [0, -14],
});

// Component to fit map bounds to show all markers
function FitBounds({ coords }: { coords: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (coords.length > 0) {
      const bounds = L.latLngBounds(coords.map((c) => [c.lat, c.lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [map, coords]);
  return null;
}

// ─── Full Map (Admin Dashboard) ─────────────────────────────────────
export interface MapMarker {
  id: string;
  label: string;
  pickup: LatLng;
  dropoff: LatLng;
  pickupLabel: string;
  dropoffLabel: string;
  status: string;
}

interface FullMapProps {
  markers: MapMarker[];
  className?: string;
}

export function FullMap({ markers, className = "" }: FullMapProps) {
  const allCoords = markers.flatMap((m) => [m.pickup, m.dropoff]);

  return (
    <div className={`rounded-xl overflow-hidden border border-slate-200 shadow-sm ${className}`}>
      <MapContainer
        center={[13.736717, 100.523186]}
        zoom={12}
        className="h-full w-full"
        style={{ minHeight: "100%", zIndex: 0 }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://maps.google.com">Google Maps</a>'
          url="http://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}"
        />
        {allCoords.length > 0 && <FitBounds coords={allCoords} />}
        {markers.map((m) => (
          <span key={m.id}>
            <Marker position={[m.pickup.lat, m.pickup.lng]} icon={pickupIcon}>
              <Popup>
                <div className="text-xs">
                  <p className="font-bold text-emerald-700">{m.id} — Pickup</p>
                  <p className="text-slate-600">{m.pickupLabel}</p>
                </div>
              </Popup>
            </Marker>
            <Marker position={[m.dropoff.lat, m.dropoff.lng]} icon={dropoffIcon}>
              <Popup>
                <div className="text-xs">
                  <p className="font-bold text-red-600">{m.id} — Drop-off</p>
                  <p className="text-slate-600">{m.dropoffLabel}</p>
                </div>
              </Popup>
            </Marker>
          </span>
        ))}
      </MapContainer>
    </div>
  );
}

// ─── Mini Map (Rider Card) ──────────────────────────────────────────
interface MiniMapProps {
  pickup: LatLng;
  dropoff: LatLng;
  pickupLabel: string;
  dropoffLabel: string;
}

export function MiniMap({ pickup, dropoff, pickupLabel, dropoffLabel }: MiniMapProps) {
  const [routePath, setRoutePath] = useState<LatLng[] | null>(null);

  useEffect(() => {
    async function fetchRoute() {
      try {
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}?overview=full&geometries=geojson`);
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
          setRoutePath(data.routes[0].geometry.coordinates.map((c: [number, number]) => ({ lat: c[1], lng: c[0] })));
        }
      } catch (e) {
        console.error("OSRM Error:", e);
      }
    }
    fetchRoute();
  }, [pickup, dropoff]);

  return (
    <div className="rounded-lg overflow-hidden border border-slate-200 shadow-inner" style={{ height: 180 }}>
      <MapContainer
        center={[pickup.lat, pickup.lng]}
        zoom={14}
        className="h-full w-full"
        style={{ height: 180, zIndex: 0 }}
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://maps.google.com">Google Maps</a>'
          url="http://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}"
        />
        <FitBounds coords={routePath && routePath.length > 0 ? routePath : [pickup, dropoff]} />
        
        {routePath && (
          <Polyline 
            positions={routePath.map(p => [p.lat, p.lng])} 
            pathOptions={{ color: '#3b82f6', weight: 4, dashArray: '2, 6', opacity: 0.8 }} 
          />
        )}

        <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon}>
          <Popup><span className="text-xs font-medium">{pickupLabel}</span></Popup>
        </Marker>
        <Marker position={[dropoff.lat, dropoff.lng]} icon={dropoffIcon}>
          <Popup><span className="text-xs font-medium">{dropoffLabel}</span></Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
