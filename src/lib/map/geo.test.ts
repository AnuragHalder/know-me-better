import { describe, expect, it } from "vitest";
import {
  distanceKm,
  formatKm,
  inView,
  nearestPlace,
  projection,
  roundCoord,
  searchPlaces,
  toPlace,
} from "./geo";

const places = [
  toPlace(["Kolkata", 2257, 8836, 4631, "IN"]),
  toPlace(["Kalyani", 2298, 8848, 100, "IN"]),
  toPlace(["Patna", 2561, 8514, 1599, "IN"]),
  toPlace(["Pune", 1852, 7386, 2935, "IN"]),
];

describe("geo", () => {
  it("measures great-circle distance", () => {
    expect(distanceKm(22.57, 88.36, 25.61, 85.14)).toBeGreaterThan(460);
    expect(distanceKm(22.57, 88.36, 25.61, 85.14)).toBeLessThan(480);
    expect(distanceKm(10, 10, 10, 10)).toBe(0);
  });

  it("projects and inverts back to the same place", () => {
    for (const scope of ["india", "world"] as const) {
      const p = projection(scope);
      const [x, y] = p.project(88.36, 22.57);
      const [lon, lat] = p.invert(x, y);
      expect(lon).toBeCloseTo(88.36, 6);
      expect(lat).toBeCloseTo(22.57, 6);
      expect(p.height).toBeGreaterThan(0);
    }
  });

  it("searches by prefix first, biggest first", () => {
    expect(searchPlaces(places, "k").length).toBe(0);
    expect(searchPlaces(places, "ka").map((p) => p.name)).toEqual(["Kalyani", "Kolkata"]);
    expect(searchPlaces(places, "pa").map((p) => p.name)).toEqual(["Patna"]);
    expect(searchPlaces(places, "un").map((p) => p.name)).toEqual(["Pune"]);
  });

  it("finds the nearest sizeable town", () => {
    expect(nearestPlace(places, 22.9, 88.4)?.name).toBe("Kalyani");
    expect(nearestPlace(places, 22.9, 88.4, 1000)?.name).toBe("Kolkata");
  });

  it("formats and rounds", () => {
    expect(formatKm(1305.4)).toBe("1,305 km");
    expect(formatKm(0.4)).toBe("under 1 km");
    expect(roundCoord(22.57261)).toBe(22.57);
    expect(inView("india", 22.5, 88.3)).toBe(true);
    expect(inView("india", 51.5, -0.1)).toBe(false);
  });
});
