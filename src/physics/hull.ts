// The lower convex hull of the phases' Gibbs energies at one temperature (plan §3): the stable
// envelope, its tie lines and the one-phase intervals between them.
//
// The hull runs on the grid, and each edge that skips grid points or joins two phases is a
// candidate tie line. A candidate between two phases is refined by Newton on the equal-μ
// equations, one within a phase is that phase's symmetric binodal, and either is accepted only
// when it is real: near a critical point a curve is almost flat, and rounding alone makes a grid
// hull skip points, which would show as fake miscibility gaps.

import {
  fromLogit,
  g,
  LIQUID,
  logit,
  logitState,
  R,
  type Curve,
  type Params,
  phases as phasesOf,
  type Phase,
  type PhaseId,
  type PointPhase,
} from "./gibbs";
import { clampU, GRID, type Grid } from "./grid";
import { newton } from "./roots";

export interface TieEnd {
  phase: PhaseId;
  X: number;
}

/** A tie line: its two ends, X increasing, and the common tangent g = intercept + slope X. */
export interface TieField {
  kind: "tie";
  ends: [TieEnd, TieEnd];
  slope: number;
  intercept: number;
}

/**
 * A one-phase interval of the envelope: zero width for a line compound between its two tie lines,
 * and for an invariant's middle phase, which `fieldsAt` marks.
 */
export interface SingleField {
  kind: "single";
  phase: PhaseId;
  X: [number, number];
  /** Set by `fieldsAt` on an invariant's zero-width middle phase. */
  invariant?: true;
}

export type Field = SingleField | TieField;

/** Whether a field has liquid in it: L, L + S or L₁ + L₂. */
export function holdsLiquid(f: Field): boolean {
  return f.kind === "single" ? f.phase === LIQUID : f.ends.some((e) => e.phase === LIQUID);
}

export interface Hull {
  /** The fields across [0, 1], left to right, alternating single and tie, single at both ends. */
  fields: Field[];
  ties: TieField[];
}

/** A hull that cannot be made consistent; the system is then rejected (plan §2.2). */
export class HullError extends Error {}

/** Relative tolerance of the collinearity test, as a fraction of the envelope's range. */
const COLLINEAR_TOL = 1e-12;
/** Two ends of a same-phase tie line closer than this are one phase (a fake gap). */
export const MIN_GAP = 1e-6;
/**
 * Tie-line ends within this of each other are one end: two hull edges refined to one tie line
 * agree to Newton's precision, far below it, while tie lines that differ do so by far more.
 */
const MERGE_TOL = 1e-9;

/**
 * The A-rich end X < 1/2 of a regular solution's miscibility gap at T, the nontrivial root of
 * RT ln(X / (1 − X)) + α (1 − 2X) = 0; null when there is no gap (α ≤ 0 or T ≥ α / (2R)).
 */
export function binodal(alpha: number, T: number): number | null {
  const RT = R * T;
  const F = (u: number) => RT * u + alpha * (1 - 2 * fromLogit(u));
  // F > 0 just left of u = 0 exactly when T < T_c; F → −∞ as u → −∞.
  let hi = -1e-6;
  if (!(alpha > 0) || !(F(hi) > 0)) return null;
  let lo = (-2 * alpha) / RT - 1; // F(lo) < RT lo + α < 0
  for (let iter = 0; iter < 200; iter++) {
    const mid = 0.5 * (lo + hi);
    if (mid === lo || mid === hi) break;
    if (F(mid) > 0) hi = mid;
    else lo = mid;
  }
  return fromLogit(0.5 * (lo + hi));
}

/**
 * Whether p and q are one phase: callers such as `curveAt` build a new object per call, so
 * identity of the objects is not enough.
 */
const samePhase = (p: Phase, q: Phase) => p.kind === q.kind && p.id === q.id;

/**
 * The refined tie line between two phases from guesses X1 < X2: the binodal when p and q are one
 * curve, otherwise by Newton. Null when the curve has no gap or Newton does not converge.
 */
export function refineTie(
  p: Phase,
  q: Phase,
  X1: number,
  X2: number,
): Omit<TieField, "kind"> | null {
  const tie = (a: Phase, Xa: number, b: Phase, Xb: number, muA: number, muB: number) => ({
    ends: [
      { phase: a.id, X: Xa },
      { phase: b.id, X: Xb },
    ] as [TieEnd, TieEnd],
    slope: muB - muA,
    intercept: muA,
  });

  if (p.kind === "point" && q.kind === "point") {
    const slope = (q.g - p.g) / (q.X - p.X);
    return tie(p, p.X, q, q.X, p.g - slope * p.X, p.g + slope * (1 - p.X));
  }
  if (p.kind === "curve" && samePhase(p, q)) {
    // A gap within one regular solution: the linear terms do not move it, so it is the
    // symmetric binodal X₂ = 1 − X₁ (plan §2).
    const X = binodal(p.alpha, p.T);
    if (X === null) return null;
    const a = logitState(p, logit(X));
    return tie(p, X, p, 1 - X, a.muA, a.muB);
  }
  if (p.kind === "curve" && q.kind === "curve") {
    const v = newton(
      ([u1, u2]) => {
        const a = logitState(p, u1!);
        const b = logitState(q, u2!);
        return {
          f: [a.muA - b.muA, a.muB - b.muB],
          J: [
            [a.muA_u, -b.muA_u],
            [a.muB_u, -b.muB_u],
          ],
        };
      },
      [clampU(X1), clampU(X2)],
    );
    if (!v) return null;
    const a = logitState(p, v[0]!);
    const b = logitState(q, v[1]!);
    return tie(p, a.x, q, b.x, a.muA, a.muB);
  }
  // A curve and a point: the curve's tangent at its end passes through the point.
  const curve = (p.kind === "curve" ? p : q) as Curve;
  const point = (p.kind === "point" ? p : q) as PointPhase;
  const v = newton(
    ([u]) => {
      const s = logitState(curve, u!);
      return {
        f: [s.muA * (1 - point.X) + s.muB * point.X - point.g],
        J: [[s.muA_u * (1 - point.X) + s.muB_u * point.X]],
      };
    },
    [clampU(curve === p ? X1 : X2)],
  );
  if (!v) return null;
  const s = logitState(curve, v[0]!);
  return curve === p
    ? tie(p, s.x, q, point.X, s.muA, s.muB)
    : tie(p, point.X, q, s.x, s.muA, s.muB);
}

/**
 * The hull of the given phases (curves and points), on the grid. Throws a HullError when a
 * candidate between two different phases cannot be refined, or the tie lines do not chain or
 * overlap beyond repair.
 */
export function hull(phases: Phase[], grid: Grid = GRID): Hull {
  const n = grid.X.length;
  const curveList = phases.filter((ph): ph is Curve => ph.kind === "curve");
  // A point on or above a curve at its own X is not stable. The grid alone would keep it on the
  // hull a little longer, while it lies below the chord of the grid points beside it.
  const pointList = phases
    .filter((ph): ph is PointPhase => ph.kind === "point")
    .filter((pt) => curveList.every((c) => g(c, pt.X) > pt.g))
    .sort((a, b) => a.X - b.X);

  // The envelope on the grid: each curve in its own tight loop, then the pointwise minimum.
  const phaseIndex = new Map(phases.map((ph, k) => [ph, k]));
  const env = new Float64Array(n).fill(Infinity);
  const label = new Int32Array(n).fill(-1);
  for (const c of curveList) {
    const { gA, alpha } = c;
    const dgAB = c.gB - c.gA;
    const RT = R * c.T;
    const id = phaseIndex.get(c)!;
    const { X, xy, ent } = grid;
    for (let k = 0; k < n; k++) {
      const v = gA + dgAB * X[k]! + alpha * xy[k]! + RT * ent[k]!;
      if (v < env[k]!) {
        env[k] = v;
        label[k] = id;
      }
    }
  }

  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < n; k++) {
    if (env[k]! < lo) lo = env[k]!;
    if (env[k]! > hi) hi = env[k]!;
  }
  for (const pt of pointList) {
    lo = Math.min(lo, pt.g);
    hi = Math.max(hi, pt.g);
  }
  const tol = COLLINEAR_TOL * Math.max(hi - lo, 1e-6);

  // At a pure end where two curves tie to within the tolerance (at that component's melting
  // point), the end takes the phase of its neighbour, so no zero-length tie line is asked for.
  for (const [end, next] of [
    [0, 1],
    [n - 1, n - 2],
  ] as const) {
    if (label[end] === label[next]) continue;
    const c = phases[label[next]!] as Curve;
    if ((end === 0 ? c.gA : c.gB) - env[end]! <= tol) label[end] = label[next]!;
  }

  // Merged with the point phases in X order (the grid alone when there are none).
  let sx: Float64Array = grid.X;
  let sg: Float64Array = env;
  let sl: Int32Array = label;
  let m = curveList.length > 0 ? n : 0;
  if (pointList.length > 0) {
    const size = m + pointList.length;
    sx = new Float64Array(size);
    sg = new Float64Array(size);
    sl = new Int32Array(size);
    let i = 0;
    let k = 0;
    let pk = 0;
    while (k < m || pk < pointList.length) {
      const pt = pointList[pk] as PointPhase | undefined;
      if (pt && (k >= m || pt.X <= grid.X[k]!)) {
        sx[i] = pt.X;
        sg[i] = pt.g;
        sl[i++] = phaseIndex.get(pt)!;
        pk++;
      } else {
        sx[i] = grid.X[k]!;
        sg[i] = env[k]!;
        sl[i++] = label[k]!;
        k++;
      }
    }
    m = size;
  }

  // Monotone chain: a point stays on the lower hull only if it lies below the chord of its
  // neighbours by more than the tolerance.
  const stackBuf = new Int32Array(m);
  let top = -1;
  for (let k = 0; k < m; k++) {
    const xk = sx[k]!;
    const gk = sg[k]!;
    if (top >= 0 && xk === sx[stackBuf[top]!]) {
      if (gk >= sg[stackBuf[top]!]!) continue;
      top--;
    }
    while (top >= 1) {
      const a = stackBuf[top - 1]!;
      const b = stackBuf[top]!;
      const xa = sx[a]!;
      const ga = sg[a]!;
      // (g_b − chord at x_b) · (x_k − x_a), without a division.
      const below = (sg[b]! - ga) * (xk - xa) - (gk - ga) * (sx[b]! - xa);
      if (below < -tol * (xk - xa)) break;
      top--;
    }
    stackBuf[++top] = k;
  }
  const stack = stackBuf.subarray(0, top + 1);

  // Candidates: hull edges that skip points or join two phases.
  const ties: TieField[] = [];
  const refine = (a: number, b: number, depth: number) => {
    const p = phases[sl[a]!]!;
    const q = phases[sl[b]!]!;
    const same = samePhase(p, q);
    const t = refineTie(p, q, sx[a]!, sx[b]!);
    if (!t) {
      if (same) return; // one-phase
      throw new HullError(`tie line ${p.id}+${q.id} did not converge`);
    }
    const [X1, X2] = [t.ends[0].X, t.ends[1].X];
    if (same ? !(X2 - X1 > MIN_GAP) : !(X2 > X1)) return;
    // The envelope between the ends must lie on or above the tangent; a point below it means a
    // third phase in between, so split the edge there. (A third phase beyond the edge shows as
    // an overlap with the neighbouring tie lines, which the merge below resolves.)
    let dip = -1;
    let dipDepth = -tol;
    let excess = 0;
    for (let k = a; k <= b; k++) {
      if (!(sx[k]! > X1 && sx[k]! < X2)) continue;
      const d = sg[k]! - (t.intercept + t.slope * sx[k]!);
      if (d < dipDepth) {
        dipDepth = d;
        dip = k;
      }
      if (d > excess) excess = d;
    }
    if (dip >= 0) {
      if (depth > 8) throw new HullError("tie line refinement did not settle");
      refine(a, dip, depth + 1);
      refine(dip, b, depth + 1);
      return;
    }
    if (same && !(excess > tol)) return; // flat: rounding, not a gap
    ties.push({ kind: "tie", ...t });
  };
  for (let e = 0; e + 1 < stack.length; e++) {
    const a = stack[e]!;
    const b = stack[e + 1]!;
    if (b > a + 1 || sl[a] !== sl[b]) refine(a, b, 0);
  }

  // Merge repeats (two edges refined to one tie line) and check that the tie lines chain. Two
  // tie lines a + b and b + c that overlap leave no room for b: just off an invariant the grid
  // can keep b's point on the hull although b is not stable, so they become one tie line a + c.
  const byId = new Map(phases.map((ph) => [ph.id, ph]));
  const merged: TieField[] = [];
  const add = (t: TieField) => {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push(t);
      return;
    }
    const [l0, l1] = last.ends;
    const [t0, t1] = t.ends;
    if (
      l0.phase === t0.phase &&
      l1.phase === t1.phase &&
      Math.abs(l0.X - t0.X) < MERGE_TOL &&
      Math.abs(l1.X - t1.X) < MERGE_TOL
    ) {
      return;
    }
    if (l1.phase !== t0.phase) throw new HullError("tie lines do not chain");
    if (t0.X >= l1.X - MERGE_TOL) {
      merged.push(t);
      return;
    }
    const joined = refineTie(byId.get(l0.phase)!, byId.get(t1.phase)!, l0.X, t1.X);
    if (!joined || !(joined.ends[1].X - joined.ends[0].X > MIN_GAP)) {
      throw new HullError("tie lines overlap");
    }
    merged.pop();
    add({ kind: "tie", ...joined });
  };
  for (const t of ties.sort((s, t) => s.ends[0].X - t.ends[0].X)) add(t);

  const fields: Field[] = [];
  let X = 0;
  let phase = merged[0]?.ends[0].phase ?? phases[sl[0]!]!.id;
  for (const t of merged) {
    fields.push({ kind: "single", phase, X: [X, t.ends[0].X] });
    fields.push(t);
    X = t.ends[1].X;
    phase = t.ends[1].phase;
  }
  fields.push({ kind: "single", phase, X: [X, 1] });
  // Only the hull's own points: a point phase above the envelope is no phase change.
  if (merged.length === 0) {
    for (const k of stack) {
      if (phases[sl[k]!]!.id !== phase) throw new HullError("phase change without a tie line");
    }
  }
  return { fields, ties: merged };
}

/** The hull of the phases of `params` at T: the liquid, the solid and any compound. */
export function sliceHull(params: Params, T: number, grid: Grid = GRID): Hull {
  return hull(phasesOf(params, T), grid);
}

/**
 * The sequence of fields as a key: the phase at X = 0, then each tie line's two phases. Two
 * hulls with the same key have the same fields in the same order.
 */
export function signature(h: Hull): string {
  const first = h.fields[0] as SingleField;
  return [first.phase, ...h.ties.map((t) => `${t.ends[0].phase}|${t.ends[1].phase}`)].join(" ");
}
