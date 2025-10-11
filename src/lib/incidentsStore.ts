export type Incident = {
  id: string;
  lat: number;
  lng: number;
  severity: number; // 0..100
  hardAvoid: boolean;
  note?: string;
  place?: string;
  createdAt: number;
};

const incidents: Incident[] = [];

export function listIncidents() {
  return incidents.slice().sort((a, b) => b.createdAt - a.createdAt);
}

export function addIncident(payload: Omit<Incident, "id" | "createdAt">) {
  const inc: Incident = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: Date.now(), ...payload };
  incidents.push(inc);
  return inc;
}
