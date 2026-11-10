// The spinodals of plan §3 `spinodal`: for a phase with α > 0, g″ = 0 on T = 2α X (1 − X) / R,
// clipped to the window. The liquid's is hidden wherever the diagram is one-phase liquid, so it
// shows below the liquidus and inside a stable liquid dome but not through the liquid field
// above. The solid's is hidden in every field that holds liquid (L, L + S and L₁ + L₂), so it
// shows only where the diagram is all solid. At T* the two compositions X (1 − X) = RT* / (2α)
// on each curve, where the spinodal is drawn.

import { criticalT, curves, LIQUID, R, type Params, type PhaseId } from "./gibbs";
import type { PlotWindow } from "./plotWindow";
import { AT_INVARIANT, fieldsAt } from "./cut";
import { scan as scanWindow, type Scan } from "./events";
import { binodal, holdsLiquid, type Field } from "./hull";

/** A visible piece of a spinodal, X increasing. */
export interface SpinodalRun {
  phase: PhaseId;
  points: { X: number; T: number }[];
}

/** Samples of each spinodal across X ∈ [0, 1]. */
const SAMPLES = 400;
/** Bisection steps on X at each end of a visible run. */
const BISECT = 30;
/** The liquid binodal is taken this far below its critical point at the top, K. */
const TOP_SLACK = 1e-3;
/** A spinodal point this close to the window's edge counts as inside it, K. */
const EDGE_SLACK = 1e-6;
/**
 * A point within this relative distance of a spinodal, in X (1 − X), still counts as on it:
 * the samples' T is the spinodal's own up to rounding. Far below the binodal's lead over the
 * spinodal, even within a millikelvin of T_c, where the binodal is taken (TOP_SLACK).
 */
const SPINODAL_SLACK = 1e-9;

/** The temperature of phase α's spinodal at X, K. */
export function spinodalT(alpha: number, X: number): number {
  return (2 * alpha * X * (1 - X)) / R;
}

/**
 * The spinodal's compositions at T, X increasing: the two roots of X (1 − X) = RT / (2α), or
 * none when α ≤ 0 or T ≥ α / (2R).
 */
export function spinodalXs(alpha: number, T: number): [number, number] | [] {
  if (!(alpha > 0) || !(T < criticalT(alpha))) return [];
  const p = (R * T) / (2 * alpha); // X (1 − X), below 1/4
  // The smaller root, without cancellation: X = 2p / (1 + √(1 − 4p)).
  const lo = (2 * p) / (1 + Math.sqrt(1 - 4 * p));
  return [lo, 1 - lo];
}

/**
 * Whether (X, T) lies in a one-phase liquid field: X in a liquid field of `fields`, the hull's at
 * T, and outside the liquid's own binodal. Within about 0.02 K of the liquid's critical point the
 * hull takes the gap for rounding (hull.ts), which would cut a spinodal off below its top.
 */
export function inLiquid(params: Params, T: number, fields: readonly Field[], X: number): boolean {
  if (
    !fields.some((f) => f.kind === "single" && f.phase === LIQUID && X >= f.X[0] && X <= f.X[1])
  ) {
    return false;
  }
  // Just under T_c, where the binodal still exists in floating point.
  const b = binodal(params.alphaL, Math.min(T, criticalT(params.alphaL) - TOP_SLACK));
  return b === null || X <= b || X >= 1 - b;
}

/**
 * Whether X lies on or inside the spinodal of a phase with α > 0 at T, up to SPINODAL_SLACK:
 * there g″ ≤ 0, so X lies inside the phase's binodal too and on no one-phase field of it.
 */
function onOrInsideSpinodal(alpha: number, T: number, X: number): boolean {
  return 2 * alpha * X * (1 - X) >= R * T * (1 - SPINODAL_SLACK);
}

/** Whether a field of `fields` that holds X has liquid in it. */
function withLiquid(fields: readonly Field[], X: number): boolean {
  return fields.some((f) => {
    const [lo, hi] = f.kind === "single" ? f.X : [f.ends[0].X, f.ends[1].X];
    return holdsLiquid(f) && X >= lo && X <= hi;
  });
}

/**
 * Whether the spinodal of `phase` is hidden at (X, T), on the fields at T (`fieldsAt`), which
 * are asked for only when needed: the liquid's in a one-phase liquid field, the solid's in any
 * field with liquid in it. A point of the liquid's own spinodal lies inside its binodal, so it
 * is never in a one-phase liquid field and needs neither the fields nor the binodal.
 */
function hiddenAt(
  params: Params,
  phase: PhaseId,
  T: number,
  X: number,
  fields: () => readonly Field[],
): boolean {
  if (phase !== LIQUID) return withLiquid(fields(), X);
  if (onOrInsideSpinodal(params.alphaL, T, X)) return false;
  return inLiquid(params, T, fields(), X);
}

/**
 * Whether the spinodal of `phase` is hidden at (X, T), on `fields`, the hull's at T: the
 * liquid's in a one-phase liquid field, the solid's in any field with liquid in it.
 */
export function spinodalHidden(
  params: Params,
  phase: PhaseId,
  T: number,
  fields: readonly Field[],
  X: number,
): boolean {
  return hiddenAt(params, phase, T, X, () => fields);
}

/**
 * Whether the solid's spinodal is hidden at (X, T), from the scan's steps where they settle it:
 * when the two steps around T see the same, with no event between them or within a cut's
 * AT_INVARIANT of them, a field edge does not cross X between them. Otherwise, null.
 */
function hiddenFromSteps(scanned: Scan, T: number, X: number): boolean | null {
  const { steps, window, events } = scanned;
  const n = steps.length - 1;
  let j = Math.floor(((T - window.Tmin) / (window.Tmax - window.Tmin)) * n);
  j = Math.max(0, Math.min(n - 1, j));
  const lo = steps[j]!;
  const hi = steps[j + 1]!;
  if (!(T >= lo.T && T <= hi.T) || lo.sig !== hi.sig) return null;
  if (events.some((e) => e.T >= lo.T - AT_INVARIANT && e.T <= hi.T + AT_INVARIANT)) return null;
  const below = withLiquid(lo.hull.fields, X);
  return below === withLiquid(hi.hull.fields, X) ? below : null;
}

/** The visible runs of every phase's spinodal over the window (plan §3), each phase in turn. */
export function spinodal(
  params: Params,
  window: PlotWindow,
  scanned: Scan = scanWindow(params, window),
): SpinodalRun[] {
  const out: SpinodalRun[] = [];
  for (const c of curves(params, window.Tmin)) {
    out.push(...phaseSpinodal(params, window, c.id, c.alpha, scanned));
  }
  return out;
}

/**
 * The visible runs of one phase's spinodal. Each sample's visibility comes from the scan's steps
 * where they settle it (`hiddenFromSteps`), else from the fields at its T; the ends of a run,
 * found by bisection, always from the fields at their T.
 */
function phaseSpinodal(
  params: Params,
  window: PlotWindow,
  phase: PhaseId,
  alpha: number,
  scanned: Scan,
): SpinodalRun[] {
  if (!(alpha > 0)) return [];
  const { Tmin, Tmax } = window;
  // The compositions where the spinodal crosses the window's edges, then a sweep of X between.
  const xs = new Set<number>();
  for (const T of [Tmin, Tmax]) for (const X of spinodalXs(alpha, T)) xs.add(X);
  for (let k = 1; k < SAMPLES; k++) xs.add(k / SAMPLES);
  xs.add(0.5);
  // The edge samples land on the window's edges only up to rounding.
  const inWindow = (X: number) => {
    const T = spinodalT(alpha, X);
    return T >= Tmin - EDGE_SLACK && T <= Tmax + EDGE_SLACK;
  };
  const point = (X: number) => ({ X, T: Math.min(Tmax, Math.max(Tmin, spinodalT(alpha, X))) });
  const exactFields = (T: number) => () => fieldsAt(params, T, scanned.events);
  /** Whether the spinodal shows at X; `fromSteps` lets the scan's steps settle it. */
  const visible = (X: number, fromSteps: boolean) => {
    if (!inWindow(X)) return false;
    const { T } = point(X);
    const stepped = fromSteps && phase !== LIQUID ? hiddenFromSteps(scanned, T, X) : null;
    return !(stepped ?? hiddenAt(params, phase, T, X, exactFields(T)));
  };

  // Where visibility changes between two samples, the edge by bisection, on the visible side.
  const edge = (shown: number, hidden: number) => {
    for (let k = 0; k < BISECT; k++) {
      const mid = 0.5 * (shown + hidden);
      if (visible(mid, false)) shown = mid;
      else hidden = mid;
    }
    return shown;
  };

  const runs: SpinodalRun[] = [];
  let run: SpinodalRun["points"] | null = null;
  let prevX = NaN;
  let prevShown = false;
  for (const X of [...xs].sort((a, b) => a - b)) {
    // A sample outside the window is hidden by the window, whose edges are among the samples.
    const shown = visible(X, true);
    if (shown && !prevShown && run === null) {
      run = [];
      if (Number.isFinite(prevX) && inWindow(prevX)) run.push(point(edge(X, prevX)));
    }
    if (!shown && run !== null) {
      if (inWindow(X)) run.push(point(edge(prevX, X)));
      if (run.length > 1) runs.push({ phase, points: run });
      run = null;
    }
    if (shown) run!.push(point(X));
    prevX = X;
    prevShown = shown;
  }
  if (run !== null && run.length > 1) runs.push({ phase, points: run });
  return runs;
}

/** The spinodal points at T where the diagram draws the spinodal, per phase, X increasing. */
export function spinodalPointsAt(
  params: Params,
  T: number,
  fields: readonly Field[],
): { phase: PhaseId; X: number }[] {
  const out: { phase: PhaseId; X: number }[] = [];
  for (const c of curves(params, T)) {
    for (const X of spinodalXs(c.alpha, T)) {
      if (!spinodalHidden(params, c.id, T, fields, X)) out.push({ phase: c.id, X });
    }
  }
  return out;
}
