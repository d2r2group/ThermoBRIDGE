// The diagram's lines (plan §4 item 1): the stable boundaries (a line compound's vertical line
// among them), the dashed metastable extensions of the boundaries with liquid at one end, the
// dotted spinodals, the invariant lines, and the stable critical and congruent points as markers:
// congruent melting and a congruent transformation of a compound (§9 phase 13) too.

import { line } from "d3";
import type { Boundary } from "../../physics/boundaries";
import { invariantsOf, type DiagramEvent } from "../../physics/events";
import type { SpinodalRun } from "../../physics/spinodal";
import { MARKER_R, xOf, yOf, type PlotSize } from "../geometry";
import type { Layer } from "../marks";
import type { State } from "../state";

/** One end of a metastable extension's tie line, as a polyline in (X, T). */
interface MetastableLine {
  phases: [string, string];
  side: 0 | 1;
  points: { X: number; T: number }[];
}

/** The layers the lines go in, from the bottom up. */
export interface LineLayers {
  spinodals: Layer;
  extensions: Layer;
  boundaries: Layer;
  invariants: Layer;
  points: Layer;
}

/**
 * The stable critical points, congruent minima and maxima, and congruent transformations of a
 * compound, each drawn as a marker.
 */
export function markedPointsOf(events: readonly DiagramEvent[]): DiagramEvent[] {
  return events.filter((e) => ["critical", "minimum", "maximum", "congruent"].includes(e.kind));
}

export function drawLines(
  layers: LineLayers,
  { window, diagram }: Readonly<State>,
  size: PlotSize,
) {
  const path = line<{ X: number; T: number }>(
    (q) => xOf(q.X, size),
    (q) => yOf(q.T, window, size),
  );
  layers.spinodals
    .selectAll<SVGPathElement, SpinodalRun>("path")
    .data(diagram.spinodals)
    .join("path")
    .attr("class", "spinodal metastable")
    .attr("data-phase", (r) => r.phase)
    .attr("d", (r) => path(r.points));
  const extensions: MetastableLine[] = diagram.metastable.flatMap((m) =>
    ([0, 1] as const).map((side) => ({
      phases: m.phases,
      side,
      points: m.steps.map((st) => ({ X: st.X[side], T: st.T })),
    })),
  );
  layers.extensions
    .selectAll<SVGPathElement, MetastableLine>("path")
    .data(extensions)
    .join("path")
    .attr("class", "boundary metastable")
    .attr("data-phases", (b) => b.phases.join("+"))
    .attr("data-side", (b) => b.side)
    .attr("d", (b) => path(b.points));
  layers.boundaries
    .selectAll<SVGPathElement, Boundary>("path")
    .data(diagram.boundaries)
    .join("path")
    .attr("class", "boundary stable")
    .attr("data-phases", (b) => b.phases.join("+"))
    .attr("data-side", (b) => b.side)
    .attr("d", (b) => path(b.points));
  const events = diagram.scan.events;
  layers.invariants
    .selectAll<SVGLineElement, DiagramEvent>("line")
    .data(invariantsOf(events))
    .join("line")
    .attr("class", "invariant stable")
    .attr("data-kind", (e) => e.kind)
    .attr("x1", (e) => xOf(e.points[0]!.X, size))
    .attr("x2", (e) => xOf(e.points[2]!.X, size))
    .attr("y1", (e) => yOf(e.T, window, size))
    .attr("y2", (e) => yOf(e.T, window, size));
  layers.points
    .selectAll<SVGCircleElement, DiagramEvent>("circle")
    .data(markedPointsOf(events))
    .join("circle")
    .attr("class", "event-point")
    .attr("data-kind", (e) => e.kind)
    .attr("r", MARKER_R)
    .attr("cx", (e) => xOf(e.points[0]!.X, size))
    .attr("cy", (e) => yOf(e.T, window, size));
}
