import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveRequestUser } from "@/lib/server-auth";
import { verifyCustomerToken, verifyServiceApiKey } from "@/lib/external-api-auth";

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
  const query = searchParams.get("query");
  const providedKey = searchParams.get("key")?.trim();

  if (!query) {
    return NextResponse.json({ error: "Query parameter is required" }, { status: 400 });
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
      results: [],
    }, { status: 500 });
  }

  try {
    const hasThaiCharacters = /[ก-๙]/.test(query);
    const language = hasThaiCharacters ? "th" : "en";

    const textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
      query
    )}&location=13.7563,100.5018&radius=100000&region=th&language=${language}&key=${apiKey}`;

    const autocompleteUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(
      query
    )}&location=13.7563,100.5018&radius=100000&region=th&language=${language}&key=${apiKey}`;

    const [textRes, autoRes] = await Promise.all([
      fetch(textSearchUrl),
      fetch(autocompleteUrl).catch(() => null),
    ]);

    const textData = await textRes.json();
    const autoData = autoRes ? await autoRes.json().catch(() => null) : null;

    const textOk = textData.status === "OK" || textData.status === "ZERO_RESULTS";
    const autoOk = autoData && (autoData.status === "OK" || autoData.status === "ZERO_RESULTS");

    if (!textOk && !autoOk) {
      console.error("Google Places API Error:", textData.status, textData.error_message);
      return NextResponse.json({ error: "Google Places API failed", status: textData.status }, { status: 500 });
    }

    const seenPlaceIds = new Set<string>();
    const formattedResults: Array<{
      placeId: string;
      name: string;
      address: string;
      lat: number;
      lng: number;
    }> = [];

    const textItems = Array.isArray(textData.results) ? textData.results : [];
    const textMap = new Map<string, any>();
    for (const item of textItems) {
      if (item?.place_id) {
        textMap.set(item.place_id, item);
      }
    }

    // Resolve top Autocomplete predictions first (covers studios/apartments/condos missing from Text Search)
    const predictions = Array.isArray(autoData?.predictions) ? autoData.predictions.slice(0, 5) : [];
    if (predictions.length > 0) {
      const detailItems = await Promise.all(
        predictions.map(async (pred: any) => {
          const placeId = pred?.place_id;
          if (!placeId) return null;
          if (textMap.has(placeId)) {
            const matched = textMap.get(placeId);
            return {
              placeId,
              name: matched.name || pred.structured_formatting?.main_text || matched.formatted_address,
              address: matched.formatted_address || pred.description || matched.name,
              lat: matched.geometry?.location?.lat || 0,
              lng: matched.geometry?.location?.lng || 0,
            };
          }
          try {
            const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(
              placeId
            )}&fields=place_id,name,formatted_address,geometry&language=${language}&key=${apiKey}`;
            const dRes = await fetch(detailUrl);
            const dJson = await dRes.json();
            if (dJson.status === "OK" && dJson.result?.geometry?.location) {
              const r = dJson.result;
              return {
                placeId: r.place_id || placeId,
                name: r.name || pred.structured_formatting?.main_text || pred.description,
                address: r.formatted_address || pred.description || r.name,
                lat: r.geometry.location.lat || 0,
                lng: r.geometry.location.lng || 0,
              };
            }
          } catch (e) {
            console.warn("Place details fetch failed for", placeId, e);
          }
          return null;
        })
      );

      for (const item of detailItems) {
        if (item && item.lat && item.lng && !seenPlaceIds.has(item.placeId)) {
          seenPlaceIds.add(item.placeId);
          formattedResults.push(item);
        }
      }
    }

    // Append remaining Text Search results
    for (const item of textItems) {
      const placeId = item?.place_id;
      const lat = item?.geometry?.location?.lat || 0;
      const lng = item?.geometry?.location?.lng || 0;
      if (placeId && lat && lng && !seenPlaceIds.has(placeId)) {
        seenPlaceIds.add(placeId);
        formattedResults.push({
          placeId,
          name: item.name || item.formatted_address,
          address: item.formatted_address || item.name,
          lat,
          lng,
        });
      }
    }

    return NextResponse.json(formattedResults);
  } catch (error) {
    console.error("Places API proxy error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
