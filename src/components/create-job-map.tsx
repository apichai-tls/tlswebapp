"use client";

import "leaflet/dist/leaflet.css";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";
import "leaflet-defaulticon-compatibility";

import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useState, useRef } from "react";
import type { LatLng } from "@/lib/store";
import { pickupIcon, dropoffIcon, storeIcon } from "@/components/map-component";
import { getRoute } from "@/lib/map-api";

interface CreateJobMapProps {
  branchCoords: LatLng;
  pickupCoords: LatLng | null;
  deliveryCoords: LatLng | null;
  onMarkerDrag?: (type: 'pickup' | 'delivery' | 'branch', coords: LatLng) => void;
  onDistanceCalculated?: (pickupDistKm: number, deliveryDistKm: number) => void;
  className?: string;
}

// Component to handle polyline and distance calculation dynamically
function MapLineAndDistance({
  start,
  end,
  color,
  onDistanceCalculated,
}: {
  start: LatLng | null;
  end: LatLng | null;
  color: string;
  onDistanceCalculated?: (distanceKm: number) => void;
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
    if (!start || !end) {
      setRouteCoords([]);
      if (onDistanceCalculatedRef.current) onDistanceCalculatedRef.current(0);
      return;
    }
    
    async function fetchRoute() {
      if (!start || !end) return;
      const route = await getRoute(start, end);
      if (!active) return;
      
      const boundsKey = `${start.lat},${start.lng}-${end.lat},${end.lng}`;
      
      if (route && route.coordinates.length > 0) {
        setRouteCoords(route.coordinates.map((c: LatLng) => [c.lat, c.lng] as [number, number]));
        if (onDistanceCalculatedRef.current) onDistanceCalculatedRef.current(route.distanceKm);

        if (lastFitBoundsRef.current !== boundsKey) {
          const bounds = L.latLngBounds(route.coordinates.map((c: LatLng) => [c.lat, c.lng] as [number, number]));
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15, animate: true });
          lastFitBoundsRef.current = boundsKey;
        }
      } else {
        // Fallback to straight line if routing fails
        setRouteCoords([[start.lat, start.lng], [end.lat, end.lng]]);
        const p1 = L.latLng(start.lat, start.lng);
        const p2 = L.latLng(end.lat, end.lng);
        const dist = Math.round((p1.distanceTo(p2) / 1000) * 10) / 10;
        if (onDistanceCalculatedRef.current) onDistanceCalculatedRef.current(dist);
        
        if (lastFitBoundsRef.current !== boundsKey) {
          map.fitBounds(L.latLngBounds([p1, p2]), { padding: [50, 50], maxZoom: 15, animate: true });
          lastFitBoundsRef.current = boundsKey;
        }
      }
    }
    
    fetchRoute();
    return () => { active = false; };
  }, [start?.lat, start?.lng, end?.lat, end?.lng, map]);

  if (routeCoords.length === 0) return null;

  return (
    <Polyline 
      positions={routeCoords} 
      pathOptions={{ color: color, weight: 4 }} 
    />
  );
}

export function CreateJobMap({ branchCoords, pickupCoords, deliveryCoords, onMarkerDrag, onDistanceCalculated, className = "h-full w-full" }: CreateJobMapProps) {
  const branchMarkerRef = useRef<L.Marker>(null);
  const pickupMarkerRef = useRef<L.Marker>(null);
  const deliveryMarkerRef = useRef<L.Marker>(null);
  
  const [pDist, setPDist] = useState(0);
  const [dDist, setDDist] = useState(0);

  useEffect(() => {
    if (onDistanceCalculated) {
      onDistanceCalculated(pDist, dDist);
    }
  }, [pDist, dDist, onDistanceCalculated]);

  const handleDragEnd = (type: 'pickup' | 'delivery' | 'branch') => {
    if (!onMarkerDrag) return;
    const marker = type === 'pickup' ? pickupMarkerRef.current : type === 'delivery' ? deliveryMarkerRef.current : branchMarkerRef.current;
    if (marker) {
      const pos = marker.getLatLng();
      onMarkerDrag(type, { lat: pos.lat, lng: pos.lng });
    }
  };

  // Center on branch initially if no other points
  const center = pickupCoords ? [pickupCoords.lat, pickupCoords.lng] : [branchCoords.lat, branchCoords.lng];

  return (
    <div className={`h-full w-full rounded-xl overflow-hidden border border-slate-200 shadow-inner relative z-0 ${className}`}>
      <MapContainer
        center={center as any}
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
          position={[branchCoords.lat, branchCoords.lng]} 
          icon={storeIcon}
          draggable={!!onMarkerDrag}
          eventHandlers={{ dragend: () => handleDragEnd('branch') }}
          ref={branchMarkerRef}
        >
          <Popup><span className="text-xs font-semibold">Store Branch</span></Popup>
        </Marker>

        {pickupCoords && (
          <Marker 
            position={[pickupCoords.lat, pickupCoords.lng]} 
            icon={pickupIcon}
            draggable={!!onMarkerDrag}
            eventHandlers={{ dragend: () => handleDragEnd('pickup') }}
            ref={pickupMarkerRef}
          >
            <Popup><span className="text-xs font-semibold">Drag to set Pickup</span></Popup>
          </Marker>
        )}
        
        {deliveryCoords && (
          <Marker 
            position={[deliveryCoords.lat, deliveryCoords.lng]} 
            icon={dropoffIcon}
            draggable={!!onMarkerDrag}
            eventHandlers={{ dragend: () => handleDragEnd('delivery') }}
            ref={deliveryMarkerRef}
          >
            <Popup><span className="text-xs font-semibold">Drag to set Delivery</span></Popup>
          </Marker>
        )}

        <MapLineAndDistance 
          start={branchCoords} 
          end={pickupCoords} 
          color="#10b981" // emerald-500
          onDistanceCalculated={setPDist} 
        />
        
        <MapLineAndDistance 
          start={branchCoords} 
          end={deliveryCoords} 
          color="#ef4444" // red-500
          onDistanceCalculated={setDDist} 
        />
      </MapContainer>
    </div>
  );
}
