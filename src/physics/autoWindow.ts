// The automatic window of plan §3: from 100 K below the lowest event (and not below 100 K) to
// 100 K above the highest of the melting points, the congruent maxima and a stable liquid dome's
// top, rounded out to 100 K. The events come from a scan of a provisional window that starts at
// the floor and reaches up to where the whole system is liquid; cut to the fitted window, that
// scan is the window's own, which `fitWindow` hands on so that Apply scans once.

import { EventError, scan, subScan, type DiagramEvent, type Scan } from "./events";
import { criticalT, LIQUID, sameParams, type Params } from "./gibbs";
import { holdsLiquid, HullError } from "./hull";
import type { PlotWindow } from "./plotWindow";
import { checkParams, T_LIMIT } from "./validity";

/** The lowest T_min the rule gives, K. */
export const WINDOW_FLOOR = 100;
/** The room left beyond the lowest and the highest feature, K. */
const MARGIN = 100;
/** The window's edges are multiples of this, K. */
const ROUND = 100;
/** How often the provisional window is raised before the rule gives up. */
const RAISES = 4;

const down = (T: number) => Math.floor(T / ROUND) * ROUND;
const up = (T: number) => Math.ceil(T / ROUND) * ROUND;

/**
 * The window of the rule, given the events of a scan from the floor into the all-liquid range.
 * With `liquidAtFloor` (the scan's lowest step still holds a liquid, so its lowest invariant lies
 * below the floor) the window starts at the floor.
 */
export function windowFromEvents(
  params: Params,
  events: readonly DiagramEvent[],
  liquidAtFloor = false,
): PlotWindow {
  const tops = [params.TmA, params.TmB];
  for (const e of events) {
    if (e.kind === "maximum") tops.push(e.T);
    if (e.kind === "critical" && e.points[0]?.phase === LIQUID) tops.push(e.T);
  }
  const lowest = liquidAtFloor
    ? WINDOW_FLOOR
    : Math.min(params.TmA, params.TmB, ...events.map((e) => e.T));
  return {
    Tmin: Math.max(WINDOW_FLOOR, down(lowest - MARGIN)),
    Tmax: Math.min(T_LIMIT, up(Math.max(...tops) + MARGIN)),
  };
}

/** The automatic window, and the scan of it when the rule's own scan covers it. */
export interface FittedWindow {
  window: PlotWindow;
  /**
   * The scan of `window` (`subScan` of the rule's wider scan), so that `checkSystem` and
   * `computeDiagram` need not scan it again; null when it is not to be had that way.
   */
  scan: Scan | null;
}

/** The last parameters fitted and their result: a link import fits the same ones twice. */
let last: { params: Params; fit: FittedWindow } | null = null;

/**
 * The automatic window for these parameters, ending at `T_LIMIT` at most, with its scan. For
 * parameters that `checkParams` rejects, whose scan fails, or whose scan is still not all liquid
 * at the top after `RAISES` raises, it returns the window from the melting points alone, without
 * a scan, so that `validate` on it then reports what is wrong. The last result is kept, so that
 * fitting the same parameters again costs nothing.
 */
export function fitWindow(params: Params): FittedWindow {
  if (last && sameParams(last.params, params)) return last.fit;
  const fit = fitAnew(params);
  last = { params: { ...params }, fit };
  return fit;
}

/** The automatic window for these parameters: `fitWindow`'s, without the scan. */
export function autoWindow(params: Params): PlotWindow {
  return fitWindow(params).window;
}

function fitAnew(params: Params): FittedWindow {
  const fallback = { window: windowFromEvents(params, []), scan: null };
  if (checkParams(params).length > 0) return fallback;
  // Above the melting points and the liquid's own critical point everything is usually liquid;
  // a congruent maximum can lie higher, so the scan is raised until its top step is all liquid.
  // It never scans above T_LIMIT, where the window must end anyway.
  let Tmax = Math.min(
    T_LIMIT,
    up(Math.max(params.TmA, params.TmB, criticalT(params.alphaL)) + 2 * MARGIN),
  );
  try {
    for (let k = 0; k <= RAISES; k++) {
      const scanned = scan(params, { Tmin: WINDOW_FLOOR, Tmax });
      const { steps, events } = scanned;
      if (steps.at(-1)?.sig === LIQUID || Tmax === T_LIMIT) {
        const liquidAtFloor = steps[0]!.hull.fields.some(holdsLiquid);
        const window = windowFromEvents(params, events, liquidAtFloor);
        // A maximum within MARGIN of the top puts the window's top above the scan's (c8).
        if (window.Tmax <= Tmax) return { window, scan: subScan(scanned, window) };
        Tmax = window.Tmax;
        continue;
      }
      Tmax = Math.min(T_LIMIT, up(1.5 * Tmax));
    }
  } catch (err) {
    if (!(err instanceof HullError || err instanceof EventError)) throw err;
  }
  return fallback;
}
