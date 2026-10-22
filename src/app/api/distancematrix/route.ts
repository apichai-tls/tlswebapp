import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveRequestUser } from "@/lib/server-auth";
import { verifyCustomerToken, verifyServiceApiKey } from "@/lib/external-api-auth";

export const dynamic = "force-dynamic";

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
  const origins = searchParams.get("origins");
  const destinations = searchParams.get("destinations");
  const providedKey = searchParams.get("key")?.trim();

  if (!origins || !destinations) {
    return NextResponse.json({ error: "origins and destinations are required" }, { status: 400 });
  }

  let apiKey = providedKey && providedKey !== "YOUR_API_KEY_HERE" ? providedKey : "";

  if (!apiKey) {
    try {
      const setting = await prisma.setting.findUnique({ where: { key: "googleMapsApiKey" } });
      if (setting?.value && setting.value.trim() && setting.value.trim() !== "YOUR_API_KEY_HERE") {
        apiKey = setting.value.trim();
      }
    } catch (e) {
      console.warn("Could not load Google API key from DB:", e);
    }
  }

  if (!apiKey) {
    apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || "";
  }

  if (!apiKey || apiKey === "YOUR_API_KEY_HERE") {
    return NextResponse.json({
      error: "Google Maps API Key is missing.",
    }, { status: 500 });
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origins)}&destinations=${encodeURIComponent(destinations)}&avoid=tolls&mode=two_wheeler&departure_time=now&region=th&key=${apiKey}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "OK") {
      console.error("Google Distance Matrix API Error:", data.status, data.error_message);
      return NextResponse.json({ error: "Google Distance Matrix API failed", status: data.status }, { status: 500 });
    }

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
      distancesKm,
    });
  } catch (error) {
    console.error("Distance Matrix API proxy error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
