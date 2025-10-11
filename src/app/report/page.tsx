"use client";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import { icon } from "leaflet";

// Add custom CSS for animations and slider (solid colors, no gradients)
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    
    
    /* Minimal, classy slider styling */
    .slider {
      -webkit-appearance: none;
      appearance: none;
      height: 3px;
      background: #e5e7eb; /* slate-200 */
      border-radius: 9999px;
    }
    .slider::-webkit-slider-thumb {
      appearance: none;
      height: 18px;
      width: 18px;
      border-radius: 50%;
      background: #2563eb; /* solid blue */
      border: 2px solid #ffffff;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.15);
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .slider::-webkit-slider-thumb:hover {
      transform: scale(1.05);
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.2);
    }
    
    .slider::-moz-range-thumb {
      height: 18px;
      width: 18px;
      border-radius: 50%;
      background: #2563eb;
      border: 2px solid #ffffff;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.15);
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .slider::-moz-range-track {
      height: 3px;
      background: #e5e7eb;
      border-radius: 9999px;
    }
  `;
  document.head.appendChild(style);
}

type Incident = {
  id: string;
  lat: number;
  lng: number;
  severity: number;
  hardAvoid: boolean;
  note?: string;
  imageUrl?: string;
  place?: string;
  createdAt: number;
};

export default function ReportPage() {
  const [lat, setLat] = useState<string>("");
  const [lng, setLng] = useState<string>("");
  const [severity, setSeverity] = useState(50);
  const [hardAvoid, setHardAvoid] = useState(false);
  const [note, setNote] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<Incident[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [place, setPlace] = useState<string>("");
  const [geocoding, setGeocoding] = useState<boolean>(false);
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{ id: string; name: string; place: string; center: { lat: number; lng: number } | null }>>([]);
  const INDIA_CENTER: [number, number] = [22.351, 78.667];
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [suppressSuggestions, setSuppressSuggestions] = useState<boolean>(false);
  const [hoveringSuggestions, setHoveringSuggestions] = useState<boolean>(false);

  // Leaflet dynamic imports (no SSR)
  const MapContainer = useMemo(() => dynamic(() => import("react-leaflet").then(m => m.MapContainer), { ssr: false }), []);
  const TileLayer = useMemo(() => dynamic(() => import("react-leaflet").then(m => m.TileLayer), { ssr: false }), []);
  const Marker = useMemo(() => dynamic(() => import("react-leaflet").then(m => m.Marker), { ssr: false }), []);
  const ClickPicker = useMemo(
    () =>
      dynamic(async () => {
        const { useMapEvents } = await import("react-leaflet");
        type ClickEvent = { latlng: { lat: number; lng: number } };
        return function Picker() {
          useMapEvents({
            click(...args: unknown[]) {
              const e = args[0] as ClickEvent;
              const clat = e.latlng.lat;
              const clng = e.latlng.lng;
              if (typeof clat === "number" && typeof clng === "number") {
                setLat(String(clat));
                setLng(String(clng));
                setMapCenter([clat, clng]);
              }
            },
          });
          return null;
        };
      }, { ssr: false }),
    []
  );
  const FlyToCenter = useMemo(
    () =>
      dynamic(async () => {
        const { useMap } = await import("react-leaflet");
        return function Fly({ center, zoom }: { center: [number, number] | null; zoom?: number }) {
          const map = useMap();
          useEffect(() => {
            if (center) {
              try { map.flyTo(center, zoom ?? 16, { animate: true, duration: 0.8 }); } catch { map.setView(center, zoom ?? 16); }
            }
          }, [center, zoom, map]);
          return null;
        };
      }, { ssr: false }),
    []
  );
  const defaultIcon = useMemo(() => icon({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  }), []);

  async function refresh() {
    const r = await fetch("/api/incidents");
    const j = await r.json();
    setList(j.incidents || []);
  }

  useEffect(() => {
    refresh();
  }, []);

  // Reverse geocode when lat/lng change
  useEffect(() => {
    // Guard: avoid treating empty strings as 0,0 (ocean)
    if (!lat || !lng || lat.trim() === "" || lng.trim() === "") {
      setPlace("");
      return;
    }
    const nlat = parseFloat(lat);
    const nlng = parseFloat(lng);
    if (!Number.isFinite(nlat) || !Number.isFinite(nlng)) {
      setPlace("");
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setGeocoding(true);
        const r = await fetch(`/api/geocode/reverse?lat=${encodeURIComponent(nlat)}&lng=${encodeURIComponent(nlng)}`);
        const j = await r.json();
        if (r.ok) setPlace(j.place || "");
        setMapCenter([nlat, nlng]);
      } catch {
        // ignore
      } finally {
        setGeocoding(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [lat, lng]);

  // Search suggestions (debounced)
  useEffect(() => {
    if (suppressSuggestions) { return; }
    if (!search || search.trim().length < 2) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: search, country: 'in' });
        if (lat && lng && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))) {
          params.set('lat', String(lat));
          params.set('lng', String(lng));
        }
        const r = await fetch(`/api/geocode/search?${params.toString()}`);
        const j = await r.json();
        if (r.ok) setSuggestions(j.results || []);
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [search, lat, lng, suppressSuggestions]);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation not supported");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(String(pos.coords.latitude));
        setLng(String(pos.coords.longitude));
      },
      (e) => setError(e.message),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const nlat = Number(lat),
      nlng = Number(lng);
    if (Number.isNaN(nlat) || Number.isNaN(nlng)) {
      setError("Enter valid numeric lat,lng");
      return;
    }
    setBusy(true);
    try {
      let base64Image: string | null = null;
      if (image) {
        base64Image = await fileToBase64(image);
      }

      const r = await fetch("/api/incidents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lat: nlat,
          lng: nlng,
          severity,
          hardAvoid,
          note,
          place: place || undefined,
          image: base64Image, // ✅ send as Base64
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      setNote("");
      setImage(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-screen w-full px-6 lg:px-10 py-8 text-black">

      {/* Top bar */}
      <div className="w-full flex items-center justify-between relative z-10 mb-8">
        <div className="text-xs uppercase tracking-[0.25em] text-zinc-800 font-medium">Safe Passage</div>
        <Link 
          href="/" 
          className="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          <span className="flex items-center gap-2">
            ← Back to map
          </span>
        </Link>
      </div>

      {/* Grid layout: Form (2/5) + Recent Reports (3/5) */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-5 gap-8 relative z-10">
        {/* Form section - 2/5 width */}
        <div className="lg:col-span-2">
          <form
            onSubmit={submit}
            className="space-y-6 bg-white rounded-lg border border-slate-200 p-8 sticky top-8"
          >
        {/* Lat + Lng */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="group">
            <label className="block text-sm font-semibold mb-3 text-slate-700 group-focus-within:text-blue-600 transition-colors duration-200">Latitude</label>
            <div className="relative">
              <input
                className="w-full rounded-lg px-4 py-3 text-sm bg-white text-slate-900 placeholder-slate-400 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="28.6139"
              />
              {/* focus overlay removed for mature style */}
            </div>
          </div>
          <div className="group">
            <label className="block text-sm font-semibold mb-3 text-slate-700 group-focus-within:text-blue-600 transition-colors duration-200">Longitude</label>
            <div className="relative">
              <input
                className="w-full rounded-lg px-4 py-3 text-sm bg-white text-slate-900 placeholder-slate-400 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="77.2090"
              />
              {/* focus overlay removed for mature style */}
            </div>
          </div>
        </div>
        {/* Search and mini map picker */}
        <div className="mt-2 grid grid-cols-1 gap-4">
          <div className="relative">
            <input
              className="w-full rounded-lg px-4 py-3 text-sm bg-white text-slate-900 placeholder-slate-400 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
              placeholder="Search a place, street, or area"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSuppressSuggestions(false); }}
              onBlur={() => { setTimeout(() => { if (!hoveringSuggestions) { setSuggestions([]); setSuppressSuggestions(true); } }, 120); }}
            />
            {suggestions.length > 0 && !suppressSuggestions && (
              <ul className="absolute z-50 left-0 bottom-full mb-2 w-full bg-white border border-slate-200 rounded-lg shadow-md max-h-56 overflow-auto" onMouseEnter={() => setHoveringSuggestions(true)} onMouseLeave={() => setHoveringSuggestions(false)}>
                {suggestions.map(s => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (s.center) {
                          setLat(String(s.center.lat));
                          setLng(String(s.center.lng));
                          setPlace(s.place);
                          setMapCenter([s.center.lat, s.center.lng]);
                        }
                        setSearch(s.place);
                        setSuggestions([]);
                        setSuppressSuggestions(true);
                      }}
                    >
                      <div className="font-medium text-slate-800">{s.name}</div>
                      <div className="text-xs text-slate-500">{s.place}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={`h-56 w-full overflow-hidden rounded-lg border border-slate-200 relative`}>
            {/* Mini map: click to choose location */}
            <MapContainer center={mapCenter || INDIA_CENTER} zoom={mapCenter ? 13 : 5} style={{ height: "100%", width: "100%" }} zoomControl={false}>
              <TileLayer
                url={`https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}?access_token=${process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}`}
                attribution='Map data © OpenStreetMap contributors, Imagery © Mapbox'
              />
              <FlyToCenter center={mapCenter} zoom={16} />
              <ClickPicker />
              {(lat && lng) && (
                <Marker position={[Number(lat), Number(lng)]} icon={defaultIcon} />
              )}
            </MapContainer>
          </div>
        </div>
        {/* Resolved place */}
        <div className="-mt-2 mb-2 text-sm text-slate-700">
          <span className="font-medium">Location: </span>
          {geocoding ? (
            <span className="text-slate-400">Resolving…</span>
          ) : place ? (
            <span className="text-slate-800">{place}</span>
          ) : (
            <span className="text-slate-400">Enter valid coordinates to resolve</span>
          )}
        </div>
        <button
          type="button"
          onClick={useMyLocation}
          className="px-4 py-2.5 text-sm rounded-lg bg-gray-200 text-slate-700 hover:bg-gray-300 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
          </svg>
          Use My Location
        </button>

        {/* Severity */}
        <div className="group">
          <label className="block text-sm font-semibold mb-4 text-slate-700">Severity Level</label>
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <input
                type="range"
                min={0}
                max={100}
                value={severity}
                onChange={(e) => setSeverity(parseInt(e.target.value))}
                className="w-full appearance-none cursor-pointer slider"
              />
            </div>
            <div className={`px-4 py-2 rounded-lg text-sm font-bold min-w-[80px] text-center shadow-md transition-all duration-300 ${
              severity < 30 ? 'bg-green-100 text-green-800' :
              severity < 70 ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
              {severity}
            </div>
          </div>
          <div className="mt-2 flex justify-between text-xs text-slate-500">
            <span>Minor</span>
            <span>Moderate</span>
            <span>Severe</span>
          </div>
        </div>

        {/* Hard avoid */}
  <div className="flex items-center gap-3 p-4 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors duration-200">
          <div className="relative">
            <input
              type="checkbox"
              checked={hardAvoid}
              onChange={(e) => setHardAvoid(e.target.checked)}
              className="peer h-5 w-5 rounded-md border-2 border-slate-300 text-red-600 focus:ring-2 focus:ring-red-500/50 transition-all duration-200"
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 peer-checked:opacity-100 transition-opacity duration-200 pointer-events-none">
              <svg className="w-3 h-3 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
          <label className="text-sm font-medium text-slate-700 cursor-pointer select-none">Mark as critical incident</label>
        </div>

        {/* Note */}
        <div className="group">
          <label className="block text-sm font-semibold mb-3 text-slate-700 group-focus-within:text-blue-600 transition-colors duration-200">Additional Details</label>
          <div className="relative">
            <textarea
              className="w-full rounded-lg px-4 py-3 text-sm bg-white text-slate-900 placeholder-slate-400 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 resize-none"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Describe the incident in detail..."
            />
            <div className="absolute bottom-3 right-3 text-xs text-slate-400">
              {note.length}/500
            </div>
          </div>
        </div>

        {/* Image */}
        <div className="group">
          <label className="block text-sm font-semibold mb-3 text-slate-700">Photo Evidence</label>
          <div className="relative">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImage(e.target.files?.[0] || null)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="flex items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors">
              <div className="text-center">
                <svg className="mx-auto h-8 w-8 text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm text-slate-600">{image ? image.name : "Click to upload photo"}</p>
                <p className="text-xs text-slate-400 mt-1">PNG, JPG up to 10MB</p>
              </div>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="pt-4">
          <button
            disabled={busy}
            className="w-full overflow-hidden rounded-lg bg-blue-600 px-8 py-4 text-base font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <div className="flex items-center justify-center gap-3">
              {busy && (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              )}
              <span>{busy ? "Submitting Report..." : "Submit Incident Report"}</span>
            </div>
          </button>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}
          </form>
        </div>

        {/* Recent Reports section - 3/5 width */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-lg border border-slate-200 p-8">
            <div className="mb-6 border-b border-gray-200 pb-3">
              <h2 className="text-xl font-semibold text-slate-800">Recent Reports</h2>
            </div>
          {list.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 bg-slate-200 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-slate-600 font-medium">No incidents reported yet</p>
              <p className="text-slate-400 text-sm mt-1">Your reports will appear here</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {list.map((i) => (
                <li
                  key={i.id}
                  className="relative overflow-hidden rounded-none bg-white p-6 border-b border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                          <div className="w-2 h-2 flex-shrink-0 bg-rose-500 rounded-full"></div>
                          {i.place ? i.place : `${i.lat.toFixed(5)}, ${i.lng.toFixed(5)}`}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                          i.severity < 30 ? 'bg-green-100 text-green-800' :
                          i.severity < 70 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          Severity {i.severity}
                        </span>
                        {i.hardAvoid && (
                          <span className="inline-flex items-center rounded-full bg-red-500 text-white px-3 py-1 text-xs font-semibold">
                            <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            Critical
                          </span>
                        )}
                      </div>
                      
                      {i.note && (
                        <p className="text-sm text-slate-800 leading-relaxed mb-3 bg-white rounded-lg p-3 italic">
                          &ldquo;{i.note}&rdquo;
                        </p>
                      )}
                    </div>
                    
                    <div className="flex flex-col items-end gap-3 min-w-[14rem]">
                      <div className="text-xs text-slate-500 bg-slate-100 rounded-md px-3 py-2">
                        {new Date(i.createdAt).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                      {/* Static map preview on the right */}
                      {(() => {
                        const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
                        if (!token) return null;
                        const lat = i.lat;
                        const lng = i.lng;
                        const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+2563eb(${lng},${lat})/${lng},${lat},15,0/224x140@2x?access_token=${token}`;
                        return (
                          <div className="relative w-[224px] h-[140px] rounded-md overflow-hidden border border-slate-200">
                            <Image src={url} alt="location map" fill sizes="224px" className="object-cover" />
                          </div>
                        );
                      })()}
                      {/* Uploaded image (if any) to the right too */}
                      {i.imageUrl && (
                        <div className="relative w-[224px] h-[140px] rounded-md overflow-hidden border border-slate-200">
                          <Image
                            src={i.imageUrl}
                            alt="incident"
                            fill
                            className="object-cover"
                            sizes="224px"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          </div>
        </div>
      </div>
    </main>
  );
}
``