import { describe, expect, it } from "vitest";
import { bands, boundaries, type BoundaryPoint } from "../src/physics/boundaries";
import { scan, type EventKind } from "../src/physics/events";
import { fieldAreas, polygonOf, type FieldArea } from "../src/physics/fieldAreas";
import type { Params } from "../src/physics/gibbs";
import type { PlotWindow } from "../src/physics/plotWindow";
import { PANELS, PRESETS, preset, type PresetId } from "../src/physics/presets";
import { phasesKind, REGION_KINDS, regionRaster, rowHulls } from "../src/ui/regions";

// The field areas of the figure export (plan §9 phase 21): polygons that tile the window, whose
// kinds match the screen's raster, with edges at the exact events.

const SYSTEMS: [string, { params: Params; window: PlotWindow }][] = [
  ...PRESETS.map((p) => [p.id, p] as [string, typeof p]),
  ...Object.entries(PANELS).map(([id, s]) => [`(${id})`, s] as [string, typeof s]),
];

/** The sample grid: the centres of a COLS × ROWS raster, as `regionRaster` samples it. */
const COLS = 200;
const ROWS = 100;
/** The plot area the "1 px from a boundary" is measured in, CSS px. */
const SIZE = { width: 720, height: 360 };

/** The shoelace area of a polygon in (X, T); positive for every area (they wind one way). */
function signedArea(ring: readonly BoundaryPoint[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    s += a.X * b.T - b.X * a.T;
  }
  // Up the left edge and down the right: clockwise with T upwards.
  return -s / 2;
}

/** The X at which each edge of `ring` crosses the row at T (even–odd, half-open in T). */
function crossings(ring: readonly BoundaryPoint[], T: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    if (a.T <= T !== b.T <= T) out.push(a.X + ((T - a.T) / (b.T - a.T)) * (b.X - a.X));
  }
  return out;
}

/** The distance in px of SIZE from (X, T) to the nearest edge of any of `rings`. */
function distanceToEdges(rings: BoundaryPoint[][], X: number, T: number, window: PlotWindow) {
  const span = window.Tmax - window.Tmin;
  const px = (p: BoundaryPoint) => [p.X * SIZE.width, (p.T / span) * SIZE.height] as const;
  const [x, y] = px({ X, T });
  let best = Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const [ax, ay] = px(ring[i]!);
      const [bx, by] = px(ring[(i + 1) % ring.length]!);
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
      best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
  }
  return best;
}

const areasOf = ({ params, window }: { params: Params; window: PlotWindow }) =>
  fieldAreas(bands(params, window));

describe("bands", () => {
  it.each(SYSTEMS)("%s: flattened, they are the boundaries", (_, { params, window }) => {
    const scanned = scan(params, window);
    const flat = bands(params, window, scanned).flatMap((b) =>
      b.ties.flatMap((t) => [
        { phases: t.phases, side: 0, points: t.left },
        { phases: t.phases, side: 1, points: t.right },
      ]),
    );
    expect(flat).toEqual(boundaries(params, window, scanned));
  });
});

describe("fieldAreas", () => {
  it.each(SYSTEMS)("%s: the areas tile the window", (_, system) => {
    const { window } = system;
    const areas = areasOf(system);
    const rings = areas.map(polygonOf);
    const span = window.Tmax - window.Tmin;
    const sum = rings.reduce((s, r) => s + signedArea(r), 0);
    expect(Math.abs(sum - span) / span).toBeLessThan(1e-9);
    for (const r of rings) expect(signedArea(r)).toBeGreaterThan(-1e-9);

    const hulls = rowHulls(system.params, window, ROWS);
    const raster = regionRaster(hulls, COLS);
    for (let r = 0; r < ROWS; r++) {
      const T = window.Tmax - ((r + 0.5) / ROWS) * span;
      const cross = rings.map((ring) => crossings(ring, T));
      for (let c = 0; c < COLS; c++) {
        const X = (c + 0.5) / COLS;
        const inside = cross
          .map((xs, k) => [k, xs.filter((x) => x < X).length % 2 === 1] as const)
          .filter(([, inside]) => inside)
          .map(([k]) => k);
        expect(inside, `(${X}, ${T}) in one area`).toHaveLength(1);
        const kind = phasesKind(areas[inside[0]!]!.phases);
        const expected = REGION_KINDS[raster[r * COLS + c]!];
        if (kind !== expected) {
          expect(
            distanceToEdges(rings, X, T, window),
            `${kind} against the raster's ${expected} at (${X}, ${T})`,
          ).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

/** The event of `id` of `kind`, the highest such (k's liquid dome over its solid one). */
function eventOf(id: PresetId, kind: EventKind) {
  const { params, window } = preset(id);
  const e = scan(params, window)
    .events.filter((ev) => ev.kind === kind)
    .at(-1);
  if (!e) throw new Error(`${id} has no ${kind}`);
  return e;
}

/** The two ends of each area's edges in the row at T, if it has one. */
function endsAt(areas: readonly FieldArea[], T: number) {
  const out: { area: FieldArea; X: [number, number] }[] = [];
  for (const area of areas) {
    for (const k of [0, -1] as const) {
      const l = area.left.at(k)!;
      const r = area.right.at(k)!;
      if (l.T === T && r.T === T) out.push({ area, X: [l.X, r.X] });
    }
  }
  return out;
}

describe("exact edges", () => {
  it("(h)'s eutectic: the horizontal edges lie at its T and end at its three X", () => {
    const e = eventOf("h", "eutectic");
    expect(e.T).toBeCloseTo(634.2, 1);
    const ends = endsAt(areasOf(preset("h")), e.T).flatMap((a) => a.X);
    const allowed = [0, 1, ...e.points.map((p) => p.X)];
    for (const X of ends)
      expect(Math.min(...allowed.map((a) => Math.abs(a - X)))).toBeLessThan(1e-9);
    for (const p of e.points) expect(ends.some((X) => Math.abs(X - p.X) < 1e-9)).toBe(true);
  });

  it.each([
    ["m", "minimum"],
    ["o", "maximum"],
    ["c1", "maximum"],
    ["k", "critical"],
  ] as const)("%s's %s: the vanishing field closes at the event's point", (id, kind) => {
    const e = eventOf(id, kind);
    if (kind === "critical") expect(e.T).toBeCloseTo(1804.1, 1);
    const X = e.points[0]!.X;
    const closed = endsAt(areasOf(preset(id)), e.T).filter(
      ({ X: [l, r] }) => Math.abs(l - X) < 1e-9 && Math.abs(r - X) < 1e-9,
    );
    expect(closed.length).toBeGreaterThan(0);
  });

  it("c1's line compound has no γ area; c3's compound with a range has one", () => {
    expect(areasOf(preset("c1")).some((a) => phasesKind(a.phases) === "C")).toBe(false);
    expect(areasOf(preset("c3")).some((a) => phasesKind(a.phases) === "C")).toBe(true);
  });

  it("neighbours share their boundary polyline", () => {
    const areas = areasOf(preset("h"));
    for (let k = 0; k + 1 < areas.length; k++) {
      const [a, b] = [areas[k]!, areas[k + 1]!];
      if (a.left[0]!.T === b.left[0]!.T) expect(b.left).toBe(a.right);
    }
  });
});
