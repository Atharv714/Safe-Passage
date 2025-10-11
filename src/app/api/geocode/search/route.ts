import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const country = (searchParams.get("country") || "").trim();
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const limitParam = Number(searchParams.get("limit") || 5);
  const limit = isNaN(limitParam) ? 5 : Math.max(1, Math.min(10, limitParam));
  if (!q || q.trim().length < 2) {
    return new Response(JSON.stringify({ error: "q (query) is required" }), { status: 400 });
  }

  type Result = { id: string; name: string; place: string; center: { lat: number; lng: number } | null; src: "mapbox" | "osm" };

  async function fetchMapbox(): Promise<Result[]> {
    const token = process.env.MAPBOX_ACCESS_TOKEN;
    if (!token) return [];
    const params: string[] = [
      `access_token=${token}`,
      `autocomplete=true`,
      `limit=${limit}`,
      `types=place,locality,neighborhood,address,poi`,
      `language=en`,
    ];
    if (country) params.push(`country=${encodeURIComponent(country)}`);
    if (lat && lng) params.push(`proximity=${encodeURIComponent(`${lng},${lat}`)}`);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(String(q))}.json?${params.join("&")}`;
    const r = await fetch(url, { next: { revalidate: 30 } });
    if (!r.ok) return [];
    const j = await r.json();
    type Feature = { id: string; text: string; place_name: string; center?: [number, number] };
    const features: Feature[] = Array.isArray(j?.features) ? (j.features as Feature[]) : [];
    return features.map((f) => ({
      id: `mb:${f.id}`,
      name: f.text,
      place: f.place_name,
      center: Array.isArray(f.center) ? { lng: f.center[0], lat: f.center[1] } : null,
      src: "mapbox" as const,
    }));
  }

  async function fetchNominatim(): Promise<Result[]> {
    const params: string[] = [
  `q=${encodeURIComponent(String(q))}`,
      `format=jsonv2`,
      `addressdetails=1`,
      `limit=${limit}`,
      `accept-language=en`,
    ];
    if (country) params.push(`countrycodes=${encodeURIComponent(country)}`);
    const url = `https://nominatim.openstreetmap.org/search?${params.join("&")}`;
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Safe-Passage/1.0 (https://github.com/Atharv714/Safe-Passage)",
      },
      next: { revalidate: 30 },
    });
    if (!r.ok) return [];
    type OSM = { place_id: number | string; display_name: string; lat: string; lon: string; name?: string };
    const arr: OSM[] = await r.json();
    return (Array.isArray(arr) ? arr : []).map((o) => ({
      id: `osm:${o.place_id}`,
      name: o.name || o.display_name.split(",")[0] || "",
      place: o.display_name,
      center: typeof o.lat === "string" && typeof o.lon === "string" ? { lat: Number(o.lat), lng: Number(o.lon) } : null,
      src: "osm" as const,
    }));
  }

  try {
    const provider = (process.env.GEOCODER_PROVIDER || "hybrid").toLowerCase();
    let results: Result[] = [];
    if (provider === "mapbox") {
      results = await fetchMapbox();
    } else if (provider === "osm") {
      results = await fetchNominatim();
    } else {
      // hybrid: prefer Mapbox, fill with OSM, dedupe by place text or close center
      const [a, b] = await Promise.all([fetchMapbox(), fetchNominatim()]);
      const combined = [...a];
      for (const item of b) {
        const dupIdx = combined.findIndex((x) => {
          if (x.place && item.place && x.place.toLowerCase() === item.place.toLowerCase()) return true;
          if (x.center && item.center) {
            const dLat = Math.abs(x.center.lat - item.center.lat);
            const dLng = Math.abs(x.center.lng - item.center.lng);
            return dLat < 0.0008 && dLng < 0.0008; // ~ <100m
          }
          return false;
        });
        if (dupIdx === -1) combined.push(item);
      }
      results = combined;
    }
    // Cap and return
    return Response.json({ results: results.slice(0, limit) });
  } catch {
    return new Response(JSON.stringify({ error: "Failed to search" }), { status: 500 });
  }
}
