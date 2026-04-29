import { settingsStore, poiStore, getClosestShopId, type ShopLocation, type LatLng } from "@/lib/store";

export interface SearchResult {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
}

export interface RouteResult {
  distanceKm: number;
  coordinates: LatLng[];
}

export async function searchLocation(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const lowerQuery = query.toLowerCase();

  // 1. Search Local POIs First
  const allPois = poiStore.getSnapshot();
  const localMatches = allPois.filter(poi => 
    poi.name.toLowerCase().includes(lowerQuery) || 
    poi.address.toLowerCase().includes(lowerQuery)
  );

  let results: SearchResult[] = localMatches.map(poi => ({
    placeId: poi.id,
    name: `⭐ ${poi.name}`, // Add star to indicate local saved POI
    lat: poi.coords.lat,
    lng: poi.coords.lng,
  }));

  // If we found enough local matches, return them immediately
  if (results.length >= 5) {
    return results.slice(0, 5);
  }

  // 2. Fallback to Google Maps API (if enabled)
  try {
    const settings = settingsStore.getSnapshot();
    
    if (settings.enableGoogleApi !== "true") {
      return results; // Return only local results
    }

    const apiKey = settings.googleMapsApiKey || "";
    const res = await fetch(`/api/places?query=${encodeURIComponent(query)}&key=${encodeURIComponent(apiKey)}`);
    const data = await res.json();
    
    if (data.error) {
      console.error("Location search error:", data.error);
      return results;
    }

    const googleResults = data as SearchResult[];
    for (const gRes of googleResults) {
      if (!results.some(r => r.name === gRes.name || r.name === `⭐ ${gRes.name}`)) {
        results.push(gRes);
      }
    }

    return results.slice(0, 5);
  } catch (error) {
    console.error("Location search failed:", error);
    return results;
  }
}

export async function getRoute(pickup: LatLng, dropoff: LatLng): Promise<RouteResult | null> {
  try {
    const settings = settingsStore.getSnapshot();
    
    // 1. Use Google Directions API if enabled
    if (settings.enableGoogleApi === "true" && settings.googleMapsApiKey) {
      const apiKey = settings.googleMapsApiKey;
      const origin = `${pickup.lat},${pickup.lng}`;
      const destination = `${dropoff.lat},${dropoff.lng}`;
      
      const res = await fetch(`/api/directions?origin=${origin}&destination=${destination}&key=${encodeURIComponent(apiKey)}`);
      const data = await res.json();
      
      if (!data.error && data.coordinates) {
        return {
          distanceKm: data.distanceKm,
          coordinates: data.coordinates, // already decoded by the proxy
        };
      }
      
      console.warn("Google Directions API failed, falling back to OSRM", data.error);
    }

    // 2. Fallback to Free OSRM API (Using 'driving' profile)
    // We use 'driving' here as a fallback because 'bike' goes against one-way traffic on OSM.
    // Note: Public OSRM 'driving' profile might not perfectly avoid tolls.
    const url = `https://router.project-osrm.org/route/v1/driving/${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
      return null;
    }

    const route = data.routes[0];
    const distanceMeters = route.distance;
    const distanceKm = Math.round((distanceMeters / 1000) * 10) / 10;
    
    // GeoJSON coordinates are [longitude, latitude]
    const coordinates: LatLng[] = route.geometry.coordinates.map((coord: number[]) => ({
      lat: coord[1],
      lng: coord[0],
    }));

    return {
      distanceKm,
      coordinates,
    };
  } catch (error) {
    console.error("Routing failed:", error);
    return null;
  }
}

export async function getClosestShopByRoute(targetCoords: LatLng, shops: ShopLocation[]): Promise<string> {
  if (!shops || shops.length === 0) return "";
  if (shops.length === 1) return shops[0].id;

  try {
    // 1. Fetch routes for all shops in parallel
    const routePromises = shops.map(shop => getRoute(shop.coords, targetCoords));
    const results = await Promise.all(routePromises);

    // 2. Find the minimum distance
    let minDistance = Infinity;
    let closestShopId = "";

    results.forEach((route, index) => {
      if (route && route.distanceKm < minDistance) {
        minDistance = route.distanceKm;
        closestShopId = shops[index].id;
      }
    });

    // 3. Return the closest shop if found, otherwise fallback to straight-line
    if (closestShopId) {
      return closestShopId;
    }
  } catch (error) {
    console.error("Failed to calculate closest shop by route:", error);
  }

  // Fallback to straight-line distance if routing fails
  return getClosestShopId(targetCoords, shops);
}
