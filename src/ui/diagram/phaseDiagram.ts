// The T-X phase diagram (plan §4 item 1), adapted from pTerrain's ui/phaseDiagram.ts: the SVG with
// its layers from the bottom up, the axes with the component names under the ends of the X axis,
// the plot size, and the subscription that redraws what a change touches. The layers draw
// themselves: the field fills and labels (fieldsLayer.ts), the lines (linesLayer.ts), the
// invariant temperatures (invariantTemps.ts), the cut (cutLayer.ts) and the lever rule
// (leverLayer.ts).

import { axisBottom, axisLeft, scaleLinear, select } from "d3";
import { AXIS_LABELS, setAxisLabel } from "../axisLabels";
import {
  CUT_KNOB_R,
  frameTopRight,
  LEVER_KNOB_R,
  MARGIN,
  TICK_SPACING,
  X_LABEL_INSET,
  xOf,
  xTicks,
  Y_LABEL_X,
  type PlotSize,
} from "../geometry";
import { attachPanel, fitSvg } from "../panel";
import { RESIZE_MS, throttle } from "../schedule";
import type { State, Store } from "../state";
import { onThemeChange } from "../theme";
import { createCutLayer } from "./cutLayer";
import { createFieldsLayer } from "./fieldsLayer";
import { drawInvariantTemps } from "./invariantTemps";
import { createLeverLayer } from "./leverLayer";
import { drawLines } from "./linesLayer";

/** Builds the diagram inside `container` and keeps it in sync with `store`. */
export function createPhaseDiagram(container: HTMLElement, store: Store): void {
  const root = select(container).classed("phase-diagram", true);
  const canvas = root.append("canvas").attr("class", "regions").attr("aria-hidden", "true");
  // A group, not an image: the children of role="img" are presentational, which would hide the
  // two sliders (the cut's handle and the lever's knob). Every other layer is aria-hidden.
  const svg = root
    .append("svg")
    .attr("role", "group")
    .attr("aria-label", "T-X phase diagram with a horizontal cut");
  const svgNode = svg.node() as SVGSVGElement;
  const plot = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  const axes = svg.append("g").attr("class", "axes").attr("aria-hidden", "true");
  const xAxis = axes.append("g").attr("class", "axis x-axis");
  const yAxis = axes.append("g").attr("class", "axis y-axis");
  const xLabel = axes.append<SVGTextElement>("text").attr("class", "axis-label x-label");
  const yLabel = axes.append<SVGTextElement>("text").attr("class", "axis-label y-label");
  const nameA = axes.append("text").attr("class", "component-name").attr("data-end", "A");
  const nameB = axes.append("text").attr("class", "component-name").attr("data-end", "B");
  // Over the X axis, so that their background patches hide the guide lines beneath them.
  const values = axes.append("g").attr("class", "bold-values");
  const frame = plot.append("path").attr("class", "frame").attr("aria-hidden", "true");
  /** A layer of the plot that is graphics only, hidden from screen readers. */
  const layer = (cls: string) => plot.append("g").attr("class", cls).attr("aria-hidden", "true");
  const labelLayer = layer("field-labels");
  const lineLayers = {
    spinodals: layer("spinodals"),
    extensions: layer("extensions"),
    boundaries: layer("boundaries"),
    invariants: layer("invariants"),
  };
  // A line compound's name, on a patch that hides the lines beneath it.
  const compoundLabelLayer = layer("compound-labels");
  const invariantTLayer = layer("invariant-temperatures");
  const points = layer("event-points");
  // Guide lines run from the cut down to the bottom of the SVG, where the slice panel's go on;
  // the metastable ones under the stable ones.
  const metastableGuides = layer("guides");
  const guides = layer("guides");
  const cutGroup = plot.append("g").attr("class", "cut");
  // The lever rule (plan §4 item 7), over the cut; its knob is in a layer of its own at the top.
  const leverGroup = plot.append("g").attr("class", "lever");
  const metastableMarkers = layer("markers");
  const markers = layer("markers");
  // The cut's handle over the markers, which it would otherwise lie under at X = 1. Not
  // aria-hidden: the handle is a slider.
  const handleGroup = plot.append("g").attr("class", "cut-handle-layer");
  // The lever's knob over the cut's handle, so that it takes the pointer first.
  const leverKnobGroup = plot.append("g").attr("class", "lever-knob-layer");

  let size: PlotSize = { width: 0, height: 0 };
  const getSize = () => size;
  const fields = createFieldsLayer(container, canvas, labelLayer, compoundLabelLayer);
  const drawCut = createCutLayer(
    {
      cut: cutGroup,
      guides,
      metastableGuides,
      markers,
      metastableMarkers,
      handle: handleGroup,
      values,
    },
    svgNode,
    store,
    getSize,
  );
  const drawLeverKnob = createLeverLayer(leverGroup, leverKnobGroup, svgNode, store, getSize);
  /**
   * Draws the lever rule, and hides the cut's handle while the lever's knob overlaps it at the
   * cut's right end (styles/plots.css), until the knob moves away.
   */
  const drawLever = (state: Readonly<State>, size: PlotSize) => {
    drawLeverKnob(state, size);
    const covered = state.showLever && size.width - xOf(state.X0, size) < CUT_KNOB_R + LEVER_KNOB_R;
    handleGroup.classed("covered", covered);
  };

  const drawAxes = ({ window, components }: Readonly<State>) => {
    const x = scaleLinear().domain([0, 1]).range([0, size.width]);
    const y = scaleLinear().domain([window.Tmin, window.Tmax]).range([size.height, 0]);
    xAxis.attr("transform", `translate(${MARGIN.left},${MARGIN.top + size.height})`);
    // Tick marks only: the slice panel's top axis right under this one carries the numbers, so
    // the row under the diagram is left to the bold values (plan §4 item 1).
    xAxis.call(
      axisBottom(x)
        .tickValues(xTicks(size.width))
        .tickFormat(() => "")
        .tickSizeOuter(0),
    );
    yAxis.attr("transform", `translate(${MARGIN.left},${MARGIN.top})`).call(
      axisLeft(y)
        .ticks(Math.floor(size.height / TICK_SPACING))
        .tickFormat((v) => String(v))
        .tickSizeOuter(0),
    );
    const labelY = MARGIN.top + size.height + MARGIN.bottom - X_LABEL_INSET;
    xLabel.attr("x", MARGIN.left + size.width / 2).attr("y", labelY);
    setAxisLabel(xLabel.node() as SVGTextElement, AXIS_LABELS.X);
    // The component names under the two ends of the X axis.
    nameA.attr("x", MARGIN.left).attr("y", labelY).text(components.A);
    nameB
      .attr("x", MARGIN.left + size.width)
      .attr("y", labelY)
      .text(components.B);
    yLabel.attr("transform", `translate(${Y_LABEL_X},${MARGIN.top + size.height / 2}) rotate(-90)`);
    setAxisLabel(yLabel.node() as SVGTextElement, AXIS_LABELS.T);
    values.attr("transform", `translate(${MARGIN.left},${MARGIN.top + size.height})`);
  };

  const drawAll = () => {
    const state = store.state;
    fitSvg(svgNode, size, MARGIN);
    frame.attr("d", frameTopRight(size));
    fields.paint(state, size);
    // The invariant temperatures keep clear of the field labels, so these go first.
    const outlines = fields.drawLabels(state, size);
    drawLines({ ...lineLayers, points }, state, size);
    drawInvariantTemps(invariantTLayer, state, size, outlines);
    drawAxes(state);
    drawCut(state, size);
    drawLever(state, size);
  };

  store.subscribe((state, prev) => {
    if (size.width === 0) return;
    if (state.diagram !== prev.diagram || state.components !== prev.components) drawAll();
    else if (
      state.cut !== prev.cut ||
      state.atCut !== prev.atCut ||
      state.metastableAtCut !== prev.metastableAtCut
    ) {
      drawCut(state, size);
      drawLever(state, size);
    } else if (state.X0 !== prev.X0 || state.showLever !== prev.showLever) {
      drawLever(state, size);
    }
  });

  // While the window is being resized, the raster and the labels are redone at most every
  // RESIZE_MS, and once more at the end; the slice panel keeps the same pace.
  const redraw = throttle(drawAll, RESIZE_MS);
  attachPanel(container, store, (next) => {
    size = next;
    redraw();
  });

  // The region colours come from CSS, so a theme change repaints the bitmap.
  onThemeChange(() => {
    if (size.width > 0) fields.paint(store.state, size);
  });

  // The bold values, the field labels and the invariant temperatures are sized from their
  // measured text, so once Lato has loaded (it swaps in for a fallback font) they are measured
  // and placed again.
  void document.fonts?.ready.then(() => {
    if (size.width === 0) return;
    const state = store.state;
    drawInvariantTemps(invariantTLayer, state, size, fields.drawLabels(state, size));
    drawCut(state, size);
    drawLever(state, size);
  });
}
