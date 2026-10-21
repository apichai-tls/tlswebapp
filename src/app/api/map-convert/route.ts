import { NextRequest, NextResponse } from "next/server";
import { resolveRequestUser } from "@/lib/server-auth";
import { verifyCustomerToken, verifyServiceApiKey } from "@/lib/external-api-auth";

const ALLOWED_MAP_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "www.google.com",
  "maps.google.com",
  "google.com",
  "www.google.co.th",
  "maps.google.co.th",
]);

function isPrivateOrForbiddenHost(hostname: string): boolean {
  const lower = hostname.trim().toLowerCase();
  if (!lower) return true;
  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal") ||
    lower === "metadata.google.internal" ||
    lower.startsWith("[") ||
    lower.includes(":")
  ) {
    return true;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(lower)) {
    return true;
  }
  return false;
}

function validateMapConvertUrl(rawUrl: string): {
  valid: boolean;
  parsed?: URL;
  error?: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { valid: false, error: "Only HTTP/HTTPS URLs are permitted" };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, error: "Credentials in URL are not permitted" };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (isPrivateOrForbiddenHost(hostname) || !ALLOWED_MAP_HOSTS.has(hostname)) {
    return {
      valid: false,
      error: "Disallowed URL host. Only Google Maps URLs are permitted.",
    };
  }

  return { valid: true, parsed };
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

  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  const validation = validateMapConvertUrl(url);
  if (!validation.valid || !validation.parsed) {
    return NextResponse.json(
      { error: validation.error || "Invalid or disallowed URL" },
      { status: 400 }
    );
  }

  try {
    const fetchTarget = new URL(validation.parsed.toString());
    fetchTarget.protocol = "https:";

    const res = await fetch(fetchTarget.toString(), { redirect: "manual" });

    let finalUrl = fetchTarget.toString();

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (location) {
        const resolvedRedirect = new URL(location, fetchTarget).toString();
        const redirectValidation = validateMapConvertUrl(resolvedRedirect);
        if (!redirectValidation.valid) {
          return NextResponse.json(
            { error: "Redirect target points to a disallowed host" },
            { status: 400 }
          );
        }
        finalUrl = resolvedRedirect;
      }
    }

    let lat = null;
    let lng = null;

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
