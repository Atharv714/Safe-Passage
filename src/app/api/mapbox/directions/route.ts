import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const profile = url.searchParams.get("profile") || "walking"; // walking|driving|cycling
  const coords = url.searchParams.get("coords"); // lng,lat;lng,lat[;...]
  if (!coords) {
    return new Response(JSON.stringify({ error: "Missing coords: expected 'lng,lat;lng,lat'" }), { status: 400 });
  }

  const accessToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (!accessToken) {
    return new Response(JSON.stringify({ error: "Server missing MAPBOX_ACCESS_TOKEN env" }), { status: 500 });
  }

  // Pass through selected query params or set sane defaults
  const params = new URLSearchParams();
  params.set("alternatives", url.searchParams.get("alternatives") ?? "true");
  params.set("geometries", url.searchParams.get("geometries") ?? "polyline6");
  params.set("overview", url.searchParams.get("overview") ?? "full");
  const steps = url.searchParams.get("steps");
  if (steps) params.set("steps", steps);
  const annotations = url.searchParams.get("annotations");
  if (annotations) params.set("annotations", annotations);
  params.set("access_token", accessToken);

  const upstream = `https://api.mapbox.com/directions/v5/mapbox/${encodeURIComponent(profile)}/${encodeURIComponent(coords)}?${params.toString()}`;

  try {
    const r = await fetch(upstream, { headers: { "User-Agent": "matrix-prototype" } });
    const body = await r.text();
    return new Response(body, { status: r.status, headers: { "content-type": r.headers.get("content-type") || "application/json" } });
  } catch {
    return new Response(JSON.stringify({ error: "Mapbox request failed" }), { status: 502 });
  }
}
