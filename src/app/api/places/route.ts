import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("query");
  const providedKey = searchParams.get("key");

  if (!query) {
    return NextResponse.json({ error: "Query parameter is required" }, { status: 400 });
  }

  const apiKey = providedKey || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey || apiKey === "YOUR_API_KEY_HERE") {
    return NextResponse.json({ 
      error: "Google Maps API Key is missing. Please add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to your .env.local file.",
      results: [] // Return empty results to gracefully degrade
    }, { status: 500 });
  }

  try {
    // We use the Places Text Search API
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
      query
    )}&region=th&language=th&key=${apiKey}`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.error("Google Places API Error:", data.status, data.error_message);
      return NextResponse.json({ error: "Google Places API failed", details: data }, { status: 500 });
    }

    // Format the response to match what the frontend expects
    const formattedResults = (data.results || []).map((item: any) => ({
      placeId: item.place_id,
      name: item.formatted_address || item.name,
      lat: item.geometry?.location?.lat || 0,
      lng: item.geometry?.location?.lng || 0,
    }));

    return NextResponse.json(formattedResults);
  } catch (error) {
    console.error("Places API proxy error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
