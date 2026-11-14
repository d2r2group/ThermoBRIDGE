// The phase boundaries of plan §3: the ends of the tie lines across T, linked into polylines
// between events. Between two events the sequence of fields is fixed, so the k-th tie line of
// every step is the same field; its ends at the events come from the exact solves. `bands` keeps
// them band by band, for the figure export's field areas (§9 phase 21); `boundaries` flattens them.

import type { Params, PhaseId } from "./gibbs";
import { sliceHull } from "./hull";
import type { PlotWindow } from "./plotWindow";
import { EventError, scan as scanWindow, type Scan, type TieAt } from "./events";

/** A point of a boundary, (X_B, T). */
export interface BoundaryPoint {
  X: number;
  T: number;
}

export interface Boundary {
  /** The tie line's phases, left (A-rich) end first. */
  phases: [PhaseId, PhaseId];
  /** Which end of the tie line this boundary traces: 0 the left end, 1 the right. */
  side: 0 | 1;
  /** T increasing, from one event (or window edge) to the next. */
  points: BoundaryPoint[];
}

/** One tie line of a band: its phases and the polylines of its two ends, T increasing. */
export interface BandTie {
  phases: [PhaseId, PhaseId];
  left: BoundaryPoint[];
  right: BoundaryPoint[];
}

/**
 * The part of the window between two consecutive events (or an event and the window's edge),
 * within which the sequence of fields is fixed. Its rows run from T0 to T1, each end solved at
 * exactly that T, so a field that vanishes at an event has zero width in that row.
 */
export interface Band {
  T0: number;
  T1: number;
  /** The tie lines, X increasing. */
  ties: BandTie[];
  /** With no tie lines, the one phase across the band. */
  phase?: PhaseId;
}

/** Steps this close to an event belong to neither side of it, K. */
const EDGE = 1e-9;

/** The bands of the window, T increasing. */
export function bands(
  params: Params,
  window: PlotWindow,
  scanned: Scan = scanWindow(params, window),
): Band[] {
  const { steps, events } = scanned;
  const tiesOf = (k: number): TieAt[] => steps[k]!.hull.ties.map((t) => t.ends);
  const edges = [window.Tmin, ...events.map((e) => e.T), window.Tmax];
  const out: Band[] = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const T0 = edges[i]!;
    const T1 = edges[i + 1]!;
    if (!(T1 > T0)) continue;
    const inside = steps.filter((s) => s.T > T0 + EDGE && s.T < T1 - EDGE);
    const rows: { T: number; ties: TieAt[] }[] = [
      { T: T0, ties: i === 0 ? tiesOf(0) : events[i - 1]!.above },
      ...inside.map((s) => ({ T: s.T, ties: s.hull.ties.map((t) => t.ends) })),
      { T: T1, ties: i === events.length ? tiesOf(steps.length - 1) : events[i]!.below },
    ];

    const count = rows[0]!.ties.length;
    if (rows.some((r) => r.ties.length !== count)) {
      throw new EventError(`fields change between ${T0.toFixed(3)} and ${T1.toFixed(3)} K`);
    }
    const ties: BandTie[] = [];
    for (let k = 0; k < count; k++) {
      const [p, q] = rows[0]!.ties[k]!;
      const side = (s: 0 | 1) => rows.map((r) => ({ X: r.ties[k]![s].X, T: r.T }));
      ties.push({ phases: [p.phase, q.phase], left: side(0), right: side(1) });
    }
    const band: Band = { T0, T1, ties };
    if (count === 0) {
      // At the window's edges, the first or last step is in the band.
      const step =
        inside[0] ?? (i === 0 ? steps[0] : i === events.length ? steps.at(-1) : undefined);
      const hull = step?.hull ?? sliceHull(params, 0.5 * (T0 + T1));
      const field = hull.fields[0]!;
      band.phase = field.kind === "single" ? field.phase : field.ends[0].phase;
    }
    out.push(band);
  }
  return out;
}

/** The boundaries of the window: each band's tie lines, left end then right, T increasing. */
export function boundaries(
  params: Params,
  window: PlotWindow,
  scanned: Scan = scanWindow(params, window),
): Boundary[] {
  return bands(params, window, scanned).flatMap((band) =>
    band.ties.flatMap(({ phases, left, right }) => [
      { phases, side: 0 as const, points: left },
      { phases, side: 1 as const, points: right },
    ]),
  );
}
