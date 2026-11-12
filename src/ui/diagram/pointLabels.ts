// Each marked point's name and temperature on the diagram ("Eutectic, 634 K"), the marker's
// tooltip as text, while the Labels button's bottom half is on: in small muted text beside the
// marker, on the first side of it that no stable boundary, field label, marker, earlier name or
// the α mode's caption is in the way of.

import { select } from "d3";
import type { DiagramEvent } from "../../physics/events";
import { measureText, xOf, yOf, type PlotSize } from "../geometry";
import type { Layer } from "../marks";
import type { Box as CornerBox } from "../fieldLabels";
import type { State } from "../state";
import { placeInvariantT, type Box } from "../textLayout";
import { markedPointsOf, markerPoint, markerTitle } from "./eventMarkers";
import type { Outline } from "./fieldsLayer";

/** A name's estimated width per character before layout, CSS px (11 px text). */
const PX_PER_CHAR = 6;
/** How far a name keeps from its marker's point, CSS px: past the largest marker and its halo. */
const MARKER_INSET = 10;

/** "Eutectic, 634 K": the marker's tooltip, capitalised. */
export function pointLabel(e: DiagramEvent): string {
  const title = markerTitle(e);
  return title.charAt(0).toUpperCase() + title.slice(1);
}

const boxOutline = ([x0, y0, x1, y1]: Box): Outline => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

/**
 * Draws the names in `layer`, clear of the boundaries, the markers, the field labels' `outlines`
 * and `keepOut` (the α mode's caption, from the plot area's top-left corner).
 */
export function drawPointLabels(
  layer: Layer,
  { window, diagram }: Readonly<State>,
  size: PlotSize,
  outlines: readonly Outline[],
  keepOut: CornerBox | null = null,
): void {
  const events = markedPointsOf(diagram.scan.events);
  const at = (e: DiagramEvent): [number, number] => [
    xOf(markerPoint(e).X, size),
    yOf(e.T, window, size),
  ];
  const r = MARKER_INSET - 1;
  const lines: Outline[] = [
    ...diagram.boundaries.map((b) =>
      b.points.map((q): [number, number] => [xOf(q.X, size), yOf(q.T, window, size)]),
    ),
    ...outlines,
    ...(keepOut ? [boxOutline([0, 0, keepOut.width, keepOut.height])] : []),
    ...events.map((e) => {
      const [x, y] = at(e);
      return boxOutline([x - r, y - r, x + r, y + r]);
    }),
  ];
  layer
    .selectAll<SVGTextElement, DiagramEvent>("text")
    .data(events)
    .join("text")
    .attr("class", "point-label")
    .attr("data-kind", (e) => e.kind)
    .text(pointLabel)
    .each(function (e) {
      const [x, y] = at(e);
      const width = measureText(this, PX_PER_CHAR);
      const spot = placeInvariantT(x, y, width, size, lines, MARKER_INSET);
      select(this).attr("x", spot.x).attr("y", spot.y).attr("text-anchor", spot.anchor);
      // Later names keep clear of this one.
      const left = spot.anchor === "end" ? spot.x - width : spot.x;
      lines.push(boxOutline([left, spot.y - 8, left + width, spot.y + 3]));
    });
}
