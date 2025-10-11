import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  if (!lat || !lng) {
    return new Response(JSON.stringify({ error: "lat and lng are required" }), { status: 400 });
  }
  const token = process.env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({ error: "MAPBOX_ACCESS_TOKEN is not configured" }), { status: 500 });
  }
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
      `${lng},${lat}`
    )}.json?access_token=${token}&types=poi,address,neighborhood,locality,place&limit=1`;
    const r = await fetch(url, { next: { revalidate: 60 } });
    if (!r.ok) {
      return new Response(JSON.stringify({ error: `Upstream ${r.status}` }), { status: 502 });
    }
    const j = await r.json();
    const feature = j?.features?.[0];
    const place = feature?.place_name || null;
    return Response.json({ place, feature });
  } catch {
    return new Response(JSON.stringify({ error: "Failed to geocode" }), { status: 500 });
  }
}
