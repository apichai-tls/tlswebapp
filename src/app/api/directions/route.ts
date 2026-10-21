import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveRequestUser } from "@/lib/server-auth";
import { verifyCustomerToken, verifyServiceApiKey } from "@/lib/external-api-auth";

export const dynamic = "force-dynamic";

function decodePolyline(str: string, precision = 5) {
  let index = 0,
      lat = 0,
      lng = 0,
      coordinates = [],
      shift = 0,
      result = 0,
      byte = null,
      latitude_change,
      longitude_change,
      factor = Math.pow(10, precision);

  while (index < str.length) {
      byte = null;
      shift = 0;
      result = 0;
      do {
          byte = str.charCodeAt(index++) - 63;
          result |= (byte & 0x1f) << shift;
          shift += 5;
      } while (byte >= 0x20);
      latitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
      shift = result = 0;
      
      do {
          byte = str.charCodeAt(index++) - 63;
          result |= (byte & 0x1f) << shift;
          shift += 5;
      } while (byte >= 0x20);
      longitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
      
      lat += latitude_change;
      lng += longitude_change;
      coordinates.push({ lat: lat / factor, lng: lng / factor });
  }
  return coordinates;
}

export async function GET(request: NextRequest) {
  const { user } = await resolveRequestUser(request);
  if (user && !user.isActive) {
    return NextResponse.json({ error: "Forbidden: Account is deactivated" }, { status: 403 });
  }
  const authHeader = request.headers.get("authorization");
  const hasApiKeyHeader = Boolean(request.headers.get("x-api-key") || request.headers.get("X-API-KEY"));
  const isExternalAuthorized =
    !user &&
    ((hasApiKeyHeader && verifyServiceApiKey(request)) ||
      (authHeader ? Boolean(verifyCustomerToken(authHeader)) : false));

  if (!user && !isExternalAuthorized) {
    return NextResponse.json({ error: "Unauthorized: Valid session required" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const origin = searchParams.get("origin");
  const destination = searchParams.get("destination");

  if (!origin || !destination) {
    return NextResponse.json({ error: "origin and destination are required" }, { status: 400 });
  }

  let apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey || apiKey === "YOUR_API_KEY_HERE") {
    try {
      const setting = await prisma.setting.findUnique({ where: { key: "googleMapsApiKey" } });
      if (setting?.value) apiKey = setting.value;
    } catch (e) {
      console.warn("Could not load Google API key from DB:", e);
    }
  }

  if (!apiKey || apiKey === "YOUR_API_KEY_HERE") {
    return NextResponse.json({
      error: "Google Maps API Key is missing.",
    }, { status: 500 });
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&avoid=tolls&alternatives=true&mode=two_wheeler&departure_time=now&region=th&key=${apiKey}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "OK") {
      console.error("Google Directions API Error:", data.status, data.error_message);
      return NextResponse.json({ error: "Google Directions API failed", status: data.status }, { status: 500 });
    }

    if (!data.routes || data.routes.length === 0) {
      return NextResponse.json({ error: "No routes found" }, { status: 404 });
    }

    let shortestRoute = data.routes[0];
    let minDistance = shortestRoute.legs?.[0]?.distance?.value || Infinity;

    for (let i = 1; i < data.routes.length; i++) {
      const dist = data.routes[i].legs?.[0]?.distance?.value;
      if (dist !== undefined && dist < minDistance) {
        shortestRoute = data.routes[i];
        minDistance = dist;
      }
    }

    if (minDistance === Infinity) {
      return NextResponse.json({ error: "Could not calculate distance" }, { status: 400 });
    }

    const distanceMeters = minDistance;
    const distanceKm = Math.round((distanceMeters / 1000) * 10) / 10;
    const encodedPolyline = shortestRoute.overview_polyline.points;
    const coordinates = decodePolyline(encodedPolyline);

    return NextResponse.json({
      distanceKm,
      coordinates,
    });
  } catch (error) {
    console.error("Directions API proxy error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
