// The composition grid of plan §3: 800 points evenly spaced in logit X over [−21, 21], which
// resolve the small solubilities near the pure ends, merged with 400 evenly spaced in X, which
// keep the spacing near X = 1/2 below 0.003, plus the pure ends X = 0 and X = 1. The
// T-independent parts of g are computed once per grid, so a slice costs only multiply-adds.

import { logit, mixingEntropy } from "./gibbs";

export interface Grid {
  /** Compositions, strictly increasing from 0 to 1. */
  X: Float64Array;
  /** X ln X + (1 − X) ln(1 − X). */
  ent: Float64Array;
  /** X (1 − X). */
  xy: Float64Array;
}

const LOGIT_POINTS = 800;
/** The grid spans logit X in [−LOGIT_RANGE, LOGIT_RANGE]. */
export const LOGIT_RANGE = 21;
const LINEAR_POINTS = 400;

export function makeGrid(
  logitPoints = LOGIT_POINTS,
  linearPoints = LINEAR_POINTS,
  logitRange = LOGIT_RANGE,
): Grid {
  const values: number[] = [0, 1];
  for (let k = 0; k < logitPoints; k++) {
    const u = -logitRange + (2 * logitRange * k) / (logitPoints - 1);
    values.push(1 / (1 + Math.exp(-u)));
  }
  for (let k = 1; k <= linearPoints; k++) values.push(k / (linearPoints + 1));
  values.sort((a, b) => a - b);
  const unique = values.filter((v, k) => k === 0 || v > (values[k - 1] as number));
  const X = Float64Array.from(unique);
  return {
    X,
    ent: X.map(mixingEntropy),
    xy: X.map((x) => x * (1 - x)),
  };
}

/** The grid that every hull uses unless told otherwise. */
export const GRID: Grid = makeGrid();

/** logit X clamped to the grid's range, for the initial guesses of the Newton solves. */
export function clampU(X: number): number {
  return Math.max(-LOGIT_RANGE, Math.min(LOGIT_RANGE, logit(X)));
}
