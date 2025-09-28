const UPSTREAM = "https://guests-talented-ellis-heritage.trycloudflare.com/potholes";

export async function GET() {
  try {
    const r = await fetch(UPSTREAM, { cache: "no-store" });
    const data = await r.json();
    return Response.json(data);
  } catch (e) {
    return new Response(JSON.stringify({ status: "error", error: (e as Error).message }), { status: 502 });
  }
}
