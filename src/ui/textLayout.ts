// Placing text on the plots, adapted from pTerrain's ui/labels.ts: labels spread apart along a
// line (the bold X_B values, the lever's arm labels), and each invariant's temperature beside its
// line, clear of the boundaries and the field labels (plan §4 item 1).

import type { PlotSize } from "./geometry";

/**
 * Centres for labels of the given `widths`, wanted at `xs`, so that neighbours keep at least
 * `gap` between them. Labels that would come too close are moved apart as a group, each by the
 * same amount where they are the same width (least squares), and a group is then shifted as a
 * whole to stay inside `bounds`. The result is in the order of `xs`. Copied from pTerrain.
 */
export function spreadApart(
  xs: readonly number[],
  widths: readonly number[],
  gap = 0,
  bounds: readonly [number, number] = [-Infinity, Infinity],
): number[] {
  const order = xs.map((_, k) => k).sort((a, b) => xs[a]! - xs[b]!);
  // Each group is laid out from its left edge: member k's centre is left + offsets[k].
  interface Group {
    members: number[];
    offsets: number[];
    width: number;
    left: number;
  }
  const fit = (g: Group) => {
    g.left = mean(g.members.map((k, m) => xs[k]! - g.offsets[m]!));
  };
  const groups: Group[] = [];
  for (const k of order) {
    const w = widths[k]!;
    let g: Group = { members: [k], offsets: [w / 2], width: w, left: 0 };
    fit(g);
    for (
      let prev = groups.at(-1);
      prev && prev.left + prev.width + gap > g.left;
      prev = groups.at(-1)
    ) {
      groups.pop();
      const shift = prev.width + gap;
      g = {
        members: [...prev.members, ...g.members],
        offsets: [...prev.offsets, ...g.offsets.map((o) => o + shift)],
        width: shift + g.width,
        left: 0,
      };
      fit(g);
    }
    groups.push(g);
  }
  const out = new Array<number>(xs.length);
  for (const g of groups) {
    const left = Math.max(bounds[0], Math.min(bounds[1] - g.width, g.left));
    g.members.forEach((k, m) => (out[k] = left + g.offsets[m]!));
  }
  return out;
}

export function mean(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** A box on the plot, CSS px: [left, top, right, bottom]. */
export type Box = [number, number, number, number];

/** An invariant temperature's text box around its baseline, CSS px (11 px text). */
const INVARIANT_T = { ascent: 8, descent: 3, gap: 3, inset: 3 } as const;
/**
 * The cut's knob sits this far into the plot from its right edge, CSS px, and covers a text
 * there when the cut is snapped to the invariant.
 */
export const KNOB_CLEARANCE = 14;

/** Where an invariant's temperature goes: its text anchor at (x, y), the baseline. */
export interface TextSpot {
  x: number;
  y: number;
  anchor: "start" | "end";
}

/**
 * Where the temperature of an invariant line ending at plot-area (x, y) goes (plan §4 item 1),
 * for a text `width` px wide: the first of above-left, below-left, above-right and below-right
 * of the line's right end that stays inside the plot, clear of the cut's knob at the right
 * edge, and crosses none of the polylines `lines` (plot-area px: the diagram passes the stable
 * boundaries and the field labels' outlines); above and to the left when none does.
 */
export function placeInvariantT(
  x: number,
  y: number,
  width: number,
  size: PlotSize,
  lines: readonly (readonly [number, number][])[],
): TextSpot {
  const { ascent, descent, gap, inset } = INVARIANT_T;
  const right = size.width - KNOB_CLEARANCE;
  const above = y - gap - descent;
  const below = y + gap + ascent;
  const spots: TextSpot[] = [
    { x: x - inset, y: above, anchor: "end" },
    { x: x - inset, y: below, anchor: "end" },
    { x: x + inset, y: above, anchor: "start" },
    { x: x + inset, y: below, anchor: "start" },
  ];
  const box = (s: TextSpot): Box => {
    const left = s.anchor === "end" ? s.x - width : s.x;
    return [left, s.y - ascent, left + width, s.y + descent];
  };
  const fits = (b: Box) => b[0] >= 0 && b[2] <= right && b[1] >= 0 && b[3] <= size.height;
  const clear = (b: Box) => lines.every((l) => !polylineMeetsBox(l, b));
  const spot = spots.find((s) => fits(box(s)) && clear(box(s)));
  if (spot) return spot;
  return { x: Math.min(x, right) - inset, y: above, anchor: "end" };
}

/** Whether any segment of the polyline crosses or lies in the box. */
export function polylineMeetsBox(points: readonly [number, number][], [x0, y0, x1, y1]: Box) {
  for (let k = 0; k + 1 < points.length; k++) {
    const [ax, ay] = points[k]!;
    const [bx, by] = points[k + 1]!;
    // Liang–Barsky: clip the segment to the box.
    let t0 = 0;
    let t1 = 1;
    const dx = bx - ax;
    const dy = by - ay;
    let inside = true;
    for (const [p, q] of [
      [-dx, ax - x0],
      [dx, x1 - ax],
      [-dy, ay - y0],
      [dy, y1 - ay],
    ] as const) {
      if (p === 0) {
        if (q < 0) inside = false;
        continue;
      }
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
    if (inside && t0 <= t1) return true;
  }
  return false;
}
