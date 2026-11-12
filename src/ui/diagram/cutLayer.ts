// The diagram's cut at T* (plan §1, §4 items 1 and 3), adapted from pTerrain's ui/phaseDiagram.ts:
// the line with its 44 px hit band, the draggable handle with its grip and its ping, and at each
// touching point of a tangent in the slice panel a marker on the cut and a dotted guide line down
// to the panel, lighter for a metastable one, with a stable one's X_B in bold under the X axis.
// On an invariant the middle phase has no marker of the cut's: the invariant's own is there.

import { select } from "d3";
import { invariantAt } from "../../physics/cut";
import type { TieEnd } from "../../physics/hull";
import { touchingXs } from "../../physics/slice";
import { attachCutDrag } from "../cutDrag";
import { formatTemperature, formatX } from "../format";
import { CUT_KNOB_R, HIT_BAND, MARGIN, measureText, xOf, yOf, type PlotSize } from "../geometry";
import { HANDLE_GRIP } from "../icons";
import { joinGuides, joinMarkers, type Layer } from "../marks";
import type { State, Store } from "../state";
import { spreadApart } from "../textLayout";
import { invariantTouches } from "./eventMarkers";

/** Least space between two bold X_B values, CSS px. */
const VALUE_GAP = 6;
/** A bold value's estimated width per character before layout, CSS px (12 px text). */
const VALUE_PX_PER_CHAR = 7;

/** A bold X_B value under the X axis, at the plot-area x of its touching point. */
interface BoldValue {
  x: number;
  text: string;
}

/** The layers the cut draws in: its own group, and those it shares with the lever's. */
export interface CutLayers {
  cut: Layer;
  guides: Layer;
  metastableGuides: Layer;
  markers: Layer;
  metastableMarkers: Layer;
  /** Over the markers, so that the handle covers a touching point at the cut's right end. */
  handle: Layer;
  /** Under the X axis, in the SVG's coordinates shifted to the plot area's bottom left. */
  values: Layer;
}

/**
 * Builds the cut in `layers.cut` and its handle in `layers.handle`, and lets it be dragged in `svg`
 * (`attachCutDrag`); returns its drawer.
 */
export function createCutLayer(
  layers: CutLayers,
  svg: SVGSVGElement,
  store: Store,
  size: () => PlotSize,
): (state: Readonly<State>, size: PlotSize) => void {
  const cutLine = layers.cut.append("line").attr("class", "cut-line").attr("aria-hidden", "true");
  const cutHit = layers.cut
    .append("line")
    .attr("class", "cut-hit")
    .attr("stroke-width", HIT_BAND)
    .attr("aria-hidden", "true");
  const handle = layers.handle
    .append("g")
    .attr("class", "cut-handle")
    .attr("role", "slider")
    .attr("tabindex", 0)
    .attr("aria-orientation", "vertical")
    .attr("aria-label", "Cut line, T* (K)");
  // A finger-sized invisible target around the visible knob (plan §4.2).
  handle
    .append("circle")
    .attr("class", "cut-handle-target")
    .attr("r", HIT_BAND / 2);
  attachCutHint(handle.node() as SVGGElement);
  // A solid knob with an up/down grip, as in pTerrain, so it reads as a control rather than a
  // data point.
  const face = handle.append("g").attr("class", "cut-handle-face");
  face.append("circle").attr("class", "cut-handle-knob").attr("r", CUT_KNOB_R);
  face.append("path").attr("class", "cut-handle-grip").attr("d", HANDLE_GRIP);

  attachCutDrag(
    svg,
    [cutHit.node() as SVGLineElement, handle.node() as SVGGElement],
    handle.node() as SVGGElement,
    store,
    size,
  );

  return (state, size) => {
    const { window, cut: T } = state;
    const y = yOf(T, window, size);
    for (const l of [cutLine, cutHit]) {
      l.attr("x1", 0).attr("x2", size.width).attr("y1", y).attr("y2", y);
    }
    handle
      .attr("transform", `translate(${size.width},${y})`)
      .attr("aria-valuemin", window.Tmin)
      .attr("aria-valuemax", window.Tmax)
      .attr("aria-valuenow", T)
      .attr("aria-valuetext", formatTemperature(T));
    drawTouches(layers, state, size);
  };
}

/**
 * At each touching point of a stable tangent (plan §4 item 3): a marker on the cut, a guide
 * line from it down to the slice panel, and its X_B in bold under the X axis, centred on the
 * guide and pushed apart from its neighbours, with a tick mark at the true x.
 */
function drawTouches(
  layers: CutLayers,
  { window, cut: T, atCut, metastableAtCut, diagram }: Readonly<State>,
  size: PlotSize,
): void {
  const touches = touchingXs(atCut);
  const y = yOf(T, window, size);
  const px = (e: TieEnd) => xOf(e.X, size);
  const bottom = size.height + MARGIN.bottom;
  const metaTouches = metastableAtCut.flatMap((m) => m.at);
  // On an invariant its middle phase has no plain marker, stable or metastable (the extensions
  // start there): the invariant's own lies there.
  const middle = [...invariantTouches(touches, invariantAt(diagram.scan.events, T))][1];
  const offMiddle = (e: TieEnd) => !middle || Math.abs(e.X - middle.X) > 1e-6;
  joinGuides(layers.metastableGuides, metaTouches, "metastable", px, y, bottom);
  joinMarkers(layers.metastableMarkers, metaTouches.filter(offMiddle), "metastable", px, y);
  joinGuides(layers.guides, touches, "stable", px, y, bottom);
  joinMarkers(
    layers.markers,
    touches.filter((e) => e !== middle),
    "stable",
    px,
    y,
  );

  // Two touching points that would show the same value within a pixel get one.
  const items: BoldValue[] = [];
  for (const e of touches) {
    const x = px(e);
    const text = formatX(e.X);
    if (!items.some((v) => v.text === text && Math.abs(v.x - x) < 1)) items.push({ x, text });
  }
  const { values } = layers;
  values
    .selectAll<SVGLineElement, BoldValue>("line")
    .data(items)
    .join("line")
    .attr("class", "bold-tick")
    .attr("x1", (v) => v.x)
    .attr("x2", (v) => v.x)
    .attr("y2", 6);
  // Each value sits on a patch of the background, which hides the guide line beneath it.
  const groups = values
    .selectAll<SVGGElement, BoldValue>("g.bold-value")
    .data(items)
    .join((enter) => {
      const g = enter.append("g").attr("class", "bold-value");
      g.append("rect");
      g.append("text").attr("y", 9).attr("dy", "0.71em");
      return g;
    });
  const texts = groups.select<SVGTextElement>("text").text((v) => v.text);
  const widths = texts.nodes().map((el) => measureText(el, VALUE_PX_PER_CHAR));
  const placed = spreadApart(
    items.map((v) => v.x),
    widths,
    VALUE_GAP,
    [-MARGIN.left, size.width + MARGIN.right],
  );
  groups.attr("transform", (_, k) => `translate(${placed[k]!},0)`);
  groups
    .select("rect")
    .attr("x", (_, k) => -0.5 * widths[k]! - 2)
    .attr("width", (_, k) => widths[k]! + 4)
    .attr("y", 7)
    .attr("height", 14);
}

/**
 * Pings a ring behind the cut handle (CSS, without reduced motion) until it first gets focus,
 * which a drag of the cut or the handle gives it too. It comes back on every page load.
 */
function attachCutHint(handle: SVGGElement): void {
  const ring = select(handle)
    .append("circle")
    .attr("class", "cut-handle-ping")
    .attr("r", CUT_KNOB_R);
  handle.addEventListener("focus", () => ring.remove(), { once: true });
}
