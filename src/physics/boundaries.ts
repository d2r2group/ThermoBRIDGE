// The phase boundaries of plan §3: the ends of the tie lines across T, linked into polylines
// between events. Between two events the sequence of fields is fixed, so the k-th tie line of
// every step is the same field; its ends at the events come from the exact solves.

import type { Params, PhaseId } from "./gibbs";
import type { PlotWindow } from "./plotWindow";
import { EventError, scan as scanWindow, type Scan, type TieAt } from "./events";

export interface Boundary {
  /** The tie line's phases, left (A-rich) end first. */
  phases: [PhaseId, PhaseId];
  /** Which end of the tie line this boundary traces: 0 the left end, 1 the right. */
  side: 0 | 1;
  /** T increasing, from one event (or window edge) to the next. */
  points: { X: number; T: number }[];
}

/** Steps this close to an event belong to neither side of it, K. */
const EDGE = 1e-9;

export function boundaries(
  params: Params,
  window: PlotWindow,
  scanned: Scan = scanWindow(params, window),
): Boundary[] {
  const { steps, events } = scanned;
  const tiesOf = (k: number): TieAt[] => steps[k]!.hull.ties.map((t) => t.ends);
  const edges = [window.Tmin, ...events.map((e) => e.T), window.Tmax];
  const out: Boundary[] = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const T0 = edges[i]!;
    const T1 = edges[i + 1]!;
    if (!(T1 > T0)) continue;
    const rows: { T: number; ties: TieAt[] }[] = [
      { T: T0, ties: i === 0 ? tiesOf(0) : events[i - 1]!.above },
    ];
    for (const s of steps) {
      if (s.T > T0 + EDGE && s.T < T1 - EDGE) {
        rows.push({ T: s.T, ties: s.hull.ties.map((t) => t.ends) });
      }
    }
    rows.push({ T: T1, ties: i === events.length ? tiesOf(steps.length - 1) : events[i]!.below });

    const count = rows[0]!.ties.length;
    if (rows.some((r) => r.ties.length !== count)) {
      throw new EventError(`fields change between ${T0.toFixed(3)} and ${T1.toFixed(3)} K`);
    }
    for (let k = 0; k < count; k++) {
      const [p, q] = rows[0]!.ties[k]!;
      for (const side of [0, 1] as const) {
        out.push({
          phases: [p.phase, q.phase],
          side,
          points: rows.map((r) => ({ X: r.ties[k]![side].X, T: r.T })),
        });
      }
    }
  }
  return out;
}
