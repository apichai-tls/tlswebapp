import { settingsStore, poiStore, getClosestShopId, getDirectDistance, type ShopLocation, type LatLng } from "@/lib/store";

export interface SearchResult {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface RouteResult {
  distanceKm: number;
  coordinates: LatLng[];
}

export async function searchLocation(query: string, forceGoogle = false): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const lowerQuery = query.toLowerCase().replace(/\u200b/g, '');

  // 1. Search Local POIs First
  const allPois = poiStore.getSnapshot();
  const localMatches = allPois.filter(poi => {
    const safeName = poi.name.toLowerCase().replace(/\u200b/g, '');
    const safeAddress = poi.address.toLowerCase().replace(/\u200b/g, '');
    return safeName.includes(lowerQuery) || safeAddress.includes(lowerQuery);
  });

  let results: SearchResult[] = localMatches.map(poi => ({
    placeId: poi.id,
    name: `⭐ ${poi.name}`, // Add star to indicate local saved POI
    address: poi.address,
    lat: poi.coords.lat,
    lng: poi.coords.lng,
  }));

  // If we found enough local matches, return them immediately
  if (results.length >= 10) {
    return results.slice(0, 10);
  }

  // 2. Fallback to Google Maps API (if enabled, or forced by manual button click)
  try {
    const settings = settingsStore.getSnapshot();
    
    if (!forceGoogle && settings.enableGoogleApi !== "true") {
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

    return results.slice(0, 10);
  } catch (error) {
    console.error("Location search failed:", error);
    return results;
  }
}

const routeCache = new Map<string, RouteResult>();

export async function getRoute(pickup: LatLng, dropoff: LatLng): Promise<RouteResult | null> {
  const cacheKey = `${pickup.lat.toFixed(5)},${pickup.lng.toFixed(5)}-${dropoff.lat.toFixed(5)},${dropoff.lng.toFixed(5)}`;
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey)!;
  }

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
        const result = {
          distanceKm: data.distanceKm,
          coordinates: data.coordinates,
        };
        routeCache.set(cacheKey, result);
        return result;
      }
      
      console.warn("Google Directions API failed, falling back to OSRM", data.error);
    }

    // 2. Fallback to Free OSRM API (Using 'driving' profile)
    const url = `https://router.project-osrm.org/route/v1/driving/${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
      return null;
    }

    const route = data.routes[0];
    const distanceMeters = route.distance;
    const distanceKm = Math.round((distanceMeters / 1000) * 10) / 10;
    
    const coordinates: LatLng[] = route.geometry.coordinates.map((coord: number[]) => ({
      lat: coord[1],
      lng: coord[0],
    }));

    const result = { distanceKm, coordinates };
    routeCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error("Routing failed:", error);
    return null;
  }
}

export async function getClosestShopByRoute(targetCoords: LatLng, shops: ShopLocation[]): Promise<string> {
  if (!shops || shops.length === 0) return "";
  if (shops.length === 1) return shops[0].id;

  try {
    // As requested, we won't reduce scope. We will check the distance matrix against all shops.
    const candidateShops = shops;

    const settings = settingsStore.getSnapshot();
    let minDistance = Infinity;
    let closestShopId = "";

    // 1. Try Google Distance Matrix API
    let distanceMatrixSuccess = false;
    if (settings.enableGoogleApi === "true" && settings.googleMapsApiKey) {
      const apiKey = settings.googleMapsApiKey;
      // Calculate from Shops -> Customer to match the Delivery routing direction
      const origins = candidateShops.map(s => `${s.coords.lat},${s.coords.lng}`).join("|");
      const destinations = `${targetCoords.lat},${targetCoords.lng}`;

      try {
        const res = await fetch(`/api/distancematrix?origins=${origins}&destinations=${destinations}&key=${encodeURIComponent(apiKey)}`);
        const data = await res.json();

        if (!data.error && data.distancesKm) {
          data.distancesKm.forEach((dist: number, i: number) => {
            if (dist < minDistance) {
              minDistance = dist;
              closestShopId = candidateShops[i].id;
            }
          });
          if (closestShopId) {
            distanceMatrixSuccess = true;
            return closestShopId;
          }
        }
      } catch (e) {
        console.warn("Google Distance Matrix failed", e);
      }
    }

    // 1.5. Try Individual Google Directions API Fallback (using two_wheeler mode)
    if (!distanceMatrixSuccess && settings.enableGoogleApi === "true" && settings.googleMapsApiKey) {
      const promises = candidateShops.map(async (shop) => {
        try {
          const origin = `${shop.coords.lat},${shop.coords.lng}`;
          const destination = `${targetCoords.lat},${targetCoords.lng}`;
          const res = await fetch(`/api/directions?origin=${origin}&destination=${destination}&key=${encodeURIComponent(settings.googleMapsApiKey || "")}`);
          const data = await res.json();
          if (data && !data.error && typeof data.distanceKm === "number") {
            return { id: shop.id, dist: data.distanceKm };
          }
        } catch (e) {
          console.warn(`Individual Google Directions fallback failed for ${shop.name}:`, e);
        }
        return null;
      });

      const results = await Promise.all(promises);
      results.forEach((r) => {
        if (r && r.dist < minDistance) {
          minDistance = r.dist;
          closestShopId = r.id;
        }
      });

      if (closestShopId) return closestShopId;
    }

    // 2. Fallback to OSRM Table Service
    // OSRM requires coordinates in longitude,latitude format
    const coordsList = [
      `${targetCoords.lng},${targetCoords.lat}`, 
      ...candidateShops.map(s => `${s.coords.lng},${s.coords.lat}`)
    ].join(";");
    
    // We want distances FROM shops TO the customer.
    // targetCoords is index 0. Shops are indices 1 to N.
    // sources = 1;2;3... (shops), destinations = 0 (customer)
    const sources = candidateShops.map((_, i) => i + 1).join(";");
    const osrmUrl = `https://router.project-osrm.org/table/v1/driving/${coordsList}?sources=${sources}&destinations=0&annotations=distance`;
    
    try {
      const res = await fetch(osrmUrl);
      const data = await res.json();
      
      if (data.code === "Ok" && data.distances) {
        // data.distances is an array of rows (one for each source).
        // Since destinations=0, each row has 1 element (the distance to customer).
        for (let i = 0; i < candidateShops.length; i++) {
          const distMeters = data.distances[i]?.[0];
          if (distMeters !== undefined && distMeters !== null) {
            const distKm = distMeters / 1000;
            if (distKm < minDistance) {
              minDistance = distKm;
              closestShopId = candidateShops[i].id;
            }
          }
        }
        if (closestShopId) return closestShopId;
      }
    } catch (e) {
      console.warn("OSRM Table failed", e);
    }
  } catch (error) {
    console.error("Failed to calculate closest shop by distance matrix:", error);
  }

  // Fallback to straight-line distance if routing matrix fails
  return getClosestShopId(targetCoords, shops);
}
