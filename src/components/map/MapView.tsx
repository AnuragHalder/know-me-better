"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { labelsFor, loadPaths, loadPlaces, type CountryPath } from "@/lib/map/data";
import { projection, VIEWS, type MapScope, type Place } from "@/lib/map/geo";

export interface MapMark {
  lat: number;
  lng: number;
  /** guess = the player's pin, answer = the real place, friend = someone else's pin. */
  tone: "guess" | "answer" | "friend" | "best";
  label?: string;
}

interface MapViewProps {
  scope: MapScope;
  marks?: MapMark[];
  /** A ring this many km around a point (how far off a guess was). */
  ring?: { lat: number; lng: number; km: number };
  /** Dashed lines between points, e.g. guess → answer. */
  lines?: [[number, number], [number, number]][];
  /** Tapping (or Enter on the keyboard) drops a pin here. */
  onPick?: (lat: number, lng: number) => void;
  /** Open zoomed to fit these points instead of the whole view. */
  fit?: [number, number][];
  label: string;
  className?: string;
}

type Box = { x: number; y: number; w: number; h: number };

const TAP_SLOP_PX = 8;

/**
 * A pannable, zoomable map drawn from Natural Earth data (India's official
 * boundaries). Tap to pick, drag to pan, pinch / wheel / buttons to zoom; with the
 * keyboard, arrows pan, + and - zoom and Enter picks the centre.
 */
export function MapView({
  scope,
  marks = [],
  ring,
  lines = [],
  onPick,
  fit,
  label,
  className,
}: MapViewProps) {
  const proj = useMemo(() => projection(scope), [scope]);
  const [paths, setPaths] = useState<CountryPath[] | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [failed, setFailed] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 342, h: 300 });

  const startBox = useMemo((): Box => {
    let [w, s, e, n] = VIEWS[scope].start;
    if (fit && fit.length) {
      const lats = fit.map((p) => p[0]);
      const lngs = fit.map((p) => p[1]);
      const padLat = Math.max(2.5, (Math.max(...lats) - Math.min(...lats)) * 0.35);
      const padLng = Math.max(2.5, (Math.max(...lngs) - Math.min(...lngs)) * 0.35);
      [w, s, e, n] = [
        Math.min(...lngs) - padLng,
        Math.min(...lats) - padLat,
        Math.max(...lngs) + padLng,
        Math.max(...lats) + padLat,
      ];
    }
    const [x1, y1] = proj.project(w, n);
    const [x2, y2] = proj.project(e, s);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, proj, JSON.stringify(fit)]);

  const [box, setBox] = useState<Box>(startBox);

  useEffect(() => {
    let live = true;
    loadPaths(scope).then(
      (p) => live && setPaths(p),
      () => live && setFailed(true),
    );
    loadPlaces().then(
      (p) => live && setPlaces(p),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [scope]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fit the start box to the element's shape, centred.
  useEffect(() => {
    const aspect = size.h / size.w;
    const b = startBox;
    const w = Math.max(b.w, b.h / aspect);
    const h = w * aspect;
    setBox({ x: b.x + b.w / 2 - w / 2, y: b.y + b.h / 2 - h / 2, w, h });
  }, [startBox, size.w, size.h]);

  const clamp = useCallback(
    (b: Box): Box => {
      const maxW = proj.width * 1.15;
      const minW = scope === "india" ? 60 : 30;
      const w = Math.min(maxW, Math.max(minW, b.w));
      const h = (w * size.h) / size.w;
      const cx = Math.min(proj.width, Math.max(0, b.x + b.w / 2));
      const cy = Math.min(proj.height, Math.max(0, b.y + b.h / 2));
      return { x: cx - w / 2, y: cy - h / 2, w, h };
    },
    [proj, scope, size.w, size.h],
  );

  const zoom = useCallback(
    (factor: number, cx?: number, cy?: number) =>
      setBox((b) => {
        const fx = cx ?? b.x + b.w / 2;
        const fy = cy ?? b.y + b.h / 2;
        const w = b.w * factor;
        const h = b.h * factor;
        return clamp({ x: fx - (fx - b.x) * factor, y: fy - (fy - b.y) * factor, w, h });
      }),
    [clamp],
  );

  // Pointer handling: drag pans, two pointers pinch, a short tap picks.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: number; pinch: number | null }>({ moved: 0, pinch: null });

  const unitsPerPx = box.w / size.w;
  const toMap = (clientX: number, clientY: number) => {
    const r = wrap.current!.getBoundingClientRect();
    return {
      x: box.x + (clientX - r.left) * unitsPerPx,
      y: box.y + (clientY - r.top) * unitsPerPx,
    };
  };

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) gesture.current = { moved: 0, pinch: null };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      gesture.current.moved = TAP_SLOP_PX + 1;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && gesture.current.pinch) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = toMap((a.x + b.x) / 2, (a.y + b.y) / 2);
      zoom(gesture.current.pinch / dist, mid.x, mid.y);
      gesture.current.pinch = dist;
      return;
    }
    gesture.current.moved += Math.abs(dx) + Math.abs(dy);
    if (gesture.current.moved > TAP_SLOP_PX) {
      setBox((bx) => clamp({ ...bx, x: bx.x - dx * unitsPerPx, y: bx.y - dy * unitsPerPx }));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const wasTap = pointers.current.size === 1 && gesture.current.moved <= TAP_SLOP_PX;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current.pinch = null;
    if (wasTap && onPick) {
      const p = toMap(e.clientX, e.clientY);
      const [lng, lat] = proj.invert(p.x, p.y);
      onPick(lat, lng);
    }
  }

  function onWheel(e: React.WheelEvent) {
    const p = toMap(e.clientX, e.clientY);
    zoom(e.deltaY > 0 ? 1.2 : 1 / 1.2, p.x, p.y);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const step = box.w * 0.15;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (moves[e.key]) {
      e.preventDefault();
      const [mx, my] = moves[e.key];
      setBox((b) => clamp({ ...b, x: b.x + mx, y: b.y + my }));
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      zoom(1 / 1.5);
    } else if (e.key === "-") {
      e.preventDefault();
      zoom(1.5);
    } else if (e.key === "Enter" && onPick) {
      e.preventDefault();
      const [lng, lat] = proj.invert(box.x + box.w / 2, box.y + box.h / 2);
      onPick(lat, lng);
    }
  }

  const markPoints = useMemo(() => marks.map((m) => proj.project(m.lng, m.lat)), [marks, proj]);
  const labels = useMemo(
    () =>
      places.length ? labelsFor(places, scope, proj, box, size.w / box.w, 14, 64, markPoints) : [],
    [places, scope, proj, box, size.w, markPoints],
  );

  const s = unitsPerPx; // map units per screen pixel, for constant-size marks
  const ringShape = ring
    ? (() => {
        const [cx, cy] = proj.project(ring.lng, ring.lat);
        const dLat = ring.km / 111.32;
        const dLng = ring.km / (111.32 * Math.max(0.05, Math.cos((ring.lat * Math.PI) / 180)));
        const [ex] = proj.project(ring.lng + dLng, ring.lat);
        const [, ey] = proj.project(ring.lng, ring.lat - dLat);
        return { cx, cy, rx: ex - cx, ry: ey - cy };
      })()
    : null;

  return (
    <div
      ref={wrap}
      className={cn(
        "relative touch-none overflow-hidden rounded-2xl bg-sea select-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-pink",
        onPick ? "cursor-crosshair" : "cursor-grab",
        className,
      )}
      role="application"
      aria-label={`${label}. ${onPick ? "Tap to drop a pin, or use arrow keys and Enter." : "Drag to move, pinch to zoom."}`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <svg
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        className="block size-full"
        aria-hidden="true"
      >
        {paths?.map((p) => (
          <path
            key={p.code}
            d={p.d}
            className={p.code === "IND" ? "fill-land-hi" : "fill-land"}
            stroke="var(--border-map)"
            strokeWidth={0.9 * s}
            strokeLinejoin="round"
          />
        ))}
        {labels.map(({ place, x, y }) => (
          <g key={`${place.name}-${place.lat}`}>
            <circle cx={x} cy={y} r={2.6 * s} className="fill-ink-soft" />
            <text
              x={x + 5 * s}
              y={y + 3.8 * s}
              fontSize={11 * s}
              className="fill-ink-soft"
              style={{ paintOrder: "stroke" }}
              stroke="var(--sea)"
              strokeWidth={0}
            >
              {place.name}
            </text>
          </g>
        ))}
        {ringShape && (
          <ellipse
            cx={ringShape.cx}
            cy={ringShape.cy}
            rx={ringShape.rx}
            ry={ringShape.ry}
            className="fill-hi/40 stroke-ink"
            strokeWidth={2 * s}
            strokeDasharray={`${6 * s} ${5 * s}`}
          />
        )}
        {lines.map(([a, b], i) => {
          const [x1, y1] = proj.project(a[1], a[0]);
          const [x2, y2] = proj.project(b[1], b[0]);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              className="stroke-ink"
              strokeWidth={2 * s}
              strokeDasharray={`${5 * s} ${4 * s}`}
            />
          );
        })}
        {marks.map((m, i) => {
          const [x, y] = proj.project(m.lng, m.lat);
          const big = m.tone !== "friend";
          const k = s * (big ? 1 : 0.72);
          return (
            <g key={i} transform={`translate(${x} ${y}) scale(${k})`}>
              <path
                d="M0 0s12-12.5 12-22.5A12 12 0 0 0-12-22.5C-12-12.5 0 0 0 0z"
                className={
                  m.tone === "answer"
                    ? "fill-pink"
                    : m.tone === "best"
                      ? "fill-ink stroke-hi"
                      : "fill-ink"
                }
                stroke={m.tone === "best" ? undefined : "var(--sheet)"}
                strokeWidth={m.tone === "best" ? 4 : 2}
              />
              <circle
                cy={-22.5}
                r={4.5}
                className={m.tone === "answer" ? "fill-sheet" : "fill-hi"}
              />
              {m.label && (
                <text
                  x={14}
                  y={-24}
                  fontSize={12}
                  fontWeight={700}
                  className="fill-ink"
                  stroke="var(--sheet)"
                  strokeWidth={3.5}
                  style={{ paintOrder: "stroke" }}
                >
                  {m.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {!paths && (
        <p className="absolute inset-0 grid place-items-center text-sm text-ink-soft">
          {failed ? "The map didn't load. Check your connection and reload." : "Loading map…"}
        </p>
      )}

      <div className="absolute top-2 right-2 flex flex-col gap-1.5">
        <button
          type="button"
          aria-label="Zoom in"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => zoom(1 / 1.6)}
          className="size-11 rounded-xl bg-sheet text-xl font-bold text-ink shadow-sheet"
        >
          +
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => zoom(1.6)}
          className="size-11 rounded-xl bg-sheet text-xl font-bold text-ink shadow-sheet"
        >
          −
        </button>
      </div>
      <span className="pointer-events-none absolute right-2 bottom-1.5 text-[10px] text-ink-soft">
        Natural Earth · India&apos;s official boundaries
      </span>
    </div>
  );
}
