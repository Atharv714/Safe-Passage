"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import { icon } from "leaflet";
import type { LatLngExpression } from "leaflet";
import polyline from "@mapbox/polyline";

// Fix Leaflet default marker icon 404s by pointing to CDN images
const defaultIcon = icon({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const MapContainer = dynamic(() => import("react-leaflet").then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then(m => m.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then(m => m.Popup), { ssr: false });
const Polyline = dynamic(() => import("react-leaflet").then(m => m.Polyline), { ssr: false });

type Incident = { id: string; lat: number; lng: number; severity: number; hardAvoid: boolean; note?: string };

type RouteAlt = {
  id: string;
  geometry: LatLngExpression[];
  distance: number; // meters
  duration: number; // seconds
  safetyScore: number; // computed client-side 0..100
  penaltySeconds: number; // extra weight due to nearby incidents
  matches?: { lat: number; lng: number; incident: Incident; distKm: number }[]; // nearby incidents along route
};

// ---- Helpers (module scope for stable references) ----
function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // km
}

function computeRouteSafety(pts: LatLngExpression[], incs: Incident[]): number {
  if (incs.length === 0) return 85;
  let score = 90;
  for (const [lat, lng] of pts as [number, number][]) {
    for (const inc of incs) {
      const d = haversine(lat, lng, inc.lat, inc.lng);
      if (d < 0.05) {
        const impact = inc.hardAvoid ? 40 : (100 - inc.severity) * 0.2;
        score -= impact;
      }
    }
    if (score < 10) break;
  }
  return Math.max(0, Math.min(100, score));
}

// Soft-avoid penalty (in seconds) based on proximity to incidents.
// This increases the route "weight" so alternatives win, but users can still manually pick it.
function computeIncidentPenalty(pts: LatLngExpression[], incs: Incident[]): number {
  if (incs.length === 0) return 0;
  const points = pts as [number, number][];
  let total = 0;
  for (const inc of incs) {
    // Sample every Nth point for speed; find min distance from route to this incident
    let minD = Number.POSITIVE_INFINITY; // km
    const step = Math.max(1, Math.floor(points.length / 200));
    for (let i = 0; i < points.length; i += step) {
      const [lat, lng] = points[i];
      const d = haversine(lat, lng, inc.lat, inc.lng);
      if (d < minD) minD = d;
      if (minD < 0.01) break; // early exit if extremely close (<10m)
    }
    // Distance tiers -> penalty seconds; stronger if incident is marked hardAvoid
    if (minD < 0.02) {
      total += (inc.hardAvoid ? 1800 : 900) + inc.severity * 12; // within 20m
    } else if (minD < 0.05) {
      total += (inc.hardAvoid ? 1200 : 600) + inc.severity * 8; // within 50m
    } else if (minD < 0.1) {
      total += (inc.hardAvoid ? 600 : 300) + inc.severity * 4; // within 100m
    } else if (minD < 0.2) {
      total += (inc.hardAvoid ? 300 : 120) + inc.severity * 2; // within 200m
    }
  }
  return total;
}

function adjustedCost(r: RouteAlt) {
  // Rank by travel time plus incident-derived penalty (soft avoid)
  // Keep a tiny nudge from safetyScore for tie-breaking only
  const safetyNudge = (80 - r.safetyScore) * 2; // up to ~160s
  return r.duration + r.penaltySeconds + Math.max(0, safetyNudge);
}

function useGeolocate() {
  const [pos, setPos] = useState<GeolocationPosition | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const locate = () => {
    if (!navigator.geolocation) {
      setErr("Geolocation not supported");
      return;
    }
    navigator.geolocation.getCurrentPosition(setPos, e => setErr(e.message), { enableHighAccuracy: true, timeout: 8000 });
  };
  return { pos, err, locate };
}

export default function Home() {
  const center: LatLngExpression = [28.6139, 77.209]; // Delhi default
  const { pos, locate } = useGeolocate();
  const [origin, setOrigin] = useState<LatLngExpression | null>(null);
  const [destination, setDestination] = useState<LatLngExpression | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]); // used silently for safety weighting
  const [routes, setRoutes] = useState<RouteAlt[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [originText, setOriginText] = useState("");
  const [destText, setDestText] = useState("");
  const [profile, setProfile] = useState<"driving" | "walking" | "cycling">("driving");
  const seenRef = useRef<Set<string>>(new Set()); // dedupe pothole events across polls
  const [dangerOpen, setDangerOpen] = useState(false);
  const [dangerTitle, setDangerTitle] = useState<string>("");
  const [dangerText, setDangerText] = useState<string>("");
  const lastAnalyzeKey = useRef<string>("");

  useEffect(() => {
    if (pos && !origin) {
      setOrigin([pos.coords.latitude, pos.coords.longitude]);
    }
  }, [pos, origin]);

  const ClickHandler = useMemo(
    () =>
      dynamic(async () => {
        const { useMapEvents } = await import("react-leaflet");
        type ClickEvent = { latlng: { lat: number; lng: number } };
        return function Handler() {
          useMapEvents({
            click(...args: unknown[]) {
              const e = args[0] as ClickEvent;
              // Log clicked coordinates
              console.log("Map click:", e.latlng.lat, e.latlng.lng);
              if (!origin) {
                setOrigin([e.latlng.lat, e.latlng.lng]);
              } else if (!destination) {
                setDestination([e.latlng.lat, e.latlng.lng]);
              } else {
                // When both exist, clicking sets a new destination and re-routes
                setDestination([e.latlng.lat, e.latlng.lng]);
              }
            },
          });
          return null;
        };
      }, { ssr: false }),
    [origin, destination]
  );

  const fetchRoutes = useCallback(async () => {
    if (!origin || !destination) return;
    const [olat, olng] = origin as [number, number];
    const [dlat, dlng] = destination as [number, number];
    const coords = `${olng},${olat};${dlng},${dlat}`; // lng,lat;lng,lat
    const url = `/api/mapbox/directions?profile=${profile}&coords=${encodeURIComponent(coords)}&overview=full&alternatives=true&geometries=polyline6`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data?.routes) return;

    type OSRMRoute = { geometry: string; distance: number; duration: number };
    const alts: RouteAlt[] = (data.routes as OSRMRoute[]).map((r, idx: number) => {
      const pts = polyline.decode(r.geometry, 6).map((pair: [number, number]) => [pair[0], pair[1]]) as LatLngExpression[];
      const safetyScore = computeRouteSafety(pts, incidents);
      const penaltySeconds = computeIncidentPenalty(pts, incidents);
      const matches: { lat: number; lng: number; incident: Incident; distKm: number }[] = [];
      const sampled = pts as [number, number][];
      for (const inc of incidents) {
        let minD = Infinity;
        let nearLat = inc.lat;
        let nearLng = inc.lng;
        const step = Math.max(1, Math.floor(sampled.length / 200));
        for (let i = 0; i < sampled.length; i += step) {
          const [lat, lng] = sampled[i];
          const d = haversine(lat, lng, inc.lat, inc.lng);
          if (d < minD) { minD = d; nearLat = lat; nearLng = lng; }
          if (minD < 0.01) break;
        }
        if (minD < 0.1) matches.push({ lat: nearLat, lng: nearLng, incident: inc, distKm: minD });
      }
      return { id: `r${idx}`, geometry: pts, distance: r.distance, duration: r.duration, safetyScore, penaltySeconds, matches };
    });
    const chosen = alts.slice().sort((a, b) => adjustedCost(a) - adjustedCost(b));
    setRoutes(chosen);
    const initialActive = activeId && chosen.find(c => c.id === activeId) ? activeId : chosen[0]?.id ?? null;
    setActiveId(initialActive);

    // Helper: analyzer caller
    const runAnalyze = async (worstInc: Incident, hasSafer: boolean) => {
      const key = `${olng},${olat}->${dlng},${dlat}|${initialActive}`;
      setDangerTitle(hasSafer ? "Safer route available" : "Heads up: incidents on this route");
      setDangerText(
        hasSafer
          ? `We found recent incidents along the selected path (top severity ${worstInc.severity}/100${worstInc.hardAvoid ? ", critical). " : "). "}Another alternative avoids these spots. Checking details...`
          : `Incidents reported on this route (top severity ${worstInc.severity}/100${worstInc.hardAvoid ? ", critical). " : "). "}Checking details...`
      );
      setDangerOpen(true);
      if (lastAnalyzeKey.current === key) return;
      lastAnalyzeKey.current = key;
      try {
        const ar = await fetch(`/api/safemap/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: worstInc.lat, lng: worstInc.lng, radius: 0.5 }),
        });
        if (ar.ok) {
          const aj = await ar.json();
          const recommendations: unknown = (aj && (aj.recommendations ?? aj.tips ?? aj.summary)) as unknown;
          const status: string | undefined = typeof aj?.status === "string" ? aj.status : undefined;
          const lines: string[] = [];
          if (status) lines.push(`Status: ${status}`);
          if (Array.isArray(recommendations)) lines.push(...(recommendations as string[]));
          else if (typeof recommendations === "string") lines.push(recommendations as string);
          if (lines.length > 0) {
            setDangerTitle(hasSafer ? "Why the other route is safer" : "Why this route is risky");
            setDangerText(lines.join("\n"));
          }
        }
      } catch {
        // ignore analyzer errors
      }
    };

    // Decide for active route
    try {
      const active = chosen.find(c => c.id === initialActive) || chosen[0];
      const hits = (active?.matches || []).filter(m => m.distKm < 0.05);
      const hasSafer = chosen.some(o => o.id !== active?.id && (o.matches || []).filter(m => m.distKm < 0.05).length === 0);
      if (active && hits.length > 0) {
        const worst = hits.slice().sort((a, b) => (b.incident.hardAvoid ? 1 : 0) - (a.incident.hardAvoid ? 1 : 0) || b.incident.severity - a.incident.severity)[0];
        await runAnalyze(worst.incident, hasSafer);
      } else {
        setDangerOpen(false);
      }
    } catch {
      // ignore UI errors
    }
  }, [origin, destination, profile, incidents, activeId]);

  // Fetch incidents reported via the /report page (server-side store)
  const refreshIncidents = useCallback(async () => {
    try {
      const r = await fetch("/api/incidents", { cache: "no-store" });
      const j = await r.json();
      if (Array.isArray(j?.incidents)) setIncidents(j.incidents);
    } catch {
      // ignore fetch errors in prototype
    }
  }, []);

  useEffect(() => { refreshIncidents(); }, [refreshIncidents]);
  // Auto-route whenever inputs change
  useEffect(() => { fetchRoutes(); }, [fetchRoutes]);

  // Derived UI memos for Tesla-style panel
  const activeRoute = useMemo(() => routes.find(r => r.id === activeId) || null, [routes, activeId]);
  const hasSaferAlt = useMemo(
    () => routes.some(o => o.id !== activeId && (o.matches || []).filter(m => m.distKm < 0.05).length === 0),
    [routes, activeId]
  );
  const activeStats = useMemo(() => {
    if (!activeRoute) return null as null | { km: string; min: number };
    const kmStr = (activeRoute.distance / 1000).toFixed(1);
    const min = Math.round(activeRoute.duration / 60);
    return { km: kmStr, min };
  }, [activeRoute]);

  // Poll pothole endpoint every 5 seconds and auto-ingest as incidents
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const seen = seenRef.current;

    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

    async function pollOnce() {
      try {
        const resp = await fetch("/api/potholes", { cache: "no-store" });
        const data: unknown = await resp.json();
        type PotholeItem = {
          lat?: number; longitude?: number; lng?: number; latitude?: number;
          location?: { lat?: number; lng?: number; latitude?: number; longitude?: number };
          position?: { lat?: number; lng?: number; latitude?: number; longitude?: number };
          client_ts?: string | number; clientTs?: string | number; timestamp?: string | number; ts?: string | number; time?: string | number;
          metrics?: { jerkMag?: number; gyroMag?: number };
          jerkMag?: number; jerk?: number; gyroMag?: number; gyro?: number;
        };
        let items: PotholeItem[] = [];
        if (Array.isArray(data)) {
          items = data as PotholeItem[];
        } else if (typeof data === "object" && data !== null) {
          const rec = data as Record<string, unknown>;
          const maybeItems = (rec["items"] ?? rec["data"]) as unknown;
          if (Array.isArray(maybeItems)) items = maybeItems as PotholeItem[];
        }
        let posted = false;
        for (const it of items) {
          const lat: number | undefined = it?.lat ?? it?.latitude ?? it?.location?.lat ?? it?.location?.latitude ?? it?.position?.lat ?? it?.position?.latitude;
          const lng: number | undefined = it?.lng ?? it?.longitude ?? it?.location?.lng ?? it?.location?.longitude ?? it?.position?.lng ?? it?.position?.longitude;
          if (typeof lat !== "number" || typeof lng !== "number") continue;
          const tsRaw = it?.client_ts ?? it?.clientTs ?? it?.timestamp ?? it?.ts ?? it?.time;
          const key = tsRaw != null ? String(tsRaw) : `${lat.toFixed(5)},${lng.toFixed(5)}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const jerk: number = (it?.metrics?.jerkMag ?? it?.jerkMag ?? it?.jerk ?? 0) as number;
          const gyro: number = (it?.metrics?.gyroMag ?? it?.gyroMag ?? it?.gyro ?? 0) as number;
          const severity = clamp(Math.round(jerk * 15 + gyro * 8), 10, 100);

          try {
            await fetch("/api/incidents", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ lat, lng, severity, hardAvoid: false, note: "Pothole (auto)" }),
            });
            posted = true;
          } catch {
            // ignore post error, continue
          }
        }
        if (posted) {
          await refreshIncidents();
          await fetchRoutes();
        }
      } catch {
        // ignore poll errors
      }
    }

    // start immediately and then poll
    pollOnce();
    timer = setInterval(pollOnce, 5000);
    return () => { if (timer) clearInterval(timer); };
  }, [fetchRoutes, refreshIncidents]);


  return (
    <main className="relative h-screen w-screen overflow-hidden">
      {/* Left Tesla-style panel */}
  <div className="absolute left-3 top-3 z-[1000] w-[380px] max-w-[92vw] bg-[#FBFDFF]/20 backdrop-blur-lg rounded-lg shadow-lg">
        <div className="p-4 border-b border-gray-700">
          <div className="text-xs uppercase tracking-widest text-zinc-900">Safe Passage</div>
          <div className="mt-2 flex items-center gap-2">
            <button className="px-3 py-1.5 rounded-lg bg-[#D9D9D9] text-black text-sm" onClick={() => (locate(), null)}>Use my location</button>
            <a href="/report" className="ml-auto px-3 py-1.5 rounded-lg text-sm bg-[blue] text-white">Report</a>
          </div>
        </div>
        <div className="p-4 flex flex-col gap-3">
          <input className="rounded-lg px-3 py-2 text-sm bg-white text-black placeholder-zinc-800 focus:outline-none focus:ring-1 focus:ring-[blue]" placeholder="From lat,lng" value={originText} onChange={e => setOriginText(e.target.value)} onBlur={() => {
            const [lat, lng] = originText.split(/[\,\s]+/).map(Number);
            if (!isNaN(lat) && !isNaN(lng)) setOrigin([lat, lng]);
          }} />
          <input className="rounded-lg px-3 py-2 text-sm bg-white text-black placeholder-zinc-800 focus:outline-none focus:ring-1 focus:ring-[blue]" placeholder="To lat,lng" value={destText} onChange={e => setDestText(e.target.value)} onBlur={() => {
            const [lat, lng] = destText.split(/[\,\s]+/).map(Number);
            if (!isNaN(lat) && !isNaN(lng)) setDestination([lat, lng]);
          }} />
          <div className="flex items-center gap-2">
            <select
              className="rounded-lg px-2 py-2 text-sm bg-[blue] text-white  focus:outline-none"
              value={profile}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setProfile(e.target.value as "driving" | "walking" | "cycling")}
            >
              <option value="driving">Driving</option>
              <option value="walking">Walking</option>
              <option value="cycling">Cycling</option>
            </select>
            <button className="ml-auto px-3 py-2 rounded-lg text-sm bg-[#D9D9D9] text-black" onClick={() => { setOrigin(null); setDestination(null); setRoutes([]); setOriginText(""); setDestText(""); }}>Clear</button>
          </div>

          {/* Active route stats */}
          {activeStats && (
            <div className="rounded-lg bg-white/20 p-3 flex items-center gap-4 text-sm shadow-md">
              <div>
                <div className="text-xs text-zinc-800">ETA</div>
                <div className="font-semibold text-black">{activeStats.min} min</div>
              </div>
              <div>
                <div className="text-xs text-zinc-800">Distance</div>
                <div className="font-semibold text-black">{activeStats.km} km</div>
              </div>
              <div className="ml-auto">
                {hasSaferAlt && (
                  <button
                    className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs shadow-md hover:bg-blue-700"
                    onClick={() => {
                      const safe = routes.find(o => o.id !== activeId && (o.matches || []).filter(m => m.distKm < 0.05).length === 0);
                      if (safe) setActiveId(safe.id);
                    }}
                  >
                    Switch to safer route
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Alternatives list */}
          {routes.length > 1 && (
            <div className="rounded-lg bg-white/20 p-2 text-xs shadow-lg">
              <div className="px-2 py-1 text-zinc-800">Alternatives</div>
              <div className="flex flex-col gap-1">
                {routes.map(r => {
                  const km = (r.distance / 1000).toFixed(1);
                  const min = Math.round(r.duration / 60);
                  const impacted = (r.matches || []).some(m => m.distKm < 0.05);
                  return (
                    <button
                      key={r.id}
                      onClick={() => setActiveId(r.id)}
                      className={`text-left px-2 py-2 rounded-md ${r.id === activeId ? "bg-[blue]/20" : "bg-zinc-100 "}`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-black">{min} min</div>
                        <div className="text-zinc-800">• {km} km</div>
                        {impacted ? (
                          <span className="ml-auto text-red-600">risk</span>
                        ) : (
                          <span className="ml-auto text-green-600">clear</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Safety advisory integrated */}
          {dangerOpen && (
            <div className="rounded-xl border border-gray-700 bg-gray-800 p-3 shadow-md border-l-4 border-l-red-500">
              <div className="flex items-start gap-2">
                <div className="mt-1 h-2 w-2 rounded-full bg-red-500" />
                <div className="flex-1">
                  <div className="font-semibold text-sm text-white">{dangerTitle}</div>
                  <div className="text-xs text-gray-300 mt-1 whitespace-pre-line">{dangerText}</div>
                </div>
                <button className="ml-2 text-gray-400 hover:text-white" onClick={() => setDangerOpen(false)}>✕</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Map full-bleed background */}
      <div className="absolute inset-0">
        <MapContainer center={(origin as LatLngExpression) || center} zoom={13} zoomControl={false} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            url={`https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}?access_token=${process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}`}
            attribution='Map data © OpenStreetMap contributors, Imagery © Mapbox'
          />
          <ClickHandler />
          {origin && (
            <Marker position={origin} icon={defaultIcon}>
              <Popup>Origin</Popup>
            </Marker>
          )}
          {destination && (
            <Marker position={destination} icon={defaultIcon}>
              <Popup>Destination</Popup>
            </Marker>
          )}
          {routes.map(r => (
            <Polyline
              key={r.id}
              positions={r.geometry}
              bubblingMouseEvents={false}
              eventHandlers={{
                click: (e: { originalEvent?: { stopPropagation?: () => void }; latlng?: { lat: number; lng: number } }) => {
                  // select this alternative and prevent the map's click from firing
                  if (e?.originalEvent?.stopPropagation) e.originalEvent.stopPropagation();
                  if (e?.latlng) console.log("Route click:", e.latlng.lat, e.latlng.lng);
                  setActiveId(r.id);
                  // If the clicked route has nearby incidents, open the panel with a quick local summary
                  const hits = (r.matches || []).filter(m => m.distKm < 0.05);
                  if (hits.length > 0) {
                    const worst = hits.slice().sort((a, b) => (b.incident.hardAvoid ? 1 : 0) - (a.incident.hardAvoid ? 1 : 0) || b.incident.severity - a.incident.severity)[0];
                    setDangerTitle("Heads up on this route");
                    setDangerText(
                      `Reports nearby: severity ${worst.incident.severity}/100` +
                      (worst.incident.hardAvoid ? ", marked critical." : ".") +
                      (worst.incident.note ? `\nNote: ${worst.incident.note}` : "")
                    );
                    setDangerOpen(true);
                    // Also call analyzer to populate richer explanation
                    (async () => {
                      try {
                        console.log("Calling analyzer from route click", worst.incident.lat, worst.incident.lng);
                        await fetch(`/api/safemap/analyze`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ lat: worst.incident.lat, lng: worst.incident.lng, radius: 0.5 }),
                        }).then(async (ar) => {
                          if (!ar.ok) return;
                          const aj = await ar.json();
                          const recommendations: unknown = (aj && (aj.recommendations ?? aj.tips ?? aj.summary)) as unknown;
                          const lines: string[] = [];
                          if (Array.isArray(recommendations)) lines.push(...(recommendations as string[]));
                          else if (typeof recommendations === "string") lines.push(recommendations as string);
                          if (lines.length > 0) {
                            setDangerTitle("Why this route is risky");
                            setDangerText(lines.join("\n"));
                          }
                        });
                      } catch (err) {
                        console.warn("Analyzer error (click)", err);
                      }
                    })();
                  } else {
                    setDangerOpen(false);
                  }
                },
              }}
              pathOptions={{
                color: r.id === activeId ? "#0000FF" : "#999",
                weight: r.id === activeId ? 7 : 4,
                opacity: r.id === activeId ? 1 : 0.6,
                dashArray: r.id === activeId ? undefined : "6 8",
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          ))}
        </MapContainer>
      </div>
    </main>
  );
}
