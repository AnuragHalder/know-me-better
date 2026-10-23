import {
  projection,
  toPlace,
  type MapScope,
  type Place,
  type PlaceRow,
  type Projection,
} from "./geo";

/** Country shapes as shipped in public/maps/<scope>.json. */
export interface ShapeFile {
  scale: number;
  shapes: { c: string; r: number[][] }[];
}

export interface CountryPath {
  code: string;
  d: string;
}

/** SVG path data for each country, projected into map units. */
export function buildPaths(file: ShapeFile, proj: Projection): CountryPath[] {
  return file.shapes.map((shape) => ({
    code: shape.c,
    d: shape.r
      .map((ring) => {
        let d = "";
        for (let i = 0; i < ring.length; i += 2) {
          const [x, y] = proj.project(ring[i] / file.scale, ring[i + 1] / file.scale);
          d += `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
        }
        return `${d}Z`;
      })
      .join(""),
  }));
}

const shapeCache = new Map<MapScope, Promise<CountryPath[]>>();
let placeCache: Promise<Place[]> | null = null;

/** Load (once) and project a view's country shapes. */
export function loadPaths(scope: MapScope): Promise<CountryPath[]> {
  let p = shapeCache.get(scope);
  if (!p) {
    p = fetch(`/maps/${scope}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`map ${scope}: ${r.status}`);
        return r.json() as Promise<ShapeFile>;
      })
      .then((file) => buildPaths(file, projection(scope)));
    p.catch(() => shapeCache.delete(scope));
    shapeCache.set(scope, p);
  }
  return p;
}

/** Load (once) the searchable places, biggest first. */
export function loadPlaces(): Promise<Place[]> {
  if (!placeCache) {
    placeCache = fetch("/maps/places.json")
      .then((r) => {
        if (!r.ok) throw new Error(`places: ${r.status}`);
        return r.json() as Promise<PlaceRow[]>;
      })
      .then((rows) => rows.map(toPlace));
    placeCache.catch(() => {
      placeCache = null;
    });
  }
  return placeCache;
}

/** Places to label in the visible area: biggest first, never crowded. */
export function labelsFor(
  places: readonly Place[],
  scope: MapScope,
  proj: Projection,
  view: { x: number; y: number; w: number; h: number },
  pxPerUnit: number,
  max = 14,
  minGapPx = 64,
  /** Map points (e.g. pins) that labels should stay clear of. */
  avoid: readonly [number, number][] = [],
): { place: Place; x: number; y: number }[] {
  const out: { place: Place; x: number; y: number }[] = [];
  // World view: only big cities, so the map isn't labelled with tiny capitals.
  const minPop = scope === "world" ? 3000 : 0;
  for (const place of places) {
    if (scope === "india" && place.country !== "IN") continue;
    if (place.pop < minPop) continue;
    const [x, y] = proj.project(place.lon, place.lat);
    if (avoid.some(([ax, ay]) => Math.hypot((ax - x) * pxPerUnit, (ay - y) * pxPerUnit) < 28))
      continue;
    if (x < view.x || x > view.x + view.w || y < view.y || y > view.y + view.h) continue;
    const crowded = out.some(
      (o) => Math.hypot((o.x - x) * pxPerUnit, (o.y - y) * pxPerUnit) < minGapPx,
    );
    if (crowded) continue;
    out.push({ place, x, y });
    if (out.length >= max) break;
  }
  return out;
}
