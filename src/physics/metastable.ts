// The metastable extensions of plan §3 `metastable`: each tie line with liquid at exactly one end
// (L + S, L + γ) that ends at an invariant, continued past it by Newton continuation of its
// two-phase equilibrium, until it leaves the window or stops being metastable. Metastable
// miscibility domes (S + S, L + L) are not computed (plan §1).

import { d2g, LIQUID, phaseAt, type Params, type PhaseId } from "./gibbs";
import type { PlotWindow } from "./plotWindow";
import { invariantsOf, scan as scanWindow, type Scan, type TieAt } from "./events";
import { MIN_GAP, refineTie } from "./hull";

/** One end-to-end tie line of an extension at T. */
export interface MetastableStep {
  T: number;
  X: [number, number];
}

/** A tie line with liquid at one end, continued past an invariant. */
export interface MetastableTie {
  /** The tie line's phases, left (A-rich) end first. */
  phases: [PhaseId, PhaseId];
  /** The invariant's temperature, K, where the extension starts. */
  T0: number;
  /** +1 when it runs up from the invariant, −1 when it runs down. */
  direction: 1 | -1;
  /** From the invariant (the first step, at T0) outwards. */
  steps: MetastableStep[];
}

/** The continuation's step, K. */
const STEP = 1;
/** A step is halved down to this before the extension is ended, K. */
const MIN_STEP = 1 / 1024;
/**
 * An end moves at most this far in one step, which keeps the polyline smooth (3.5 px on a 700 px
 * plot) where it turns steeply towards a spinodal, and keeps Newton on its branch.
 */
const MAX_DX = 0.005;
/** An end closer than this to a pure component has run out of the grid's reach (plan §2.2). */
const X_FLOOR = 1e-9;

const isLS = ([p, q]: TieAt) => (p.phase === LIQUID) !== (q.phase === LIQUID);

/** The extensions of every tie line with liquid at one end at every stable invariant. */
export function metastable(
  params: Params,
  window: PlotWindow,
  scanned: Scan = scanWindow(params, window),
): MetastableTie[] {
  const out: MetastableTie[] = [];
  for (const e of invariantsOf(scanned.events)) {
    // A tie line that exists only below the invariant carries on upwards, and the reverse.
    const [p1, p2, p3] = e.points;
    const touches = ([p, q]: TieAt) =>
      [p1, p2, p3].some((a) => a!.X === p.X) && [p1, p2, p3].some((a) => a!.X === q.X);
    for (const [ties, direction] of [
      [e.below, 1],
      [e.above, -1],
    ] as const) {
      for (const tie of ties.filter((t) => touches(t) && isLS(t))) {
        const ext = extend(params, window, tie, e.T, direction);
        if (ext) out.push(ext);
      }
    }
  }
  return out;
}

/**
 * The tie line `tie` at T0 continued in `direction`, by Newton from the previous steps' linear
 * extrapolation. It ends at the window's edge; where even a MIN_STEP step fails to converge or
 * moves an end by MAX_DX or more; or where the ends meet or cross, an end reaches a pure
 * component, or an end enters its phase's spinodal (beyond it the tie line is unstable, not
 * metastable; the extension folds there). Null when not one step is taken.
 */
function extend(
  params: Params,
  window: PlotWindow,
  [p, q]: TieAt,
  T0: number,
  direction: 1 | -1,
): MetastableTie | null {
  const phases: [PhaseId, PhaseId] = [p.phase, q.phase];
  const edge = direction > 0 ? window.Tmax : window.Tmin;
  const steps: MetastableStep[] = [{ T: T0, X: [p.X, q.X] }];
  let h = STEP;
  while (direction * (edge - steps.at(-1)!.T) > 1e-9) {
    const last = steps.at(-1)!;
    const prev = steps.at(-2);
    const T = direction > 0 ? Math.min(edge, last.T + h) : Math.max(edge, last.T - h);
    const next = tieAt(params, phases, T, guess(last, prev, T));
    if (next && Math.max(...next.map((X, k) => Math.abs(X - last.X[k]!))) < MAX_DX) {
      if (!metastableAt(params, phases, T, next)) break;
      steps.push({ T, X: next });
      h = Math.min(STEP, 2 * h);
      continue;
    }
    if (h <= MIN_STEP) break;
    h /= 2;
  }
  return steps.length > 1 ? { phases, T0, direction, steps } : null;
}

/** The ends at T extrapolated linearly from the last two steps (from the last alone at first). */
function guess(last: MetastableStep, prev: MetastableStep | undefined, T: number): number[] {
  if (!prev) return [...last.X];
  const t = (T - last.T) / (last.T - prev.T);
  return last.X.map((X, k) => {
    const v = X + t * (X - prev.X[k]!);
    return v > 0 && v < 1 ? v : X;
  });
}

/** The refined tie line of `phases` at T from the guess, or null when Newton fails. */
function tieAt(
  params: Params,
  [a, b]: [PhaseId, PhaseId],
  T: number,
  [X1, X2]: number[],
): [number, number] | null {
  const t = refineTie(phaseAt(params, a, T), phaseAt(params, b, T), X1!, X2!);
  return t ? [t.ends[0].X, t.ends[1].X] : null;
}

/**
 * Whether the tie line's ends are apart, in order, off the pure ends and outside the spinodals (a
 * point phase has none).
 */
function metastableAt(
  params: Params,
  phases: [PhaseId, PhaseId],
  T: number,
  [X1, X2]: [number, number],
): boolean {
  if (!(X2 - X1 > MIN_GAP) || X1 < X_FLOOR || X2 > 1 - X_FLOOR) return false;
  return phases.every((id, k) => {
    const p = phaseAt(params, id, T);
    return p.kind === "point" || d2g(p, [X1, X2][k]!) > 0;
  });
}

/** An extension that reaches the cut, with its tie line `at` the cut's T. */
export type MetastableAtCut = MetastableTie & { at: TieAt };

/**
 * The extensions that reach T, each as its tie line at T, refined from the nearest steps; an
 * extension whose tie line cannot be refined there is left out.
 */
export function metastableTiesAt(
  params: Params,
  ties: readonly MetastableTie[],
  T: number,
): MetastableAtCut[] {
  const out: MetastableAtCut[] = [];
  for (const ext of ties) {
    const { steps, phases } = ext;
    const far = steps.at(-1)!.T;
    const [lo, hi] = [Math.min(ext.T0, far), Math.max(ext.T0, far)];
    if (!(T >= lo && T <= hi)) continue;
    // The steps run monotonically in T from T0; take the pair that brackets T.
    let k = 1;
    while (k < steps.length - 1 && (steps[k]!.T - T) * ext.direction < 0) k++;
    const [s0, s1] = [steps[k - 1]!, steps[k]!];
    const t = s1.T === s0.T ? 0 : (T - s0.T) / (s1.T - s0.T);
    const guessX = s0.X.map((X, j) => X + t * (s1.X[j]! - X));
    const X = tieAt(params, phases, T, guessX);
    if (!X || !metastableAt(params, phases, T, X)) continue;
    out.push({
      ...ext,
      at: [
        { phase: phases[0], X: X[0] },
        { phase: phases[1], X: X[1] },
      ],
    });
  }
  return out;
}
