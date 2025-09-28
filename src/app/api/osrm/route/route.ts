import { NextRequest } from "next/server";

// Simple proxy to OSRM demo server to avoid CORS in the browser.
// Note: OSRM demo server has rate limits; for production, self-host OSRM.
export async function GET(req: NextRequest) {
  const urlObj = new URL(req.url);
  const coords = urlObj.searchParams.get("coords");
  if (!coords) {
    return new Response(JSON.stringify({ error: "Missing coords param (lng,lat;lng,lat)" }), { status: 400 });
  }
  // Build query string excluding coords
  urlObj.searchParams.delete("coords");
  const query = urlObj.searchParams.toString();
  const upstreamUrl = `https://router.project-osrm.org/route/v1/driving/${coords}${query ? `?${query}` : ""}`;

  try {
  const upstream = await fetch(upstreamUrl, { headers: { "User-Agent": "matrix-demo" } });
    const data = await upstream.json();
    return new Response(JSON.stringify(data), { status: upstream.status, headers: { "content-type": "application/json" } });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: "OSRM request failed", detail: message }), { status: 500 });
  }
}
