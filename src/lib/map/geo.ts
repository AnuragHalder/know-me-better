/**
 * Map maths shared by the browser and tests. The database does its own distance
 * check (answer_pin); this mirrors it for display only.
 */
export type MapScope = "india" | "world";

export interface View {
  /** [west, south, east, north] of the drawable area, degrees. */
  bbox: [number, number, number, number];
  /** Latitude whose scale is kept true (equirectangular projection). */
  standardLat: number;
  /** Area shown when the map first opens. */
  start: [number, number, number, number];
}

/** Must match VIEWS in scripts/build-map-data.mjs. */
export const VIEWS: Record<MapScope, View> = {
  india: { bbox: [60, 2, 104, 40], standardLat: 22, start: [67, 5.5, 98, 37.5] },
  world: { bbox: [-180, -58, 180, 84], standardLat: 15, start: [-180, -58, 180, 84] },
};

/** Distance under which a pin counts as right, and a bullseye. */
export const RIGHT_KM: Record<MapScope, number> = { india: 100, world: 500 };
export const BULLSEYE_KM = 25;

export const MAP_WIDTH = 1000;

export interface Projection {
  width: number;
  height: number;
  project(lon: number, lat: number): [number, number];
  invert(x: number, y: number): [number, number];
}

/** Equirectangular projection of a view into a MAP_WIDTH-wide coordinate space. */
export function projection(scope: MapScope): Projection {
  const { bbox, standardLat } = VIEWS[scope];
  const [w, s, e, n] = bbox;
  const cos = Math.cos((standardLat * Math.PI) / 180);
  const k = MAP_WIDTH / ((e - w) * cos);
  return {
    width: MAP_WIDTH,
    height: (n - s) * k,
    project: (lon, lat) => [(lon - w) * cos * k, (n - lat) * k],
    invert: (x, y) => [x / (cos * k) + w, n - y / k],
  };
}

/** Great-circle distance in km. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 +
    Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function formatKm(km: number): string {
  if (km < 1) return "under 1 km";
  return `${Math.round(km).toLocaleString("en-IN")} km`;
}

/** A searchable place: [name, lat×100, lon×100, population in thousands, country]. */
export type PlaceRow = [string, number, number, number, string];

export interface Place {
  name: string;
  lat: number;
  lon: number;
  pop: number;
  country: string;
}

export function toPlace([name, lat, lon, pop, country]: PlaceRow): Place {
  return { name, lat: lat / 100, lon: lon / 100, pop, country };
}

/** Places whose name starts with (then contains) the query, biggest first. */
export function searchPlaces(places: readonly Place[], query: string, limit = 6): Place[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const starts = places.filter((p) => p.name.toLowerCase().startsWith(q));
  const contains = places.filter(
    (p) => !p.name.toLowerCase().startsWith(q) && p.name.toLowerCase().includes(q),
  );
  return [...starts, ...contains].slice(0, limit);
}

/** The nearest place of at least `minPop` thousand people. */
export function nearestPlace(
  places: readonly Place[],
  lat: number,
  lon: number,
  minPop = 0,
): Place | null {
  let best: Place | null = null;
  let bestD = Infinity;
  for (const p of places) {
    if (p.pop < minPop) continue;
    const d = distanceKm(lat, lon, p.lat, p.lon);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/**
 * A creator's tapped answer, rounded to about 1 km so it can never pin a home.
 * Search results are towns already; taps are labelled "Near <town>".
 */
export function roundCoord(v: number): number {
  return Math.round(v * 100) / 100;
}

/** Is a point inside a view's drawable area? */
export function inView(scope: MapScope, lat: number, lon: number): boolean {
  const [w, s, e, n] = VIEWS[scope].bbox;
  return lon >= w && lon <= e && lat >= s && lat <= n;
}
