import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

// Decoder function for Google's Encoded Polyline Algorithm Format
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
  const searchParams = request.nextUrl.searchParams;
  const origin = searchParams.get("origin");
  const destination = searchParams.get("destination");
  const providedKey = searchParams.get("key");

  if (!origin || !destination) {
    return NextResponse.json({ error: "origin and destination are required" }, { status: 400 });
  }

  const apiKey = providedKey || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey || apiKey === "YOUR_API_KEY_HERE") {
    return NextResponse.json({ 
      error: "Google Maps API Key is missing. Please add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to your .env.local file.",
    }, { status: 500 });
  }

  try {
    // Call Google Directions API avoiding tolls
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}&avoid=tolls&region=th&key=${apiKey}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "OK") {
      console.error("Google Directions API Error:", data.status, data.error_message);
      return NextResponse.json({ error: "Google Directions API failed", details: data }, { status: 500 });
    }

    const route = data.routes[0];
    if (!route || !route.legs || route.legs.length === 0) {
      return NextResponse.json({ error: "No routes found" }, { status: 404 });
    }

    const distanceMeters = route.legs[0].distance.value;
    const distanceKm = Math.round((distanceMeters / 1000) * 10) / 10;
    
    // Decode the polyline so the frontend can just draw it easily
    const encodedPolyline = route.overview_polyline.points;
    const coordinates = decodePolyline(encodedPolyline);

    return NextResponse.json({
      distanceKm,
      coordinates
    });
  } catch (error) {
    console.error("Directions API proxy error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
