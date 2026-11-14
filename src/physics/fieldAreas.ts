// The diagram's fields as polygons in (X_B, T) (plan §9 phase 21), for the figure export's vector
// fills: each field of each band (boundaries.ts `bands`) between its two boundary polylines. The
// polylines are shared, by reference, between the two fields on either side of them, so the
// export simplifies each once and both fields keep the same vertices.

import type { PhaseId } from "./gibbs";
import type { Band, BoundaryPoint } from "./boundaries";

/** A field of one band: its phases (one or two) between two polylines, T increasing. */
export interface FieldArea {
  phases: [PhaseId] | [PhaseId, PhaseId];
  /** The left edge, T increasing: a tie line's end, or X = 0. */
  left: BoundaryPoint[];
  /** The right edge, T increasing: a tie line's end, or X = 1. */
  right: BoundaryPoint[];
}

/** Two edges this close at every row leave no field between them: a line compound. */
const ZERO_WIDTH = 1e-12;

/** A vertical edge of the window at X, from T0 to T1. */
const edge = (X: number, T0: number, T1: number): BoundaryPoint[] => [
  { X, T: T0 },
  { X, T: T1 },
];

/**
 * The fields of each band, left to right, band by band. A two-phase field runs between its tie
 * line's two ends; a one-phase field between the right end of the tie line before it (or X = 0)
 * and the left end of the one after (or X = 1), in the phase they share. A one-phase field of zero
 * width at every row, a line compound, is left out: its boundary draws it as a line.
 */
export function fieldAreas(bands: readonly Band[]): FieldArea[] {
  const out: FieldArea[] = [];
  for (const { T0, T1, ties, phase } of bands) {
    if (ties.length === 0) {
      out.push({ phases: [phase!], left: edge(0, T0, T1), right: edge(1, T0, T1) });
      continue;
    }
    const single = (p: PhaseId, left: BoundaryPoint[], right: BoundaryPoint[]) => {
      const zero =
        left.length === right.length &&
        left.every((a, i) => Math.abs(right[i]!.X - a.X) <= ZERO_WIDTH);
      if (!zero) out.push({ phases: [p], left, right });
    };
    single(ties[0]!.phases[0], edge(0, T0, T1), ties[0]!.left);
    ties.forEach((tie, k) => {
      out.push({ phases: tie.phases, left: tie.left, right: tie.right });
      const next = ties[k + 1];
      if (next) single(tie.phases[1], tie.right, next.left);
    });
    const last = ties.at(-1)!;
    single(last.phases[1], last.right, edge(1, T0, T1));
  }
  return out;
}

/**
 * The closed polygon of `area`: up its left edge, then down its right edge. Every area winds the
 * same way (clockwise with T upwards).
 */
export function polygonOf(area: FieldArea): BoundaryPoint[] {
  return [...area.left, ...[...area.right].reverse()];
}
