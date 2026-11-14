// Where the slice panel names its one-phase fields: each over its run of the band along the
// bottom edge, as the diagram names them, while the Labels button shows field names.

/** A run of the band to name, plot-area px. */
export interface BandLabelRun {
  name: string;
  /** The phase, for the label's colour. */
  phase: string;
  x0: number;
  x1: number;
  /** The name's width, px. */
  width: number;
  /** A line compound's run: widened from a point, so named even where its name is wider. */
  point: boolean;
}

/** A placed name, centred on `x`. */
export interface BandLabel {
  name: string;
  phase: string;
  x: number;
  width: number;
}

/** The least space between two names, and between a name and its run's ends, px. */
export const BAND_LABEL_GAP = 4;

/** How near the plot area's side a run's end is still on it, px. */
const EDGE_PX = 0.5;

/** How far a name keeps in from the plot area's sides, px. */
export const SIDE_INSET = 2;

/**
 * The names over `runs` in a plot area `plotWidth` px wide, left to right: a line compound's and
 * a run's on either side always (a narrow α or β running into the two-phase field beside it), a
 * field's elsewhere where it fits over its run, and none over another, in that priority and then
 * the wider runs first. Each keeps SIDE_INSET inside the plot area.
 */
export function placeBandLabels(runs: readonly BandLabelRun[], plotWidth: number): BandLabel[] {
  const onSide = (r: BandLabelRun) => r.x0 <= EDGE_PX || r.x1 >= plotWidth - EDGE_PX;
  const rank = (r: BandLabelRun) => (r.point ? 2 : onSide(r) ? 1 : 0);
  const fits = (r: BandLabelRun) => rank(r) > 0 || r.width + 2 * BAND_LABEL_GAP <= r.x1 - r.x0;
  const order = runs.filter(fits).sort((a, b) => rank(b) - rank(a) || b.x1 - b.x0 - (a.x1 - a.x0));
  const placed: BandLabel[] = [];
  for (const r of order) {
    const half = r.width / 2 + SIDE_INSET;
    const x = Math.min(Math.max((r.x0 + r.x1) / 2, half), plotWidth - half);
    const clear = placed.every(
      (p) => Math.abs(p.x - x) >= (p.width + r.width) / 2 + BAND_LABEL_GAP,
    );
    if (clear) placed.push({ name: r.name, phase: r.phase, x, width: r.width });
  }
  return placed.sort((a, b) => a.x - b.x);
}
