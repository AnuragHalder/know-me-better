"use client";

import { MapView } from "@/components/map/MapView";
import type { MapScope } from "@/lib/map/geo";

interface PinPlayProps {
  scope: MapScope;
  /** Where the friend has dropped their pin, before locking it in. */
  pending: { lat: number; lng: number } | null;
  /** After locking in: their pin and how far off it was (never the real place). */
  reveal: { lat: number; lng: number; km: number } | null;
  onPick: (lat: number, lng: number) => void;
}

/** A friend answers a map question by dropping a pin. */
export function PinPlay({ scope, pending, reveal, onPick }: PinPlayProps) {
  const pin = reveal ?? pending;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink-soft">
        {reveal
          ? "The ring shows how far off you were."
          : "Tap the map to drop your pin. Pinch or use + and − to zoom."}
      </p>
      <MapView
        scope={scope}
        label="Map: drop your pin"
        onPick={reveal ? undefined : onPick}
        ring={reveal ? { lat: reveal.lat, lng: reveal.lng, km: reveal.km } : undefined}
        marks={pin ? [{ lat: pin.lat, lng: pin.lng, tone: "guess" }] : []}
        className="h-[360px]"
      />
    </div>
  );
}
