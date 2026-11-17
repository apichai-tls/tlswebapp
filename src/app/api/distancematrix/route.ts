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

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  let apiKey = isAdmin && providedKey && providedKey !== "YOUR_API_KEY_HERE" ? providedKey : "";

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

function toMatrixWaypoint(value: string) {
  const parts = value.split(",").map((p) => Number(p.trim()));
  if (parts.length === 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
    return { waypoint: { location: { latLng: { latitude: parts[0], longitude: parts[1] } } } };
  }
  return { waypoint: { address: value } };
}

  try {
    const originList = origins.split("|").map((s) => s.trim()).filter(Boolean);
    const destList = destinations.split("|").map((s) => s.trim()).filter(Boolean);

    // 1. Primary: Google Routes API v2 computeRouteMatrix (true TWO_WHEELER motorcycle routing)
    try {
      const matRes = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "originIndex,destinationIndex,condition,distanceMeters",
        },
        body: JSON.stringify({
          origins: originList.map(toMatrixWaypoint),
          destinations: destList.map(toMatrixWaypoint),
          travelMode: "TWO_WHEELER",
          routingPreference: "TRAFFIC_AWARE",
        }),
      });

      if (matRes.ok) {
        const matData = await matRes.json();
        if (Array.isArray(matData) && matData.length > 0) {
          const totalCells = originList.length * destList.length;
          const distancesKm: number[] = new Array(totalCells).fill(Infinity);
          let hasAnyValid = false;

          for (const entry of matData) {
            const oi = typeof entry?.originIndex === "number" ? entry.originIndex : 0;
            const di = typeof entry?.destinationIndex === "number" ? entry.destinationIndex : 0;
            const flatIdx = oi * destList.length + di;
            if (flatIdx >= 0 && flatIdx < totalCells && entry?.condition === "ROUTE_EXISTS" && typeof entry?.distanceMeters === "number") {
              distancesKm[flatIdx] = Math.round((entry.distanceMeters / 1000) * 10) / 10;
              hasAnyValid = true;
            }
          }

          if (hasAnyValid) {
            return NextResponse.json({ distancesKm });
          }
        }
      } else {
        const errText = await matRes.text().catch(() => "");
        console.warn("Google Routes Matrix v2 unavailable, falling back to legacy Distance Matrix:", matRes.status, errText.slice(0, 200));
      }
    } catch (v2Err) {
      console.warn("Google Routes Matrix v2 error, falling back to legacy Distance Matrix:", v2Err);
    }

    // 2. Fallback: Legacy Google Distance Matrix API
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origins)}&destinations=${encodeURIComponent(destinations)}&avoid=tolls&mode=two_wheeler&region=th&key=${apiKey}`;

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
