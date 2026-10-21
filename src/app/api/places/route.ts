import { NextRequest, NextResponse } from "next/server";
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

  if (!query) {
    return NextResponse.json({ error: "Query parameter is required" }, { status: 400 });
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey || apiKey === "YOUR_API_KEY_HERE") {
    return NextResponse.json({
      error: "Google Maps API Key is missing.",
      results: [],
    }, { status: 500 });
  }

  try {
    const hasThaiCharacters = /[ก-๙]/.test(query);
    const language = hasThaiCharacters ? "th" : "en";

    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
      query
    )}&location=13.7563,100.5018&radius=100000&region=th&language=${language}&key=${apiKey}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.error("Google Places API Error:", data.status, data.error_message);
      return NextResponse.json({ error: "Google Places API failed", status: data.status }, { status: 500 });
    }

    const formattedResults = (data.results || []).map((item: any) => ({
      placeId: item.place_id,
      name: item.name || item.formatted_address,
      address: item.formatted_address || item.name,
      lat: item.geometry?.location?.lat || 0,
      lng: item.geometry?.location?.lng || 0,
    }));

    return NextResponse.json(formattedResults);
  } catch (error) {
    console.error("Places API proxy error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
