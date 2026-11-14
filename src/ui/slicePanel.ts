// The linked slice panel under the diagram (plan §4 items 2 and 3), adapted from pTerrain's
// ui/slicePanel.ts: g_l and g_s (and a compound γ with a range) at T* minus the reference r (§2)
// on the diagram's X scale, solid on the stable envelope and dashed off it, a line compound as a
// vertical line down to its point (solid on the envelope, dashed above it with an open circle at
// its end), each stable common tangent with markers on its touching points (one where two
// tangents share it), the shading under the envelope in the diagram's field fills, a band of the
// one-phase fields' stable phase along the bottom edge (as in pTerrain; a stable line
// compound's, and its shading, widened about its point) with the fields' names over it while the
// Labels button shows them, a dotted guide line from each touching point up to the diagram, and
// the g axis fitted to T* with its lowest point clear of the band. On an invariant its three
// touching points carry its event marker and the shading under its tangent is hatched in the
// marker's colour. With the metastable branches: the dashed curves, the dashed, lighter tangents
// of the diagram's metastable extensions with their markers and guides, and the spinodal points.
// With the lever rule on, a dotted line at X₀ down to the mixture's g on the envelope, with a
// marker there.

import { area, axisLeft, axisTop, line, scaleLinear, select, type Selection } from "d3";
import { invariantAt } from "../physics/cut";
import { nameField } from "../physics/fields";
import { COMPOUND } from "../physics/gibbs";
import type { Field } from "../physics/hull";
import {
  clearBelow,
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
import { placeBandLabels, type BandLabel } from "./bandLabels";
import { setSvgName } from "./compoundText";
import {
  INVARIANT_FAMILIES,
  invariantTouches,
  joinEventMarkers,
  markerStyle,
} from "./diagram/eventMarkers";
import { formatTemperature } from "./format";
import {
  fixedOffset,
  frameBottomRight,
  MARKER_R,
  measureText,
  SLICE_MARGIN,
  TICK_SPACING,
  xOf,
  xTicks,
  type PlotSize,
} from "./geometry";
import { leverOf } from "./leverText";
import { joinGuides, joinMarkers } from "./marks";
import { attachPanel, fitSvg, placeYLabel } from "./panel";
import {
  CHECKER_CELL,
  DIAMOND_KINDS,
  fieldKind,
  KIND_COLOURS,
  TWO_PHASE_KINDS,
  type RegionKind,
} from "./regions";
import { RESIZE_MS, throttle } from "./schedule";
import type { PlotHandle } from "./diagram/phaseDiagram";
import { labelsWait, type State, type Store } from "./state";

const MARGIN = SLICE_MARGIN;

/** Height of the band of the one-phase fields along the panel's bottom edge, CSS px. */
const BAND_PX = 4;

/**
 * Width of a stable line compound's band run and shading as a fraction of the plot area's width,
 * widened from its point to show (about 12 px at the panel's usual 780 px).
 */
const COMPOUND_WIDTH = 0.016;

/** A run of the band along the bottom edge: a one-phase field over [x0, x1], px. */
interface BandRun {
  kind: RegionKind;
  /** Its phase and name, as the diagram names it. */
  phase: string;
  name: string;
  x0: number;
  x1: number;
  /** A line compound's run, widened from its point. */
  point: boolean;
}

/**
 * How far the envelope's lowest point keeps above the bottom edge, px: clear of the band, the
 * fields' names and a marker there; at most this share of the panel's height.
 */
const MIN_CLEARANCE = { px: 36, share: 0.4 } as const;

/** The names' baseline above the band, px, and their width per character before layout. */
const LABEL_LIFT = 3;
const LABEL_PX_PER_CHAR = 7;

/**
 * Appends to `defs` one checkerboard pattern per two-phase kind, ids `${prefix}-${kind}`, matching
 * the diagram's bitmap (regions.ts `paintRegions`, `checkerColour`): cells of CHECKER_CELL px in
 * the kind's two colours from the plot area's origin, turned 45° for a diamond kind. The colours
 * are opaque here; the shade carries the region opacity. The figure export's field paths use them
 * too (plan §9 phase 21).
 */
export function appendCheckerPatterns(
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

/** The hatch's period and its stripes' width, CSS px. */
const HATCH = { period: 8, stripe: 3 } as const;

/**
 * Appends to `defs` one hatch per invariant prefix, ids `${prefix}-${family}`: stripes at 45° in
 * the family's marker colour on the background, the fill under a tangent that touches three
 * phases (no other field is striped).
 */
function appendHatchPatterns(
  defs: Selection<SVGDefsElement, unknown, null, undefined>,
  prefix: string,
): void {
  for (const family of INVARIANT_FAMILIES) {
    const pattern = defs
      .append("pattern")
      .attr("id", `${prefix}-${family}`)
      .attr("class", "hatch")
      .attr("data-family", family)
      .attr("patternUnits", "userSpaceOnUse")
      .attr("patternTransform", "rotate(45)")
      .attr("width", HATCH.period)
      .attr("height", HATCH.period);
    pattern
      .append("rect")
      .attr("width", HATCH.period)
      .attr("height", HATCH.period)
      .style("fill", "var(--bg)");
    pattern
      .append("rect")
      .attr("width", HATCH.stripe)
      .attr("height", HATCH.period)
      .style("fill", `var(--invariant-${family})`);
  }
}

/**
 * The slice panel's handle for a figure export (plan §9 phase 20); `drawn` is the state it last
 * drew, which the α mode leaves on its hidden panel.
 */
export interface SliceHandle extends PlotHandle {
  drawn(): Readonly<State>;
}

/**
 * Slice panels built so far: each one's ids carry its number, unique in the page and the same on
 * every device, so that a figure export's SVG text is too (plan §9 phase 21).
 */
let panelCount = 0;

/** Builds the slice panel inside `container` and keeps it in sync with `store`. */
export function createSlicePanel(container: HTMLElement, store: Store): SliceHandle {
  const root = select(container).classed("slice-panel", true);
  const svg = root.append("svg").attr("role", "img");
  const uid = String(++panelCount);
  const defs = svg.append("defs");
  const clipRect = defs.append("clipPath").attr("id", `slice-clip-${uid}`).append("rect");
  appendCheckerPatterns(defs, `checker-${uid}`);
  appendHatchPatterns(defs, `hatch-${uid}`);
  const plot = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
  const clipped = plot.append("g").attr("clip-path", `url(#slice-clip-${uid})`);
  const shading = clipped.append("g").attr("class", "shading");
  // A stable line compound's field, a point: a strip as wide as its band run from it down.
  const compoundShade = clipped.append("g").attr("class", "shading compound-shading");
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
  // Each one-phase field's name over its run of the band, while the Labels button shows them.
  const bandLabels = plot.append("g").attr("class", "band-labels");
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

  /** The plot size the container last gave, and the one the panel last drew at. */
  let observed: PlotSize = { width: 0, height: 0 };
  let size: PlotSize = observed;
  /** Whether the last draw was a figure export's, which fixes the axes' offset. */
  let exporting = false;
  let xs: number[] = [];
  let y = scaleLinear();
  let drawn: Readonly<State> = store.state;

  /** The mixture at X₀ on the envelope (plan §4 item 7), from the top of the SVG down to it. */
  const drawLever = (state: Readonly<State>) => {
    drawn = state;
    lever.attr("display", state.showLever ? null : "none");
    if (!state.showLever) return;
    const l = leverOf(state);
    const x = xOf(l.X0, size);
    const gy = y(mixtureG(state.params, state.cut, l.X0, l.phases));
    leverGuide.attr("x1", x).attr("x2", x).attr("y1", -MARGIN.top).attr("y2", gy);
    leverMarker.attr("cx", x).attr("cy", gy);
  };

  /**
   * The one-phase fields' names over their runs of the band, measured in place; held back with the
   * diagram's field labels while a preview is drawn.
   */
  const drawBandLabels = (state: Readonly<State>, runs: readonly BandRun[]) => {
    const { compound } = state.diagram.naming;
    let placed: BandLabel[] = [];
    if (state.showFieldLabels && !labelsWait(state) && runs.length > 0) {
      const probe = bandLabels.append("text").attr("class", "band-label");
      const node = probe.node() as SVGTextElement;
      const measured = runs.map((r) => {
        setSvgName(node, r.name, compound);
        return { ...r, width: measureText(node, LABEL_PX_PER_CHAR) };
      });
      probe.remove();
      placed = placeBandLabels(measured, size.width);
    }
    bandLabels
      .selectAll<SVGTextElement, BandLabel>("text")
      .data(placed)
      .join("text")
      .attr("class", "band-label")
      .attr("data-phase", (d) => d.phase)
      .attr("x", (d) => d.x)
      .attr("y", size.height - BAND_PX - LABEL_LIFT)
      .each(function (d) {
        setSvgName(this, d.name, compound);
      });
  };

  // The g axis follows the cut, so it is redrawn with the curves.
  const drawSlice = (state: Readonly<State>) => {
    drawn = state;
    const { params, cut, atCut, metastableAtCut } = state;
    const s = slice(params, cut, atCut, xs);
    // The envelope's lowest point (a stable line compound's, too) is kept clear of the band and the
    // names over it.
    let domain = gDomain(s.min, s.barrier);
    if (size.height > 0) {
      const share = Math.min(MIN_CLEARANCE.px / size.height, MIN_CLEARANCE.share);
      domain = clearBelow(domain, s.min, share);
    }
    y = scaleLinear().domain(domain).range([size.height, 0]);
    yAxis.attr("transform", `translate(${MARGIN.left},${MARGIN.top})`).call(
      fixedOffset(axisLeft(y), exporting)
        .ticks(Math.max(2, Math.floor(size.height / TICK_SPACING)))
        .tickSizeOuter(0),
    );
    placeYLabel(yLabel.node()!, yAxis.node()!, size.height, MARGIN);
    const px = (p: SlicePoint) => xOf(p.X, size);
    const py = (p: SlicePoint) => y(p.g);
    const path = line<SlicePoint>(px, py);

    // Down to the bottom edge, in the field's fill (plan §4 item 2); on an invariant, the tie
    // lines of its three-phase tangent in the hatch of its marker's colour.
    const inv = invariantAt(state.diagram.scan.events, cut);
    const touches = distinctTouches(s.tangents);
    const onInvariant = invariantTouches(touches, inv);
    const family = onInvariant.size > 0 ? markerStyle(inv!)!.family : null;
    const [first, , last] = [...onInvariant];
    const hatched = (d: Shade) =>
      family !== null &&
      d.field.kind === "tie" &&
      d.field.ends[0].X >= first!.X - 1e-9 &&
      d.field.ends[1].X <= last!.X + 1e-9;
    const fill = area<SlicePoint>(px, size.height, py);
    shading
      .selectAll<SVGPathElement, Shade>("path")
      .data(s.shades)
      .join("path")
      .attr("class", "shade")
      .attr("data-kind", (d) => fieldKind(d.field))
      .attr("data-invariant", (d) => (hatched(d) ? family : null))
      .attr("fill", (d) => {
        if (hatched(d)) return `url(#hatch-${uid}-${family})`;
        const kind = fieldKind(d.field);
        return TWO_PHASE_KINDS.includes(kind) ? `url(#checker-${uid}-${kind})` : null;
      })
      .attr("d", (d) => fill(d.points));
    // A stable line compound's field is a point, so its run is widened about it.
    const point = compoundPointAt(params, cut, atCut);
    const { naming } = state.diagram;
    const bandRuns: BandRun[] = s.shades.flatMap((d) =>
      d.field.kind === "single"
        ? [
            {
              kind: fieldKind(d.field),
              phase: d.field.phase,
              name: nameField(naming, d.field).name,
              x0: px(d.points[0]!),
              x1: px(d.points.at(-1)!),
              point: false,
            },
          ]
        : [],
    );
    const halfWidth = (COMPOUND_WIDTH * size.width) / 2;
    if (point?.stable) {
      const x = px(point);
      const field: Field = { kind: "single", phase: COMPOUND, X: [point.X, point.X] };
      bandRuns.push({
        kind: "C",
        phase: COMPOUND,
        name: nameField(naming, field).name,
        x0: x - halfWidth,
        x1: x + halfWidth,
        point: true,
      });
      bandRuns.sort((a, b) => a.x0 - b.x0);
    }
    compoundShade
      .selectAll<SVGRectElement, CompoundPoint>("rect")
      .data(point?.stable ? [point] : [])
      .join("rect")
      .attr("class", "shade")
      .attr("data-kind", "C")
      .attr("x", (d) => px(d) - halfWidth)
      .attr("width", 2 * halfWidth)
      .attr("y", py)
      .attr("height", (d) => Math.max(0, size.height - py(d)));
    band
      .selectAll<SVGRectElement, BandRun>("rect")
      .data(bandRuns)
      .join("rect")
      .attr("data-kind", (d) => d.kind)
      .attr("x", (d) => d.x0)
      .attr("width", (d) => d.x1 - d.x0)
      .attr("y", size.height - BAND_PX)
      .attr("height", BAND_PX);
    drawBandLabels(state, bandRuns);
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

    // From the top of the SVG, which meets the guide coming down from the diagram above.
    joinGuides(guides, touches, "stable", px, -MARGIN.top, py);
    // On an invariant its three phases take its marker in place of the plain one; the diagram
    // keeps the plain ones at the ends (cutLayer.ts).
    joinMarkers(
      markers,
      touches.filter((e) => !onInvariant.has(e)),
      "stable",
      px,
      py,
    );
    joinEventMarkers(
      markers,
      "touch-symbol",
      [...onInvariant],
      () => markerStyle(inv!)!,
      px,
      py,
      () => ({ kind: inv!.kind }),
    );
    // From the panel's top down to the point; clipped where the point lies off the g axis.
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

  /** Draws the panel at `at` (a figure export's size), or at the observed size. */
  const drawAll = (state: Readonly<State> = store.state, at?: PlotSize) => {
    size = at ?? observed;
    exporting = at !== undefined;
    fitSvg(svg.node() as SVGSVGElement, size, MARGIN);
    clipRect.attr("width", size.width).attr("height", size.height);
    xs = sliceXs(size.width);
    const x = scaleLinear().domain([0, 1]).range([0, size.width]);
    xAxis
      .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`)
      .call(fixedOffset(axisTop(x), exporting).tickValues(xTicks(size.width)).tickSizeOuter(0));
    frame.attr("d", frameBottomRight(size));
    drawSlice(state);
  };

  // The α mode hides the panel (styles/plots.css) and leaves it undrawn while it moves through the
  // systems; leaving it changes the system, which draws it again.
  store.subscribe((state, prev) => {
    if (size.width === 0 || state.mode === "alpha") return;
    if (
      state.atCut !== prev.atCut ||
      state.metastableAtCut !== prev.metastableAtCut ||
      state.params !== prev.params ||
      state.showFieldLabels !== prev.showFieldLabels ||
      labelsWait(state) !== labelsWait(prev)
    ) {
      drawSlice(state);
    } else if (state.X0 !== prev.X0 || state.showLever !== prev.showLever) {
      drawLever(state);
    }
  });

  // At the diagram's pace while the window is being resized, so that the guides stay in line.
  const redraw = throttle(() => drawAll(), RESIZE_MS);
  attachPanel(container, store, (next) => {
    observed = next;
    redraw();
  });

  return {
    svg: svg.node() as SVGSVGElement,
    draw: (state, at) => drawAll(state, at),
    drawn: () => drawn,
  };
}
