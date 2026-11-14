// The figure export's field fills as SVG paths (plan §9 phase 21), in place of the screen's raster:
// each field area (physics/fieldAreas.ts) in plot-area px, its edges simplified by Douglas–Peucker.
// Each boundary polyline is mapped and simplified once, so the two fields along it share their
// vertices exactly, and each kind is one `<path>`, so that two fields of one kind that meet show
// no seam under the group's opacity.

import type { BoundaryPoint } from "../physics/boundaries";
import type { FieldArea } from "../physics/fieldAreas";
import type { PlotWindow } from "../physics/plotWindow";
import { xOf, yOf, type PlotSize } from "./geometry";
import { phasesKind, REGION_KINDS, type RegionKind } from "./regions";

/** How far a simplified edge may stray from the boundary, CSS px (§10.3 item 1). */
export const FIELD_TOLERANCE = 0.25;

/** A point in plot-area px. */
export type Px = [number, number];

/** The distance from p to the segment from a to b. */
function segmentDistance([x, y]: Px, [ax, ay]: Px, [bx, by]: Px): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/**
 * `points` simplified by Douglas–Peucker: a subset of them, the ends kept, such that every point
 * lies within `tolerance` of the simplified polyline.
 */
export function simplify(points: readonly Px[], tolerance = FIELD_TOLERANCE): Px[] {
  const n = points.length;
  if (n <= 2) return [...points];
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length > 0) {
    const [i, j] = stack.pop()!;
    let worst = -1;
    let far = 0;
    for (let k = i + 1; k < j; k++) {
      const d = segmentDistance(points[k]!, points[i]!, points[j]!);
      if (d > far) {
        far = d;
        worst = k;
      }
    }
    if (worst >= 0 && far > tolerance) {
      keep[worst] = 1;
      stack.push([i, worst], [worst, j]);
    }
  }
  return points.filter((_, k) => keep[k]);
}

/** A coordinate to one decimal, as an SVG path writes it. */
const round = (v: number) => Math.round(v * 10) / 10;

/**
 * A field area in plot-area px: its kind and its two edges, T increasing, simplified and rounded.
 * An edge two areas share is one array.
 */
export interface FieldRing {
  kind: RegionKind;
  left: Px[];
  right: Px[];
}

/**
 * Each area in plot-area px for a plot area of `size` over `window`, each edge simplified
 * (`simplify`) once for every area that has it and rounded to one decimal.
 */
export function fieldRings(
  areas: readonly FieldArea[],
  window: PlotWindow,
  size: PlotSize,
): FieldRing[] {
  const edges = new Map<readonly BoundaryPoint[], Px[]>();
  const edgeOf = (points: readonly BoundaryPoint[]): Px[] => {
    let px = edges.get(points);
    if (!px) {
      const mapped = points.map((p): Px => [xOf(p.X, size), yOf(p.T, window, size)]);
      px = simplify(mapped).map(([x, y]): Px => [round(x), round(y)]);
      edges.set(points, px);
    }
    return px;
  };
  return areas.map((area) => ({
    kind: phasesKind(area.phases),
    left: edgeOf(area.left),
    right: edgeOf(area.right),
  }));
}

/**
 * A ring as a closed subpath, up its left edge and down its right edge, a vertex that repeats the
 * one before it left out.
 */
function subpath({ left, right }: FieldRing): string {
  const points = [...left, ...[...right].reverse()];
  const kept = points.filter(
    (p, k) => k === 0 || p[0] !== points[k - 1]![0] || p[1] !== points[k - 1]![1],
  );
  const [first, ...rest] = kept.map(([x, y]) => `${x},${y}`);
  return rest.length === 0 ? "" : `M${first}L${rest.join(" ")}Z`;
}

/**
 * The fields as one path per kind present, in the order of REGION_KINDS, each field a subpath,
 * in plot-area px for a plot area of `size` over `window`.
 */
export function fieldPaths(
  areas: readonly FieldArea[],
  window: PlotWindow,
  size: PlotSize,
): { kind: RegionKind; d: string }[] {
  const byKind = new Map<RegionKind, string[]>();
  for (const ring of fieldRings(areas, window, size)) {
    const d = subpath(ring);
    if (!d) continue;
    const list = byKind.get(ring.kind) ?? [];
    list.push(d);
    byKind.set(ring.kind, list);
  }
  return REGION_KINDS.filter((kind) => byKind.has(kind)).map((kind) => ({
    kind,
    d: byKind.get(kind)!.join(""),
  }));
}
