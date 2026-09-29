import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const origins = searchParams.get("origins");
  const destinations = searchParams.get("destinations");
  const providedKey = searchParams.get("key");

  if (!origins || !destinations) {
    return NextResponse.json({ error: "origins and destinations are required" }, { status: 400 });
  }

  let apiKey = providedKey || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

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
      error: "Google Maps API Key is missing. Please add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to your .env.local file.",
    }, { status: 500 });
  }

  try {
    // Call Google Distance Matrix API avoiding tolls, motorcycle mode, and real-time departure_time
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origins}&destinations=${destinations}&avoid=tolls&mode=two_wheeler&departure_time=now&region=th&key=${apiKey}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "OK") {
      console.error("Google Distance Matrix API Error:", data.status, data.error_message);
      return NextResponse.json({ error: "Google Distance Matrix API failed", details: data }, { status: 500 });
    }

    // Extract the distances
    const distancesKm: number[] = [];
    if (data.rows) {
      for (const row of data.rows) {
        for (const element of row.elements) {
          if (element.status === "OK" && element.distance) {
            const distanceMeters = element.distance.value;
            distancesKm.push(Math.round((distanceMeters / 1000) * 10) / 10);
          } else {
            distancesKm.push(Infinity);
          }
        }
      }
    }

    if (distancesKm.length === 0) {
      return NextResponse.json({ error: "No distance data found" }, { status: 404 });
    }

    return NextResponse.json({
      distancesKm
    });
  } catch (error) {
    console.error("Distance Matrix API proxy error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
