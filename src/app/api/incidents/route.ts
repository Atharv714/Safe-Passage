import { NextRequest } from "next/server";
import { addIncident, listIncidents } from "../../../lib/incidentsStore";

export async function GET() {
  return Response.json({ incidents: listIncidents() });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { lat, lng, severity, hardAvoid, note } = body || {};
    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      typeof severity !== "number" ||
      typeof hardAvoid !== "boolean"
    ) {
      return new Response(JSON.stringify({ error: "Invalid body: lat,lng,severity,hardAvoid required" }), { status: 400 });
    }
    const inc = addIncident({ lat, lng, severity, hardAvoid, note });
    return Response.json(inc, { status: 201 });
  } catch {
    return new Response(JSON.stringify({ error: "Bad JSON" }), { status: 400 });
  }
}
