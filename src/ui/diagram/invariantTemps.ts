// Each invariant's temperature on the diagram (plan §4 item 1), in small muted text at the right
// end of its line, on the first side of it that no stable boundary or field label is in the way of.

import { select } from "d3";
import { invariantsOf, type DiagramEvent } from "../../physics/events";
import { formatInvariantT } from "../format";
import { measureText, xOf, yOf, type PlotSize } from "../geometry";
import type { Layer } from "../marks";
import type { State } from "../state";
import { placeInvariantT } from "../textLayout";
import type { Outline } from "./fieldsLayer";

/** An invariant temperature's estimated width per character before layout, CSS px (11 px text). */
const PX_PER_CHAR = 6;

/** Draws the temperatures in `layer`, clear of the boundaries and of the field labels' `outlines`. */
export function drawInvariantTemps(
  layer: Layer,
  { window, diagram }: Readonly<State>,
  size: PlotSize,
  outlines: readonly Outline[],
): void {
  const lines = [
    ...diagram.boundaries.map((b) =>
      b.points.map((q): [number, number] => [xOf(q.X, size), yOf(q.T, window, size)]),
    ),
    ...outlines,
  ];
  layer
    .selectAll<SVGTextElement, DiagramEvent>("text")
    .data(invariantsOf(diagram.scan.events))
    .join("text")
    .attr("class", "invariant-temperature")
    .attr("data-kind", (e) => e.kind)
    .text((e) => formatInvariantT(e.T))
    .each(function (e) {
      const spot = placeInvariantT(
        xOf(e.points[2]!.X, size),
        yOf(e.T, window, size),
        measureText(this, PX_PER_CHAR),
        size,
        lines,
      );
      select(this).attr("x", spot.x).attr("y", spot.y).attr("text-anchor", spot.anchor);
    });
}
