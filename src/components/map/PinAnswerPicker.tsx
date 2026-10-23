"use client";

import { useEffect, useState } from "react";
import { MapView } from "@/components/map/MapView";
import { loadPlaces } from "@/lib/map/data";
import {
  distanceKm,
  inView,
  nearestPlace,
  roundCoord,
  searchPlaces,
  type MapScope,
  type Place,
} from "@/lib/map/geo";
import type { PinAnswer } from "@/lib/quiz/build";

/** A tap this close to a town takes the town's name; further away it's "Near <town>". */
const SNAP_KM = 6;

interface PinAnswerPickerProps {
  id: string;
  scope: MapScope;
  value?: PinAnswer;
  onChange: (pin: PinAnswer) => void;
}

/** The creator answers a map question: search a town or tap the map. */
export function PinAnswerPicker({ id, scope, value, onChange }: PinAnswerPickerProps) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  // Zoom to a saved answer when the map first opens, not on every tap.
  const [startFit] = useState<[number, number][] | undefined>(
    value ? [[value.lat, value.lng]] : undefined,
  );

  useEffect(() => {
    loadPlaces().then(setPlaces, () => setNote("Search isn't available right now. Tap the map."));
  }, []);

  const pool = scope === "india" ? places.filter((p) => p.country === "IN") : places;
  const results = searchPlaces(pool, query, 5);

  function choose(place: Place) {
    onChange({ lat: roundCoord(place.lat), lng: roundCoord(place.lon), label: place.name });
    setQuery("");
    setNote("");
  }

  function tap(lat: number, lng: number) {
    if (!inView(scope, lat, lng)) {
      setNote(scope === "india" ? "Pick a place in India for this one." : "Tap on land.");
      return;
    }
    const near = nearestPlace(pool, lat, lng);
    const label = !near
      ? "Pinned place"
      : distanceKm(lat, lng, near.lat, near.lon) <= SNAP_KM
        ? near.name
        : `Near ${near.name}`;
    // Rounded to ~1 km: an answer can never point at someone's home.
    onChange({ lat: roundCoord(lat), lng: roundCoord(lng), label: label.slice(0, 60) });
    setNote("");
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative flex flex-col gap-1.5">
        <label
          htmlFor={`${id}-search`}
          className="text-xs font-bold tracking-widest text-ink-soft uppercase"
        >
          Your answer
        </label>
        <input
          id={`${id}-search`}
          type="search"
          autoComplete="off"
          placeholder={scope === "india" ? "Search a town or city" : "Search a city"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-12 rounded-xl border-2 border-line bg-sheet px-3.5 text-base text-ink placeholder:text-ink-soft/70"
        />
        {results.length > 0 && (
          <ul className="flex flex-col overflow-hidden rounded-xl border-2 border-line bg-sheet">
            {results.map((p) => (
              <li
                key={`${p.name}-${p.lat}-${p.lon}`}
                className="border-t border-line first:border-t-0"
              >
                <button
                  type="button"
                  onClick={() => choose(p)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 px-3.5 text-left text-ink"
                >
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-xs text-ink-soft">
                    {p.country === "IN" ? "India" : p.country}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <MapView
        scope={scope}
        label="Map for your answer"
        onPick={tap}
        fit={startFit}
        marks={
          value ? [{ lat: value.lat, lng: value.lng, tone: "answer", label: value.label }] : []
        }
        className="h-[280px]"
      />
      <p aria-live="polite" className="text-sm text-ink-soft">
        {note ||
          (value ? (
            <>
              Your answer: <b className="text-ink">{value.label}</b>. Friends get it right within{" "}
              {scope === "india" ? "100" : "500"} km.
            </>
          ) : (
            "Search above, or tap the map. Friends never see your pin, only how far off they were."
          ))}
      </p>
    </div>
  );
}
