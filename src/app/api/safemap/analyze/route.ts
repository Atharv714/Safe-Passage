import { NextRequest } from "next/server";

const BASE = "http://192.168.0.19:5000/api";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lat, lng, radius } = body || {};
    if (typeof lat !== "number" || typeof lng !== "number") {
      return new Response(JSON.stringify({ error: "lat and lng required" }), { status: 400 });
    }
    const r = await fetch(`${BASE}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng, radius: typeof radius === "number" ? radius : 0.3 }),
    });
    const data = await r.json();
    return Response.json(data, { status: r.ok ? 200 : r.status });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 502 });
  }
}
