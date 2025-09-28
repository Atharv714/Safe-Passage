"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

// Add custom CSS for animations and slider
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
    
    .slider::-webkit-slider-thumb {
      appearance: none;
      height: 24px;
      width: 24px;
      border-radius: 50%;
      background: linear-gradient(135deg, #3b82f6, #1d4ed8);
      border: 3px solid white;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .slider::-webkit-slider-thumb:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 20px rgba(59, 130, 246, 0.6);
    }
    
    .slider::-moz-range-thumb {
      height: 24px;
      width: 24px;
      border-radius: 50%;
      background: linear-gradient(135deg, #3b82f6, #1d4ed8);
      border: 3px solid white;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
      cursor: pointer;
      transition: all 0.2s ease;
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

  async function refresh() {
    const r = await fetch("/api/incidents");
    const j = await r.json();
    setList(j.incidents || []);
  }

  useEffect(() => {
    refresh();
  }, []);

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
    <main className="relative min-h-screen w-full px-4 sm:px-6 py-8 text-black bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/40">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-400/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-400/10 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      {/* Top bar */}
      <div className="mx-auto max-w-3xl flex items-center justify-between relative z-10">
        <div className="text-xs uppercase tracking-[0.25em] text-zinc-900 font-medium">Safe Passage</div>
        <Link 
          href="/" 
          className="group px-4 py-2 rounded-xl text-sm bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg hover:shadow-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-300 transform hover:scale-105"
        >
          <span className="flex items-center gap-2">
            ← Back to map
          </span>
        </Link>
      </div>

      {/* Form card */}
      <form
        onSubmit={submit}
        className="mx-auto max-w-3xl mt-8 space-y-6 bg-white/40 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 p-8 relative z-10 hover:shadow-3xl transition-shadow duration-500"
      >
        {/* Lat + Lng */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="group">
            <label className="block text-sm font-semibold mb-3 text-slate-700 group-focus-within:text-blue-600 transition-colors duration-200">Latitude</label>
            <div className="relative">
              <input
                className="w-full rounded-xl px-4 py-3 text-sm bg-white/80 backdrop-blur-sm text-slate-900 placeholder-slate-400 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 shadow-sm hover:shadow-md transition-all duration-300"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="28.6139"
              />
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/5 to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
            </div>
          </div>
          <div className="group">
            <label className="block text-sm font-semibold mb-3 text-slate-700 group-focus-within:text-blue-600 transition-colors duration-200">Longitude</label>
            <div className="relative">
              <input
                className="w-full rounded-xl px-4 py-3 text-sm bg-white/80 backdrop-blur-sm text-slate-900 placeholder-slate-400 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 shadow-sm hover:shadow-md transition-all duration-300"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="77.2090"
              />
              <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/5 to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={useMyLocation}
          className="group px-4 py-2.5 text-sm rounded-xl bg-gradient-to-r from-slate-200 to-slate-300 text-slate-700 hover:from-slate-300 hover:to-slate-400 shadow-md hover:shadow-lg transform hover:scale-105 transition-all duration-200 flex items-center gap-2"
        >
          <svg className="w-4 h-4 group-hover:animate-pulse" fill="currentColor" viewBox="0 0 20 20">
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
                className="w-full h-3 bg-gradient-to-r from-green-200 via-yellow-200 to-red-200 rounded-full appearance-none cursor-pointer slider"
                style={{
                  background: `linear-gradient(to right, #10b981 0%, #f59e0b ${severity/2}%, #ef4444 100%)`
                }}
              />
              <div 
                className="absolute top-1/2 transform -translate-y-1/2 w-6 h-6 bg-white rounded-full shadow-lg border-4 border-blue-500 transition-all duration-200 pointer-events-none"
                style={{ left: `calc(${severity}% - 12px)` }}
              ></div>
            </div>
            <div className={`px-4 py-2 rounded-xl text-sm font-bold min-w-[80px] text-center shadow-md transition-all duration-300 ${
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
        <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-50/50 hover:bg-slate-100/50 transition-colors duration-200">
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
              className="w-full rounded-xl px-4 py-3 text-sm bg-white/80 backdrop-blur-sm text-slate-900 placeholder-slate-400 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 shadow-sm hover:shadow-md transition-all duration-300 resize-none"
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
            <div className="flex items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-xl hover:border-blue-400 hover:bg-blue-50/50 transition-all duration-300 group-hover:scale-[1.02]">
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
            className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-4 text-base font-semibold text-white shadow-xl hover:from-blue-700 hover:to-blue-800 hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] transition-all duration-300"
          >
            <div className={`flex items-center justify-center gap-3 transition-all duration-300 ${busy ? 'scale-95' : 'scale-100'}`}>
              {busy && (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              )}
              <span>{busy ? "Submitting Report..." : "Submit Incident Report"}</span>
              {!busy && (
                <svg className="w-5 h-5 transform group-hover:translate-x-1 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              )}
            </div>
            <div className="absolute inset-0 -top-[2px] bg-gradient-to-r from-white/0 via-white/40 to-white/0 transform translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out"></div>
          </button>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}
      </form>

      {/* Recent Incidents */}
      <section className="mx-auto max-w-3xl mt-12 relative z-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 to-transparent"></div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">Recent Reports</h2>
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-300 to-transparent"></div>
        </div>
        
        <div className="bg-white/40 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 p-6 hover:shadow-3xl transition-shadow duration-500">
          {list.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-slate-200 to-slate-300 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-slate-600 font-medium">No incidents reported yet</p>
              <p className="text-slate-400 text-sm mt-1">Your reports will appear here</p>
            </div>
          ) : (
            <ul className="space-y-4">
              {list.map((i, index) => (
                <li
                  key={i.id}
                  className="group relative overflow-hidden rounded-xl bg-white/60 backdrop-blur-sm p-6 shadow-lg hover:shadow-xl border border-white/40 hover:bg-white/80 transition-all duration-300 hover:scale-[1.02]"
                  style={{ 
                    animationDelay: `${index * 100}ms`,
                    animation: 'slideInUp 0.6s ease-out forwards'
                  }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                          {i.lat.toFixed(5)}, {i.lng.toFixed(5)}
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
                        <p className="text-sm text-slate-700 leading-relaxed mb-3 bg-slate-50/50 rounded-lg p-3 border-l-4 border-blue-200">
                          &ldquo;{i.note}&rdquo;
                        </p>
                      )}
                      
                      {i.imageUrl && (
                        <div className="mt-3 w-48 h-32 relative overflow-hidden rounded-lg shadow-md group-hover:shadow-lg transition-shadow duration-300">
                          <Image
                            src={i.imageUrl}
                            alt="incident"
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                            sizes="192px"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        </div>
                      )}
                    </div>
                    
                    <div className="text-right">
                      <div className="text-xs text-slate-500 bg-slate-100/80 rounded-lg px-3 py-2">
                        {new Date(i.createdAt).toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </div>
                  </div>
                  
                  {/* Subtle hover gradient */}
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
