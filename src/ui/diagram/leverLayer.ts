// The lever rule on the diagram (plan §4 item 7): with the lever rule on, a knob on the cut at X₀
// with a guide down to the slice panel, dragged along the cut or stepped from the keyboard, in
// a two-phase field the bold tie line through it with each arm labelled with the share of the
// phase at its other end, and the phases with their X_B and shares on one line in the top left.

import { attachAxisDrag } from "../axisDrag";
import { appendSvgName, setSvgName } from "../compoundText";
import { HIT_BAND, LEVER_KNOB_R, MARGIN, measureText, xOf, yOf, type PlotSize } from "../geometry";
import { leverArms, leverOf, leverRows, type LeverArm } from "../leverText";
import type { Layer } from "../marks";
import type { State, Store } from "../state";
import { spreadApart } from "../textLayout";

/** The arm labels' baseline above the cut, CSS px (below it, near the top edge). */
const ARM_LABEL_ABOVE = 11;
const ARM_LABEL_BELOW = 22;
/** Least space between the two arm labels, CSS px. */
const ARM_LABEL_GAP = 8;
/** An arm label's estimated width per character before layout, CSS px (12 px text). */
const ARM_PX_PER_CHAR = 7;
/** The summary line's left edge and baseline inside the plot area's top-left corner, CSS px. */
const SUMMARY_X = 6;
const SUMMARY_Y = 16;
/** Between two phases on the summary line. */
const SUMMARY_SEP = "  ·  ";

const SVG_NS = "http://www.w3.org/2000/svg";

/** A tspan of `text` with class `cls`, shifted down by `dy` em. */
function tspan(text: string, cls?: string, dy = 0): SVGTSpanElement {
  const span = document.createElementNS(SVG_NS, "tspan");
  span.textContent = text;
  if (cls) span.classList.add(cls);
  if (dy) span.setAttribute("dy", `${dy}em`);
  return span;
}

/**
 * Fills `el` with the lever's phases on one line, as the side column lists them: "L, X_B =
 * 0.412: 37 %  ·  α, X_B = 0.123: 63 %", "L: 100 %" in a one-phase field, no shares at an
 * invariant. A subscript is lowered 0.25 em and the next tspan restores the baseline.
 */
function setSummary(el: SVGTextElement, state: Readonly<State>): void {
  const l = leverOf(state);
  el.replaceChildren();
  let lowered = false;
  const add = (text: string, cls?: string, sub = false) => {
    el.append(tspan(text, cls, sub === lowered ? 0 : sub ? 0.25 : -0.25));
    lowered = sub;
  };
  leverRows(l).forEach((row, k) => {
    if (k > 0) add(SUMMARY_SEP);
    const name = tspan("", "lever-phase");
    el.append(name);
    lowered = appendSvgName(name, row.name, state.diagram.naming.compound);
    if (l.kind !== "single") {
      add(", ");
      add("X", "symbol");
      add("B", "sub", true);
      add(` = ${row.X}`);
    }
    if (row.share !== null) add(`: ${row.share}`);
  });
}

/**
 * X₀ after pressing `key` on the knob, or null for a key that does not move it: arrows step it by
 * 0.01, Page Up/Down by 0.1, Home/End go to 0 and 1. The store clamps the result into [0, 1].
 */
export function x0AfterKey(key: string, X0: number): number | null {
  const step: Record<string, number> = {
    ArrowRight: 0.01,
    ArrowUp: 0.01,
    ArrowLeft: -0.01,
    ArrowDown: -0.01,
    PageUp: 0.1,
    PageDown: -0.1,
  };
  if (key === "Home") return 0;
  if (key === "End") return 1;
  if (!Object.hasOwn(step, key)) return null;
  // Rounded, so that steps from 0.5 land on 0.51 rather than 0.51000000000000001.
  return Math.round((X0 + step[key]!) * 1e6) / 1e6;
}

/**
 * Lets the knob be dragged along the cut inside `svg` and stepped from the keyboard, on the cut's
 * own drag (`attachAxisDrag`), with the offset in X. `svg` has the class `lever-dragging` during a
 * drag.
 */
function attachLeverDrag(
  svg: SVGSVGElement,
  knob: SVGGElement,
  store: Store,
  size: () => PlotSize,
): void {
  attachAxisDrag({
    svg,
    targets: [knob],
    focus: knob,
    axis: "x",
    toValue: (x) => x / size().width,
    value: () => store.state.X0,
    keyStep: x0AfterKey,
    onChange: (X) => store.setX0(X),
    draggingClass: "lever-dragging",
  });
}

/**
 * Builds the lever rule in `group` and its knob in `knobLayer`, over the cut's handle so that the
 * knob takes the pointer first, and lets the knob be dragged in `svg`; returns its drawer.
 */
export function createLeverLayer(
  group: Layer,
  knobLayer: Layer,
  svg: SVGSVGElement,
  store: Store,
  size: () => PlotSize,
): (state: Readonly<State>, size: PlotSize) => void {
  const guide = group.append("line").attr("class", "guide lever").attr("aria-hidden", "true");
  const tieLine = group.append("line").attr("class", "lever-tie").attr("aria-hidden", "true");
  const armLayer = group.append("g").attr("class", "lever-arms").attr("aria-hidden", "true");
  // The side column's readout and the screen-reader line say the same, so this is hidden from
  // screen readers.
  const summary = group
    .append<SVGTextElement>("text")
    .attr("class", "lever-summary")
    .attr("aria-hidden", "true")
    .attr("x", SUMMARY_X)
    .attr("y", SUMMARY_Y);
  const knob = knobLayer
    .append("g")
    .attr("class", "lever-knob")
    .attr("role", "slider")
    .attr("tabindex", 0)
    .attr("aria-orientation", "horizontal")
    .attr("aria-label", "Overall composition X₀")
    .attr("aria-valuemin", 0)
    .attr("aria-valuemax", 1);
  knob
    .append("circle")
    .attr("class", "lever-knob-target")
    .attr("r", HIT_BAND / 2);
  knob.append("circle").attr("class", "lever-knob-dot").attr("r", LEVER_KNOB_R);
  attachLeverDrag(svg, knob.node() as SVGGElement, store, size);

  // The arm labels are pushed apart when they would meet.
  return (state, size) => {
    for (const g of [group, knobLayer]) g.attr("display", state.showLever ? null : "none");
    if (!state.showLever) return;
    const l = leverOf(state);
    setSummary(summary.node()!, state);
    const y = yOf(state.cut, state.window, size);
    const x0 = xOf(l.X0, size);
    guide
      .attr("x1", x0)
      .attr("x2", x0)
      .attr("y1", y)
      .attr("y2", size.height + MARGIN.bottom);
    knob
      .attr("transform", `translate(${x0},${y})`)
      .attr("aria-valuenow", l.X0)
      .attr("aria-valuetext", l.X0.toFixed(3));
    const tie = l.kind === "tie" ? l.phases : null;
    tieLine
      .attr("display", tie ? null : "none")
      .attr("x1", tie ? xOf(tie[0].X, size) : 0)
      .attr("x2", tie ? xOf(tie[1].X, size) : 0)
      .attr("y1", y)
      .attr("y2", y);
    const arms = leverArms(l);
    const texts = armLayer
      .selectAll<SVGTextElement, LeverArm>("text")
      .data(arms)
      .join("text")
      .attr("class", "lever-fraction")
      .attr("data-side", (_, k) => (k === 0 ? "left" : "right"))
      .attr("y", y < ARM_LABEL_BELOW + LEVER_KNOB_R ? y + ARM_LABEL_BELOW : y - ARM_LABEL_ABOVE)
      .each(function (a) {
        setSvgName(this, a.text, state.diagram.naming.compound);
      });
    const widths = texts.nodes().map((el) => measureText(el, ARM_PX_PER_CHAR));
    const placed = spreadApart(
      arms.map((a) => xOf(0.5 * (a.from + a.to), size)),
      widths,
      ARM_LABEL_GAP,
      [0, size.width],
    );
    texts.attr("x", (_, k) => placed[k]!);
  };
}
