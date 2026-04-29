"use client";

import "leaflet/dist/leaflet.css";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";
import "leaflet-defaulticon-compatibility";

import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useState, useRef } from "react";
import type { LatLng } from "@/lib/store";
import { pickupIcon, dropoffIcon } from "@/components/map-component";
import { getRoute } from "@/lib/map-api";

interface CreateJobMapProps {
  pickup: LatLng;
  dropoff: LatLng;
  onMarkerDrag: (isPickup: boolean, coords: LatLng) => void;
  onDistanceCalculated: (distanceKm: number) => void;
  className?: string;
}

// Component to handle polyline and distance calculation dynamically
function MapLineAndDistance({
  pickup,
  dropoff,
  onDistanceCalculated,
}: {
  pickup: LatLng;
  dropoff: LatLng;
  onDistanceCalculated: (distanceKm: number) => void;
}) {
  const map = useMap();
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  
  // Track if bounds have been fit for these specific coordinates to prevent infinite zoom loops during drag
  const lastFitBoundsRef = useRef("");

  // Use a ref for the callback to prevent effect re-runs if the callback reference changes
  const onDistanceCalculatedRef = useRef(onDistanceCalculated);
  useEffect(() => {
    onDistanceCalculatedRef.current = onDistanceCalculated;
  }, [onDistanceCalculated]);

  useEffect(() => {
    let active = true;
    async function fetchRoute() {
      const route = await getRoute(pickup, dropoff);
      if (!active) return;
      
      const boundsKey = `${pickup.lat},${pickup.lng}-${dropoff.lat},${dropoff.lng}`;
      
      if (route && route.coordinates.length > 0) {
        setRouteCoords(route.coordinates.map((c: LatLng) => [c.lat, c.lng] as [number, number]));
        onDistanceCalculatedRef.current(route.distanceKm);

        if (lastFitBoundsRef.current !== boundsKey) {
          const bounds = L.latLngBounds(route.coordinates.map((c: LatLng) => [c.lat, c.lng] as [number, number]));
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true });
          lastFitBoundsRef.current = boundsKey;
        }
      } else {
        // Fallback to straight line if routing fails
        setRouteCoords([[pickup.lat, pickup.lng], [dropoff.lat, dropoff.lng]]);
        const p1 = L.latLng(pickup.lat, pickup.lng);
        const p2 = L.latLng(dropoff.lat, dropoff.lng);
        onDistanceCalculatedRef.current(Math.round((p1.distanceTo(p2) / 1000) * 10) / 10);
        
        if (lastFitBoundsRef.current !== boundsKey) {
          map.fitBounds(L.latLngBounds([p1, p2]), { padding: [50, 50], maxZoom: 15, animate: true });
          lastFitBoundsRef.current = boundsKey;
        }
      }
    }
    
    fetchRoute();
    return () => { active = false; };
  }, [pickup.lat, pickup.lng, dropoff.lat, dropoff.lng, map]);

  if (routeCoords.length === 0) return null;

  return (
    <Polyline 
      positions={routeCoords} 
      pathOptions={{ color: '#3b82f6', weight: 4 }} 
    />
  );
}

export function CreateJobMap({ pickup, dropoff, onMarkerDrag, onDistanceCalculated, className = "h-full w-full" }: CreateJobMapProps) {
  const startMarkerRef = useRef<L.Marker>(null);
  const endMarkerRef = useRef<L.Marker>(null);

  const handleDragEnd = (isPickup: boolean) => {
    const marker = isPickup ? startMarkerRef.current : endMarkerRef.current;
    if (marker) {
      const pos = marker.getLatLng();
      onMarkerDrag(isPickup, { lat: pos.lat, lng: pos.lng });
    }
  };

  return (
    <div className={`h-full w-full rounded-xl overflow-hidden border border-slate-200 shadow-inner relative z-0 ${className}`}>
      <MapContainer
        center={[pickup.lat, pickup.lng]}
        zoom={13}
        className="h-full w-full"
        style={{ minHeight: "100%", zIndex: 0 }}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://maps.google.com">Google Maps</a>'
          url="http://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}"
        />
        
        <Marker 
          position={[pickup.lat, pickup.lng]} 
          icon={pickupIcon}
          draggable={true}
          eventHandlers={{ dragend: () => handleDragEnd(true) }}
          ref={startMarkerRef}
        >
          <Popup><span className="text-xs font-semibold">Drag to set Pickup</span></Popup>
        </Marker>
        
        <Marker 
          position={[dropoff.lat, dropoff.lng]} 
          icon={dropoffIcon}
          draggable={true}
          eventHandlers={{ dragend: () => handleDragEnd(false) }}
          ref={endMarkerRef}
        >
          <Popup><span className="text-xs font-semibold">Drag to set Drop-off</span></Popup>
        </Marker>

        <MapLineAndDistance 
          pickup={pickup} 
          dropoff={dropoff} 
          onDistanceCalculated={onDistanceCalculated} 
        />
      </MapContainer>
    </div>
  );
}
