// The marks the two plots share at each touching point of a tangent (plan §4 item 3): the dotted
// guide line that runs between them, and the open marker on the point.

import type { Selection } from "d3";
import { MARKER_R } from "./geometry";

/** A layer of an SVG plot. */
export type Layer = Selection<SVGGElement, unknown, null, undefined>;

/** Whether a mark belongs to the stable envelope or to a metastable extension. */
export type Stability = "stable" | "metastable";

/** A value for each datum, or one for all. */
type Each<T> = number | ((d: T) => number);

/** One vertical guide line per datum in `layer`, of class `guide ${stability}`, at x from y1 to y2. */
export function joinGuides<T>(
  layer: Layer,
  data: readonly T[],
  stability: Stability,
  x: (d: T) => number,
  y1: Each<T>,
  y2: Each<T>,
): void {
  layer
    .selectAll<SVGLineElement, T>("line")
    .data(data)
    .join("line")
    .attr("class", `guide ${stability}`)
    .attr("x1", x)
    .attr("x2", x)
    .attr("y1", y1)
    .attr("y2", y2);
}

/** One marker of radius MARKER_R per touching point in `layer`, with its phase for its colour. */
export function joinMarkers<T extends { phase: string }>(
  layer: Layer,
  data: readonly T[],
  stability: Stability,
  x: (d: T) => number,
  y: Each<T>,
): void {
  layer
    .selectAll<SVGCircleElement, T>("circle")
    .data(data)
    .join("circle")
    .attr("class", `touch-marker ${stability}`)
    .attr("data-phase", (d) => d.phase)
    .attr("r", MARKER_R)
    .attr("cx", x)
    .attr("cy", y);
}
