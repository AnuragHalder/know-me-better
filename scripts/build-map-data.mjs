#!/usr/bin/env node
/**
 * Builds the map data the app ships in public/maps/:
 *   india.json   country shapes for the India view (India's official boundaries)
 *   world.json   country shapes for the world view
 *   places.json  searchable places: Indian towns (15k+ people) and world cities
 *
 * Sources (download once, not committed):
 *   Natural Earth 1:10m admin-0 countries, India point of view (public domain):
 *     https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries_ind.geojson
 *   GeoNames cities via the all-the-cities npm package (data CC BY 4.0, GeoNames):
 *     npm pack all-the-cities@3.1.0, then npm install pbf@3 inside it
 *
 * Usage: node scripts/build-map-data.mjs <countries_ind.geojson> <all-the-cities dir>
 *
 * The India view uses the India point-of-view file so Jammu & Kashmir, Ladakh and
 * Arunachal Pradesh are shown as in the Survey of India's maps. Every Indian
 * island (Andaman & Nicobar, Lakshadweep) is kept, however small.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const [countriesPath, citiesDir] = process.argv.slice(2);
if (!countriesPath || !citiesDir) {
  console.error(
    "Usage: node scripts/build-map-data.mjs <countries_ind.geojson> <all-the-cities dir>",
  );
  process.exit(1);
}

const OUT = join(process.cwd(), "public", "maps");
mkdirSync(OUT, { recursive: true });

// Must match VIEWS in src/lib/map/projection.ts.
const VIEWS = {
  india: { bbox: [60, 2, 104, 40], tolerance: 0.02, scale: 100, minArea: 0.02 },
  world: { bbox: [-180, -58, 180, 84], tolerance: 0.25, scale: 10, minArea: 1.5 },
};

/**
 * Douglas–Peucker on a closed ring of [lon, lat]. A ring starts and ends at the
 * same point, so split it at the point farthest from the start and simplify the
 * two halves; otherwise every distance is measured to a zero-length line.
 */
function simplify(ring, tol) {
  if (ring.length <= 4) return ring;
  const [x0, y0] = ring[0];
  let far = 1;
  for (let i = 1; i < ring.length - 1; i++) {
    if (
      Math.hypot(ring[i][0] - x0, ring[i][1] - y0) >
      Math.hypot(ring[far][0] - x0, ring[far][1] - y0)
    )
      far = i;
  }
  const a = simplifyLine(ring.slice(0, far + 1), tol);
  const b = simplifyLine(ring.slice(far), tol);
  return [...a, ...b.slice(1)];
}

function simplifyLine(points, tol) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-12;
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i];
      const d = Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol && idx !== -1) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function ringArea(ring) {
  let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(s / 2);
}

function inBox(ring, [w, s, e, n]) {
  return ring.some(([x, y]) => x >= w - 2 && x <= e + 2 && y >= s - 2 && y <= n + 2);
}

const countries = JSON.parse(readFileSync(countriesPath, "utf8"));

for (const [name, view] of Object.entries(VIEWS)) {
  const shapes = [];
  let points = 0;
  for (const f of countries.features) {
    const code = f.properties.ADM0_A3;
    const isIndia = code === "IND";
    const polys =
      f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates];
    const rings = [];
    for (const poly of polys) {
      const outer = poly[0];
      if (!inBox(outer, view.bbox)) continue;
      if (!isIndia && ringArea(outer) < view.minArea) continue;
      let ring = simplify(outer, view.tolerance);
      // Keep tiny islands as at least a small triangle so they still show.
      if (ring.length < 4)
        ring =
          outer.length > 3
            ? [
                outer[0],
                outer[Math.floor(outer.length / 3)],
                outer[Math.floor((2 * outer.length) / 3)],
                outer[0],
              ]
            : outer;
      rings.push(
        ring.flatMap(([x, y]) => [Math.round(x * view.scale), Math.round(y * view.scale)]),
      );
      points += ring.length;
    }
    if (rings.length) shapes.push({ c: code, r: rings });
  }
  // India last, so it draws on top of its neighbours.
  shapes.sort((a, b) => (a.c === "IND") - (b.c === "IND"));
  writeFileSync(join(OUT, `${name}.json`), JSON.stringify({ scale: view.scale, shapes }));
  console.log(`${name}: ${shapes.length} countries, ${points} points`);
}

// Places: [name, lat×100, lon×100, population (thousands), country code]
const require = createRequire(join(citiesDir, "index.js"));
const cities = require(join(citiesDir, "index.js"));
const places = cities
  .filter(
    (c) =>
      (c.country === "IN" && c.population >= 15000) ||
      (c.country !== "IN" && (c.population >= 750000 || c.featureCode === "PPLC")),
  )
  .sort((a, b) => b.population - a.population)
  .map((c) => [
    // Plain spellings ("Visakhapatnam", not "Visākhapatnam"), as people type them.
    c.name.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    Math.round(c.loc.coordinates[1] * 100),
    Math.round(c.loc.coordinates[0] * 100),
    Math.round(c.population / 1000),
    c.country,
  ]);
writeFileSync(join(OUT, "places.json"), JSON.stringify(places));
console.log(`places: ${places.length} (${places.filter((p) => p[4] === "IN").length} in India)`);
