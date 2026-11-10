// The linked slice panel under the diagram (plan §4 items 2 and 3), adapted from pTerrain's
// ui/slicePanel.ts: g_l and g_s (and a compound γ with a range) at T* minus the reference r (§2)
// on the diagram's X scale, solid on the stable envelope and dashed off it, a line compound as a
// vertical line down to its point (solid on the envelope, dashed above it with an open circle at
// its end), each stable common
// tangent with markers on its
// touching points (one where two tangents share it), the shading under the envelope in the
// diagram's field fills, a band of the one-phase fields' stable phase along the bottom edge (as in
// pTerrain), a dotted guide line from each touching point up to the diagram, and the g axis
// fitted to T*. With the
// metastable branches: the dashed curves, the dashed, lighter tangents of the diagram's
// metastable extensions with their markers and guides, and the spinodal points. With the lever
// rule on, a dotted line at X₀ down to the mixture's g on the envelope, with a marker there.

import { area, axisLeft, axisTop, line, scaleLinear, select, type Selection } from "d3";
import {
  compoundPointAt,
  distinctTouches,
  gDomain,
  mixtureG,
  relativeG,
  slice,
  sliceXs,
  tangentsOf,
  type CompoundPoint,
  type CurveRun,
  type Shade,
  type SlicePoint,
  type Tangent,
} from "../physics/slice";
import { spinodalPointsAt } from "../physics/spinodal";
import { AXIS_LABELS, setAxisLabel } from "./axisLabels";
import { formatTemperature } from "./format";
import {
  frameBottomRight,
  MARKER_R,
  SLICE_MARGIN,
  TICK_SPACING,
  xOf,
  xTicks,
  Y_LABEL_X,
  type PlotSize,
} from "./geometry";
import { leverOf } from "./leverText";
import { joinGuides, joinMarkers } from "./marks";
import { attachPanel, fitSvg } from "./panel";
import { CHECKER_CELL, DIAMOND_KINDS, fieldKind, KIND_COLOURS, TWO_PHASE_KINDS } from "./regions";
import { RESIZE_MS, throttle } from "./schedule";
import type { State, Store } from "./state";

const MARGIN = SLICE_MARGIN;

/** Height of the band of the one-phase fields along the panel's bottom edge, CSS px. */
const BAND_PX = 4;

/**
 * Appends to `defs` one checkerboard pattern per two-phase kind, ids `${prefix}-${kind}`, matching
 * the diagram's bitmap (regions.ts `paintRegions`, `checkerColour`): cells of CHECKER_CELL px in
 * the kind's two colours from the plot area's origin, turned 45° for a diamond kind. The colours
 * are opaque here; the shade carries the region opacity.
 */
function appendCheckerPatterns(
  defs: Selection<SVGDefsElement, unknown, null, undefined>,
  prefix: string,
): void {
  const tile = 2 * CHECKER_CELL; // one whole repeat of the cells
  // The second colour's cells: those whose column and row indices differ in parity.
  const cells =
    `M${CHECKER_CELL},0h${CHECKER_CELL}v${CHECKER_CELL}h${-CHECKER_CELL}Z` +
    `M0,${CHECKER_CELL}h${CHECKER_CELL}v${CHECKER_CELL}h${-CHECKER_CELL}Z`;
  for (const kind of TWO_PHASE_KINDS) {
    const [a, b] = KIND_COLOURS[kind];
    const pattern = defs
      .append("pattern")
      .attr("id", `${prefix}-${kind}`)
      .attr("class", "checker")
      .attr("data-kind", kind)
      .attr("patternUnits", "userSpaceOnUse")
      .attr("patternTransform", DIAMOND_KINDS.includes(kind) ? "rotate(45)" : null)
      .attr("width", tile)
      .attr("height", tile);
    pattern.append("rect").attr("width", tile).attr("height", tile).style("fill", `var(${a})`);
    pattern.append("path").attr("d", cells).style("fill", `var(${b})`);
  }
}

/** Builds the slice panel inside `container` and keeps it in sync with `store`. */
export function createSlicePanel(container: HTMLElement, store: Store): void {
  const root = select(container).classed("slice-panel", true);
  const svg = root.append("svg").attr("role", "img");
  const uid = Math.random().toString(36).slice(2);
  const defs = svg.append("defs");
  const clipRect = defs.append("clipPath").attr("id", `slice-clip-${uid}`).append("rect");
  appendCheckerPatterns(defs, `checker-${uid}`);
  const plot = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  const clipped = plot.append("g").attr("clip-path", `url(#slice-clip-${uid})`);
  const shading = clipped.append("g").attr("class", "shading");
  // Along the bottom edge, the stable phase's curve colour over each one-phase run, also where
  // the envelope is off the panel; nothing under a tangent.
  const band = clipped.append("g").attr("class", "stable-band");
  const curves = clipped.append("g").attr("class", "curves");
  const metastableTangents = clipped.append("g").attr("class", "tangents");
  const tangents = clipped.append("g").attr("class", "tangents");
  const spinodalPoints = clipped.append("g").attr("class", "spinodal-points");
  // A metastable touching point can lie above the g axis, so its marker is clipped too.
  const metastableMarkers = clipped.append("g").attr("class", "markers");
  const frame = plot.append("path").attr("class", "frame");
  // The metastable guides under the stable ones.
  const metastableGuides = plot.append("g").attr("class", "guides");
  const guides = plot.append("g").attr("class", "guides");
  // A line compound: a vertical line down to its point, the limit of an ever narrower curve. Over
  // the guides, which run down the same X to a stable point, and under the markers; clipped, since
  // the point can lie off the g axis.
  const compoundLine = plot
    .append("g")
    .attr("class", "compound-line-layer")
    .attr("clip-path", `url(#slice-clip-${uid})`);
  const markers = plot.append("g").attr("class", "markers");
  const lever = plot.append("g").attr("class", "lever");
  const leverGuide = lever.append("line").attr("class", "guide lever");
  const leverMarker = lever
    .append("circle")
    .attr("class", "lever-marker")
    .attr("r", MARKER_R + 0.5);
  const axes = svg.append("g").attr("class", "axes");
  // The X axis is on top, under the diagram's own X-axis label, which names it too.
  const xAxis = axes.append("g").attr("class", "axis x-axis");
  const yAxis = axes.append("g").attr("class", "axis y-axis");
  const yLabel = axes.append<SVGTextElement>("text").attr("class", "axis-label y-label");
  setAxisLabel(yLabel.node() as SVGTextElement, AXIS_LABELS.G);

  let size: PlotSize = { width: 0, height: 0 };
  let xs: number[] = [];
  let y = scaleLinear();

  /** The mixture at X₀ on the envelope (plan §4 item 7), from the top of the SVG down to it. */
  const drawLever = (state: Readonly<State>) => {
    lever.attr("display", state.showLever ? null : "none");
    if (!state.showLever) return;
    const l = leverOf(state);
    const x = xOf(l.X0, size);
    const gy = y(mixtureG(state.params, state.cut, l.X0, l.phases));
    leverGuide.attr("x1", x).attr("x2", x).attr("y1", -MARGIN.top).attr("y2", gy);
    leverMarker.attr("cx", x).attr("cy", gy);
  };

  // The g axis follows the cut, so it is redrawn with the curves.
  const drawSlice = (state: Readonly<State>) => {
    const { params, cut, atCut, metastableAtCut } = state;
    const s = slice(params, cut, atCut, xs);
    y = scaleLinear().domain(gDomain(s.min)).range([size.height, 0]);
    yAxis.attr("transform", `translate(${MARGIN.left},${MARGIN.top})`).call(
      axisLeft(y)
        .ticks(Math.max(2, Math.floor(size.height / TICK_SPACING)))
        .tickSizeOuter(0),
    );
    const px = (p: SlicePoint) => xOf(p.X, size);
    const py = (p: SlicePoint) => y(p.g);
    const path = line<SlicePoint>(px, py);

    // Down to the bottom edge, in the field's fill (plan §4 item 2).
    const fill = area<SlicePoint>(px, size.height, py);
    shading
      .selectAll<SVGPathElement, Shade>("path")
      .data(s.shades)
      .join("path")
      .attr("class", "shade")
      .attr("data-kind", (d) => fieldKind(d.field))
      .attr("fill", (d) => {
        const kind = fieldKind(d.field);
        return TWO_PHASE_KINDS.includes(kind) ? `url(#checker-${uid}-${kind})` : null;
      })
      .attr("d", (d) => fill(d.points));
    band
      .selectAll<SVGRectElement, Shade>("rect")
      .data(s.shades.filter((d) => d.field.kind === "single"))
      .join("rect")
      .attr("data-kind", (d) => fieldKind(d.field))
      .attr("x", (d) => px(d.points[0]!))
      .attr("width", (d) => px(d.points.at(-1)!) - px(d.points[0]!))
      .attr("y", size.height - BAND_PX)
      .attr("height", BAND_PX);
    // The runs off the envelope first, so the envelope is drawn over them.
    const runs = [...s.runs].sort((a, b) => Number(a.stable) - Number(b.stable));
    curves
      .selectAll<SVGPathElement, CurveRun>("path")
      .data(runs)
      .join("path")
      .attr("class", (d) => `curve ${d.stable ? "stable" : "metastable"}`)
      .attr("data-phase", (d) => d.phase)
      .attr("d", (d) => path(d.points));
    tangents
      .selectAll<SVGPathElement, Tangent>("path")
      .data(s.tangents)
      .join("path")
      .attr("class", "tangent stable")
      .attr("data-points", (d) => d.points.length)
      .attr("d", (d) => path(d.points));

    const meta = tangentsOf(
      params,
      cut,
      metastableAtCut.map((m) => m.at),
    );
    metastableTangents
      .selectAll<SVGPathElement, Tangent>("path")
      .data(meta)
      .join("path")
      .attr("class", "tangent metastable")
      .attr("d", (d) => path(d.points));
    const metaTouches = meta.flatMap((t) => t.points);
    // Down to the top of the point's marker (drawn under the guides, since it is clipped), or to
    // the panel's edge when the point lies off the g axis.
    joinGuides(metastableGuides, metaTouches, "metastable", px, -MARGIN.top, (d) =>
      Math.min(size.height, Math.max(0, py(d) - MARKER_R)),
    );
    joinMarkers(metastableMarkers, metaTouches, "metastable", px, py);
    const rel = relativeG(params, cut);
    spinodalPoints
      .selectAll<SVGCircleElement, SlicePoint & { phase: string }>("circle")
      .data(spinodalPointsAt(params, cut, atCut).map((e) => ({ ...e, g: rel(e) })))
      .join("circle")
      .attr("class", "spinodal-point metastable")
      .attr("data-phase", (d) => d.phase)
      .attr("r", 3)
      .attr("cx", px)
      .attr("cy", py);

    const touches = distinctTouches(s.tangents);
    // From the top of the SVG, which meets the guide coming down from the diagram above.
    joinGuides(guides, touches, "stable", px, -MARGIN.top, py);
    joinMarkers(markers, touches, "stable", px, py);
    // From the panel's top down to the point; clipped where the point lies off the g axis.
    const point = compoundPointAt(params, cut, atCut);
    compoundLine
      .selectAll<SVGLineElement, CompoundPoint>("line")
      .data(point ? [point] : [])
      .join("line")
      .attr("class", (d) => `compound-line ${d.stable ? "stable" : "metastable"}`)
      .attr("x1", px)
      .attr("x2", px)
      .attr("y1", 0)
      .attr("y2", py);
    // Above the envelope, a small open circle marks the dashed line's end, its g.
    compoundLine
      .selectAll<SVGCircleElement, CompoundPoint>("circle")
      .data(point && !point.stable ? [point] : [])
      .join("circle")
      .attr("class", "compound-end metastable")
      .attr("r", 3)
      .attr("cx", px)
      .attr("cy", py);

    svg.attr("aria-label", `Gibbs energy curves and common tangents at ${formatTemperature(cut)}`);
    drawLever(state);
  };

  const drawAll = () => {
    fitSvg(svg.node() as SVGSVGElement, size, MARGIN);
    clipRect.attr("width", size.width).attr("height", size.height);
    xs = sliceXs(size.width);
    const x = scaleLinear().domain([0, 1]).range([0, size.width]);
    xAxis
      .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`)
      .call(axisTop(x).tickValues(xTicks(size.width)).tickSizeOuter(0));
    frame.attr("d", frameBottomRight(size));
    yLabel.attr("transform", `translate(${Y_LABEL_X},${MARGIN.top + size.height / 2}) rotate(-90)`);
    drawSlice(store.state);
  };

  store.subscribe((state, prev) => {
    if (size.width === 0) return;
    if (
      state.atCut !== prev.atCut ||
      state.metastableAtCut !== prev.metastableAtCut ||
      state.params !== prev.params
    ) {
      drawSlice(state);
    } else if (state.X0 !== prev.X0 || state.showLever !== prev.showLever) {
      drawLever(state);
    }
  });

  // At the diagram's pace while the window is being resized, so that the guides stay in line.
  const redraw = throttle(drawAll, RESIZE_MS);
  attachPanel(container, store, (next) => {
    size = next;
    redraw();
  });
}
