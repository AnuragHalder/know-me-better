import { describe, expect, it } from "vitest";
import { buildPaths, labelsFor } from "./data";
import { projection, toPlace } from "./geo";

describe("map data", () => {
  it("projects country rings into closed SVG paths", () => {
    const paths = buildPaths(
      { scale: 100, shapes: [{ c: "IND", r: [[7000, 2000, 8000, 2000, 8000, 3000, 7000, 2000]] }] },
      projection("india"),
    );
    expect(paths[0].code).toBe("IND");
    expect(paths[0].d).toMatch(/^M[\d.]+,[\d.]+L.*Z$/);
  });

  it("labels the biggest visible places without crowding", () => {
    const proj = projection("india");
    const places = [
      toPlace(["Kolkata", 2257, 8836, 4631, "IN"]),
      toPlace(["Howrah", 2259, 8826, 1077, "IN"]),
      toPlace(["Patna", 2561, 8514, 1599, "IN"]),
      toPlace(["Dhaka", 2371, 9041, 8000, "BD"]),
    ];
    const view = { x: 0, y: 0, w: proj.width, h: proj.height };
    const labels = labelsFor(places, "india", proj, view, 1);
    expect(labelsFor(places, "india", proj, view, 0.2).map((l) => l.place.name)).toEqual([
      "Kolkata",
    ]);
    expect(labels.map((l) => l.place.name)).toEqual(["Kolkata", "Patna"]);
  });
});
