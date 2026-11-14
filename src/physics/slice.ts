// The slice at the cut (plan §2, §4 item 2): g_l and g_s (and a compound γ with a range) at T*
// minus the straight line r through the stable pure components, split into their stable and
// non-stable runs, the common tangents with their touching points, the envelope under which the
// panel is shaded, and the g axis fitted to it and to the solid's barrier; a line compound's
// point (§9 phase 13); and the points of the metastable tangents and the spinodals on the same
// curves. Energies are in kJ/mol.

import {
  COMPOUND,
  compoundPhase,
  fusionGibbs,
  phaseG,
  phases as phasesOf,
  SOLID,
  type Curve,
  type Params,
  type Phase,
  type PhaseId,
} from "./gibbs";
import { GRID } from "./grid";
import type { Field, TieEnd } from "./hull";

/** A point of a curve or of the envelope in the panel: g − r at X. */
export interface SlicePoint {
  X: number;
  g: number;
}

/** A run of one phase's curve, on the stable envelope or off it. */
export interface CurveRun {
  phase: PhaseId;
  stable: boolean;
  points: SlicePoint[];
}

/** A touching point of a common tangent. */
export interface TouchPoint extends TieEnd {
  /** g − r there. */
  g: number;
}

/** A stable common tangent: two touching points, or three at an invariant temperature. */
export interface Tangent {
  points: TouchPoint[];
}

/** The envelope over one field, the top edge of its shading. */
export interface Shade {
  field: Field;
  points: SlicePoint[];
}

export interface Slice {
  runs: CurveRun[];
  tangents: Tangent[];
  shades: Shade[];
  /** The lowest point m of the envelope, ≤ 0. */
  min: number;
  /** The height b ≥ 0 of the solid's curve above its own chord: a miscibility gap's barrier. */
  barrier: number;
}

/** g − r at X on the curve of each phase at T, for points off the stable envelope. */
export function relativeG(params: Params, T: number): (e: TieEnd) => number {
  const [ra, rb] = sliceReference(params, T);
  const byId = new Map(phasesOf(params, T).map((c) => [c.id, c]));
  return (e) => phaseG(byId.get(e.phase)!, e.X) - (ra + (rb - ra) * e.X);
}

/**
 * g − r of the mixture of `phases` (left to right) at overall composition X0, on the envelope
 * (plan §4 item 7): the phase's own curve for one phase, otherwise the tangent through the
 * outer two, on which a third, at an invariant, also lies.
 */
export function mixtureG(params: Params, T: number, X0: number, phases: readonly TieEnd[]): number {
  const rel = relativeG(params, T);
  const first = phases[0]!;
  const last = phases.at(-1)!;
  if (phases.length === 1 || last.X === first.X) return rel({ phase: first.phase, X: X0 });
  const t = (X0 - first.X) / (last.X - first.X);
  return rel(first) + t * (rel(last) - rel(first));
}

/** A line compound's point in the panel, on the envelope (stable) or above it. */
export interface CompoundPoint extends SlicePoint {
  stable: boolean;
}

/**
 * The line compound's point at T, at (X_c, g − r), stable when the fields at T (from `fieldsAt`)
 * hold its one-phase field; null without a line compound.
 */
export function compoundPointAt(
  params: Params,
  T: number,
  fields: readonly Field[],
): CompoundPoint | null {
  const c = compoundPhase(params, T);
  if (c?.kind !== "point") return null;
  const stable = fields.some((f) => f.kind === "single" && f.phase === COMPOUND);
  return { X: c.X, g: relativeG(params, T)({ phase: COMPOUND, X: c.X }), stable };
}

/**
 * The touching points of `tangents`, in order, once each: two tangents that touch at one point
 * (a line compound's, between its two tie lines) share it.
 */
export function distinctTouches(tangents: readonly Tangent[]): TouchPoint[] {
  const out: TouchPoint[] = [];
  for (const e of tangents.flatMap((t) => t.points)) {
    const last = out.at(-1);
    if (!last || last.X !== e.X || last.phase !== e.phase) out.push(e);
  }
  return out;
}

/** The touching points of tie lines off the envelope (the metastable ones at T), as tangents. */
export function tangentsOf(params: Params, T: number, ties: readonly TieEnd[][]): Tangent[] {
  const rel = relativeG(params, T);
  return ties.map((ends) => ({ points: ends.map((e) => ({ ...e, g: rel(e) })) }));
}

/** r(X) = a + (b − a) X, the line through the lower pure phase at each end, as [a, b]. */
export function sliceReference(params: Params, T: number): [number, number] {
  return [
    Math.min(0, fusionGibbs(params.dsA, params.TmA, T)),
    Math.min(0, fusionGibbs(params.dsB, params.TmB, T)),
  ];
}

/**
 * The compositions the panel's curves are drawn at, for a plot `width` CSS px wide: one per
 * pixel column, and the grid's logit points within one pixel of either end, where the curves
 * fall steeply (plan §3).
 */
export function sliceXs(width: number): number[] {
  const n = Math.max(1, Math.round(width));
  const xs: number[] = [];
  for (let k = 0; k <= n; k++) xs.push(k / n);
  for (const X of GRID.X) if ((X > 0 && X < 1 / n) || (X < 1 && X > 1 - 1 / n)) xs.push(X);
  return xs.sort((a, b) => a - b);
}

/**
 * The slice at T on the fields `fields` (from `fieldsAt`), with the curves sampled at `xs`
 * (sorted, from `sliceXs`) and at every field edge.
 */
export function slice(
  params: Params,
  T: number,
  fields: readonly Field[],
  xs: readonly number[],
): Slice {
  const [ra, rb] = sliceReference(params, T);
  const rel = (c: Phase, X: number) => phaseG(c, X) - (ra + (rb - ra) * X);
  const all = phasesOf(params, T);
  const phases = all.filter((c): c is Curve => c.kind === "curve");
  const byId = new Map(all.map((c) => [c.id, c]));
  const sample = (c: Phase, lo: number, hi: number): SlicePoint[] => {
    const out: SlicePoint[] = [{ X: lo, g: rel(c, lo) }];
    for (let k = firstAbove(xs, lo); k < xs.length && xs[k]! < hi; k++) {
      out.push({ X: xs[k]!, g: rel(c, xs[k]!) });
    }
    out.push({ X: hi, g: rel(c, hi) });
    return out;
  };

  // Each curve is stable over the one-phase fields of its phase and off the envelope elsewhere.
  // A line compound is a point, with no run.
  const edges = [...new Set([0, 1, ...fields.flatMap(edgesOf)])].sort((a, b) => a - b);
  const runs: CurveRun[] = [];
  for (const c of phases) {
    const stableOn = (lo: number, hi: number) =>
      fields.some((f) => f.kind === "single" && f.phase === c.id && f.X[0] <= lo && f.X[1] >= hi);
    let start = 0;
    for (let k = 1; k < edges.length; k++) {
      const stable = stableOn(edges[k - 1]!, edges[k]!);
      const next = k + 1 < edges.length ? stableOn(edges[k]!, edges[k + 1]!) : !stable;
      if (next === stable) continue;
      runs.push({ phase: c.id, stable, points: sample(c, edges[start]!, edges[k]!) });
      start = k;
    }
  }

  const shades: Shade[] = [];
  const tangents: Tangent[] = [];
  let afterInvariant = false;
  for (const f of fields) {
    if (f.kind === "single") {
      if (f.X[1] > f.X[0]) shades.push({ field: f, points: sample(byId.get(f.phase)!, ...f.X) });
      afterInvariant = f.invariant === true;
      continue;
    }
    const touch = f.ends.map((e) => ({ ...e, g: rel(byId.get(e.phase)!, e.X) }));
    shades.push({ field: f, points: touch.map(({ X, g }) => ({ X, g })) });
    // A tie line after an invariant's middle phase (`fieldsAt` marks it) is the second half of
    // the invariant's tangent, so its far end joins that tangent. The two tie lines of a line
    // compound share an end too, but are two tangents.
    if (afterInvariant && tangents.length > 0) {
      tangents.at(-1)!.points.push(touch[1]!);
    } else {
      tangents.push({ points: touch });
    }
  }

  let min = 0;
  for (const s of shades) for (const p of s.points) min = Math.min(min, p.g);
  // The solid's hump above its own chord: r itself at low T, where the hump is the gap's barrier,
  // and 0 without a gap, however far the metastable solid lies above r.
  let barrier = 0;
  const solid = byId.get(SOLID);
  if (solid) {
    const [ga, gb] = [rel(solid, 0), rel(solid, 1)];
    for (const r of runs) {
      if (r.phase !== SOLID) continue;
      for (const p of r.points) barrier = Math.max(barrier, p.g - (ga + (gb - ga) * p.X));
    }
  }
  return { runs, tangents, shades, min, barrier };
}

/** The index of the first of the sorted `xs` above `X` (xs.length if none). */
function firstAbove(xs: readonly number[], X: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! > X) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** The edges of a field in X. */
function edgesOf(f: Field): number[] {
  return f.kind === "single" ? [...f.X] : [f.ends[0].X, f.ends[1].X];
}

/** The least half-depth of the g axis, kJ/mol (plan §4 item 2). */
export const MIN_DEPTH = 0.2;

/** The most the g axis rises above 0, in half-depths d (plan §4 item 2). */
export const MAX_RISE = 20;

/** The least margin below m and above b, as a share of the range b − m they frame. */
export const MARGIN_SHARE = 0.06;

/**
 * The g axis for an envelope whose lowest point is m, with the solid's barrier b
 * (plan §4 item 2): with d = max(|m|, 0.2 kJ/mol), b capped at 20 d, and the margin
 * p = max(0.1 d, 0.06 (b − m)), from m − p to b + p, held between 0.5 d and 20 d.
 */
export function gDomain(min: number, barrier = 0): [number, number] {
  const d = Math.max(Math.abs(min), MIN_DEPTH);
  const cap = MAX_RISE * d;
  const margin = Math.max(0.1 * d, MARGIN_SHARE * (Math.min(barrier, cap) - min));
  return [min - margin, Math.min(Math.max(0.5 * d, barrier + margin), cap)];
}

/** The X of each touching point of the stable tangents, once each, X increasing. */
export function touchingXs(fields: readonly Field[]): TieEnd[] {
  const out: TieEnd[] = [];
  for (const f of fields) {
    if (f.kind !== "tie") continue;
    for (const e of f.ends) {
      const last = out.at(-1);
      if (!last || last.X !== e.X || last.phase !== e.phase) out.push(e);
    }
  }
  return out;
}
