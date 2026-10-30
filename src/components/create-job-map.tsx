"use client";

import "leaflet/dist/leaflet.css";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";
import "leaflet-defaulticon-compatibility";

import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useState, useRef, useCallback } from "react";
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

interface KeyedRoute {
  key: string;
  coords: [number, number][];
}

function makeLegKey(start: LatLng | null, end: LatLng | null): string {
  if (!start || !end) return "";
  return `${start.lat.toFixed(5)},${start.lng.toFixed(5)}->${end.lat.toFixed(5)},${end.lng.toFixed(5)}`;
}

// Component to handle polyline and distance calculation dynamically
function MapLineAndDistance({
  start,
  end,
  color,
  onDistanceCalculated,
  onRouteResolved,
}: {
  start: LatLng | null;
  end: LatLng | null;
  color: string;
  onDistanceCalculated?: (distanceKm: number) => void;
  onRouteResolved?: (route: KeyedRoute | null) => void;
}) {
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);

  const onDistanceCalculatedRef = useRef(onDistanceCalculated);
  const onRouteResolvedRef = useRef(onRouteResolved);
  useEffect(() => {
    onDistanceCalculatedRef.current = onDistanceCalculated;
    onRouteResolvedRef.current = onRouteResolved;
  }, [onDistanceCalculated, onRouteResolved]);

  useEffect(() => {
    let active = true;
    const legKey = makeLegKey(start, end);

    if (!start || !end) {
      setRouteCoords([]);
      if (onDistanceCalculatedRef.current) onDistanceCalculatedRef.current(0);
      if (onRouteResolvedRef.current) onRouteResolvedRef.current(null);
      return;
    }

    // Clear previous route immediately while fetching new route
    setRouteCoords([]);
    if (onRouteResolvedRef.current) onRouteResolvedRef.current(null);

    async function fetchRoute() {
      if (!start || !end) return;
      const route = await getRoute(start, end);
      if (!active) return;

      if (route && route.coordinates.length > 0) {
        const coords = route.coordinates.map((c: LatLng) => [c.lat, c.lng] as [number, number]);
        setRouteCoords(coords);
        if (onDistanceCalculatedRef.current) onDistanceCalculatedRef.current(route.distanceKm);
        if (onRouteResolvedRef.current) onRouteResolvedRef.current({ key: legKey, coords });
      } else {
        const fallbackCoords: [number, number][] = [
          [start.lat, start.lng],
          [end.lat, end.lng],
        ];
        setRouteCoords(fallbackCoords);
        const p1 = L.latLng(start.lat, start.lng);
        const p2 = L.latLng(end.lat, end.lng);
        const dist = Math.round((p1.distanceTo(p2) / 1000) * 10) / 10;
        if (onDistanceCalculatedRef.current) onDistanceCalculatedRef.current(dist);
        if (onRouteResolvedRef.current) onRouteResolvedRef.current({ key: legKey, coords: fallbackCoords });
      }
    }

    fetchRoute();
    return () => {
      active = false;
    };
  }, [start?.lat, start?.lng, end?.lat, end?.lng]);

  if (routeCoords.length === 0) return null;

  return <Polyline positions={routeCoords} pathOptions={{ color: color, weight: 4 }} />;
}

/**
 * Unified map viewport controller:
 * Fits all active markers and route polylines in one single place, and observes
 * container size changes so the markers are always centered inside the visible area.
 */
function MapBoundsController({
  branchCoords,
  pickupCoords,
  deliveryCoords,
  pickupRoute,
  deliveryRoute,
}: {
  branchCoords: LatLng;
  pickupCoords: LatLng | null;
  deliveryCoords: LatLng | null;
  pickupRoute: KeyedRoute | null;
  deliveryRoute: KeyedRoute | null;
}) {
  const map = useMap();

  const applyViewport = useCallback(() => {
    if (!branchCoords) return;
    map.stop();
    map.invalidateSize({ pan: false });

    const hasDestination = Boolean(pickupCoords || deliveryCoords);
    if (!hasDestination) {
      map.setView([branchCoords.lat, branchCoords.lng], 13, { animate: false });
      return;
    }

    const expectedPickupKey = makeLegKey(branchCoords, pickupCoords);
    const expectedDeliveryKey = makeLegKey(branchCoords, deliveryCoords);

    const points: [number, number][] = [[branchCoords.lat, branchCoords.lng]];
    if (pickupCoords) {
      points.push([pickupCoords.lat, pickupCoords.lng]);
    }
    if (deliveryCoords) {
      points.push([deliveryCoords.lat, deliveryCoords.lng]);
    }
    if (pickupRoute && pickupRoute.key === expectedPickupKey && pickupRoute.coords.length > 0) {
      points.push(...pickupRoute.coords);
    }
    if (deliveryRoute && deliveryRoute.key === expectedDeliveryKey && deliveryRoute.coords.length > 0) {
      points.push(...deliveryRoute.coords);
    }

    const bounds = L.latLngBounds(points);
    if (bounds.isValid()) {
      const containerSize = map.getSize();
      const padLeft = containerSize.x > 680 ? 330 : 60;
      const padTop = containerSize.y > 450 ? 90 : 50;
      map.fitBounds(bounds, {
        paddingTopLeft: [padLeft, padTop],
        paddingBottomRight: [60, 60],
        maxZoom: 15,
        animate: false,
      });
    }
  }, [
    branchCoords?.lat,
    branchCoords?.lng,
    pickupCoords?.lat,
    pickupCoords?.lng,
    deliveryCoords?.lat,
    deliveryCoords?.lng,
    pickupRoute,
    deliveryRoute,
    map,
  ]);

  useEffect(() => {
    applyViewport();
  }, [applyViewport]);

  // Also observe container resize so if layout height settles, map re-centers accurately
  useEffect(() => {
    const container = map.getContainer();
    if (!container || typeof ResizeObserver === "undefined") return;
    let prevHeight = container.clientHeight;
    let prevWidth = container.clientWidth;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      if (Math.abs(rect.height - prevHeight) > 8 || Math.abs(rect.width - prevWidth) > 8) {
        prevHeight = rect.height;
        prevWidth = rect.width;
        applyViewport();
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [map, applyViewport]);

  return null;
}

export function CreateJobMap({
  branchCoords,
  pickupCoords,
  deliveryCoords,
  onMarkerDrag,
  onDistanceCalculated,
  className = "h-full w-full",
}: CreateJobMapProps) {
  const branchMarkerRef = useRef<L.Marker>(null);
  const pickupMarkerRef = useRef<L.Marker>(null);
  const deliveryMarkerRef = useRef<L.Marker>(null);

  const [pDist, setPDist] = useState(0);
  const [dDist, setDDist] = useState(0);
  const [pickupRoute, setPickupRoute] = useState<KeyedRoute | null>(null);
  const [deliveryRoute, setDeliveryRoute] = useState<KeyedRoute | null>(null);

  useEffect(() => {
    if (onDistanceCalculated) {
      onDistanceCalculated(pDist, dDist);
    }
  }, [pDist, dDist, onDistanceCalculated]);

  const handleDragEnd = (type: 'pickup' | 'delivery' | 'branch') => {
    if (!onMarkerDrag) return;
    const marker =
      type === 'pickup'
        ? pickupMarkerRef.current
        : type === 'delivery'
          ? deliveryMarkerRef.current
          : branchMarkerRef.current;
    if (marker) {
      const pos = marker.getLatLng();
      onMarkerDrag(type, { lat: pos.lat, lng: pos.lng });
    }
  };

  // Center on branch initially if no other points
  const center = pickupCoords
    ? [pickupCoords.lat, pickupCoords.lng]
    : [branchCoords.lat, branchCoords.lng];

  return (
    <div className={`h-full w-full rounded-xl overflow-hidden border border-slate-200 shadow-inner relative z-0 ${className}`}>
      <MapContainer
        center={center as any}
        zoom={13}
        className="h-full w-full"
        style={{ height: "100%", width: "100%", zIndex: 0 }}
        zoomControl={true}
      >
        <MapBoundsController
          branchCoords={branchCoords}
          pickupCoords={pickupCoords}
          deliveryCoords={deliveryCoords}
          pickupRoute={pickupRoute}
          deliveryRoute={deliveryRoute}
        />
        <TileLayer
          attribution='&copy; <a href="https://maps.google.com">Google Maps</a>'
          url="https://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}"
        />

        <Marker
          position={[branchCoords.lat, branchCoords.lng]}
          icon={storeIcon}
          draggable={!!onMarkerDrag}
          eventHandlers={{ dragend: () => handleDragEnd('branch') }}
          ref={branchMarkerRef}
        >
          <Popup>
            <span className="text-xs font-semibold">Store Branch</span>
          </Popup>
        </Marker>

        {pickupCoords && (
          <Marker
            position={[pickupCoords.lat, pickupCoords.lng]}
            icon={pickupIcon}
            draggable={!!onMarkerDrag}
            eventHandlers={{ dragend: () => handleDragEnd('pickup') }}
            ref={pickupMarkerRef}
          >
            <Popup>
              <span className="text-xs font-semibold">Drag to set Pickup</span>
            </Popup>
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
            <Popup>
              <span className="text-xs font-semibold">Drag to set Delivery</span>
            </Popup>
          </Marker>
        )}

        <MapLineAndDistance
          start={branchCoords}
          end={pickupCoords}
          color="#10b981" // emerald-500
          onDistanceCalculated={setPDist}
          onRouteResolved={setPickupRoute}
        />

        <MapLineAndDistance
          start={branchCoords}
          end={deliveryCoords}
          color="#ef4444" // red-500
          onDistanceCalculated={setDDist}
          onRouteResolved={setDeliveryRoute}
        />
      </MapContainer>
    </div>
  );
}
