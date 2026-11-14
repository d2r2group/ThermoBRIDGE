// The cuts of a figure series (plan §9 phase 20, added after review): from the top of the window
// down, one cut in each band of temperatures over which the fields along the cut stay the same,
// and one at each invariant's own temperature. A band's cut sits at its middle, so that it lies
// as far as it can from the cuts on either side. No DOM here.

import { invariantsOf, STEP, type DiagramEvent } from "../physics/events";
import type { PlotWindow } from "../physics/plotWindow";

/** A cut of the series: inside a band, or on an invariant. */
export interface SeriesCut {
  T: number;
  invariant: DiagramEvent | null;
}

/** A band narrower than this, K, gets no cut: its fields are those of a single scan step. */
const MIN_BAND = STEP;

/**
 * The series' cuts in `window`, T decreasing. The bands are bounded by the window's edges and by
 * the events that change the fields (melting, critical and congruent points, invariants); a band's
 * cut is its middle, rounded to whole kelvin where that keeps it inside the band.
 */
export function seriesCuts(events: readonly DiagramEvent[], window: PlotWindow): SeriesCut[] {
  const inside = events.filter((e) => e.T > window.Tmin && e.T < window.Tmax);
  const invariants = new Set(invariantsOf(inside));
  // Two events at one T bound one band, and an invariant there gets one cut.
  const bounds = [
    window.Tmax,
    ...inside
      .filter((e) => invariants.has(e) || e.sigAbove !== e.sigBelow)
      .map((e) => e.T)
      .sort((a, b) => b - a),
    window.Tmin,
  ].filter((T, k, all) => k === 0 || T !== all[k - 1]);
  const cuts: SeriesCut[] = [];
  for (let k = 0; k + 1 < bounds.length; k++) {
    const [top, bottom] = [bounds[k]!, bounds[k + 1]!];
    if (k > 0) {
      const at = [...invariants].find((e) => e.T === top);
      if (at) cuts.push({ T: at.T, invariant: at });
    }
    if (top - bottom < MIN_BAND) continue;
    const middle = 0.5 * (top + bottom);
    const rounded = Math.round(middle);
    const T = rounded > bottom && rounded < top ? rounded : middle;
    cuts.push({ T, invariant: null });
  }
  return cuts;
}

/** A cut's part of a file name: its two-digit place in the series and its T in whole kelvin. */
export function seriesName(index: number, T: number): string {
  return `${String(index + 1).padStart(2, "0")}-${Math.round(T)}K`;
}
