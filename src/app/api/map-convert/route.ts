import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  try {
    // Perform a fetch with manual redirect handling
    const res = await fetch(url, { redirect: "manual" });
    
    let finalUrl = url;
    
    // Google Maps shortlinks usually return 301, 302, or 303
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (location) {
        finalUrl = location;
      }
    }

    let lat = null;
    let lng = null;

    // Parse the final URL for coordinates
    const pMatch = finalUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    const aMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    
    if (pMatch) {
      lat = pMatch[1];
      lng = pMatch[2];
    } else if (aMatch) {
      lat = aMatch[1];
      lng = aMatch[2];
    }

    if (lat && lng) {
      return NextResponse.json({ lat, lng, finalUrl });
    } else {
      return NextResponse.json({ error: "Could not find coordinates", finalUrl }, { status: 404 });
    }

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
