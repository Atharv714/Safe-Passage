declare module "react-leaflet" {
  import * as React from "react";
  type Props = Record<string, unknown>;
  export const MapContainer: React.ComponentType<Props>;
  export const TileLayer: React.ComponentType<Props>;
  export const Marker: React.ComponentType<Props>;
  export const Popup: React.ComponentType<Props>;
  export const Polyline: React.ComponentType<Props>;
  export function useMapEvents(
    events: Record<string, (...args: unknown[]) => void>
  ): unknown;
}
declare module "leaflet" {
  export type LatLngExpression = [number, number] | { lat: number; lng: number };
  // Minimal icon factory typing for our usage
  export interface IconOptions {
    iconRetinaUrl?: string;
    iconUrl?: string;
    shadowUrl?: string;
    iconSize?: [number, number];
    iconAnchor?: [number, number];
    popupAnchor?: [number, number];
    shadowSize?: [number, number];
  }
  export interface Icon { options: IconOptions }
  export function icon(options: IconOptions): Icon;
}
declare module "@mapbox/polyline" {
  const polyline: { decode: (str: string, precision?: number) => [number, number][] };
  export default polyline;
}
