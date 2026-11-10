// Screen geometry of the two plots (plan §4.2), adapted from pTerrain's ui/geometry.ts: the fixed
// margins, the plot-area size that both plots share, their frames, the maps between (X_B, T) and
// plot-area pixels, the sizes both plots draw with, and the measure of a text's width. X_B runs
// from 0 at the left to 1 at the right, T upwards.

import { scaleLinear } from "d3";
import type { PlotWindow } from "../physics/plotWindow";

/**
 * Fixed margins around the plot area, in CSS px. They are not fitted to the tick labels, so the
 * slice panel under the diagram can share the same left edge and width (plan §4 item 2).
 */
export const MARGIN = { top: 12, right: 20, bottom: 44, left: 60 } as const;

/**
 * The slice panel's margins. Its X axis runs along the top, so the tick labels sit above the plot
 * area, under the diagram's X-axis label, and only the frame line runs along the bottom. Left and
 * right are the diagram's, so the two plots share one X scale.
 */
export const SLICE_MARGIN = { ...MARGIN, top: 26, bottom: 12 } as const;

/** The inner plot area, in CSS px. */
export interface PlotSize {
  width: number;
  height: number;
}

/** The plot-area width for a panel `containerWidth` CSS px wide; both plots use it. */
export function plotWidth(containerWidth: number): number {
  return Math.max(120, Math.floor(containerWidth) - MARGIN.left - MARGIN.right);
}

/** The plot-area height for a plot area `width` CSS px wide: half the width, within 160–360 px. */
export function plotHeight(width: number): number {
  return Math.round(Math.min(360, Math.max(160, 0.5 * width)));
}

/** The top and right edges of a plot area, which close a frame with the bottom and left axes. */
export function frameTopRight({ width, height }: PlotSize): string {
  return `M0,0H${width}V${height}`;
}

/** The bottom and right edges, for the slice panel, whose X axis is on top. */
export function frameBottomRight({ width, height }: PlotSize): string {
  return `M0,${height}H${width}V0`;
}

/**
 * The X_B ticks of both plots for a plot area `width` CSS px wide, about one per 80 px: the
 * diagram draws them as marks, and the slice panel's top axis carries their numbers.
 */
export function xTicks(width: number): number[] {
  return scaleLinear()
    .domain([0, 1])
    .ticks(Math.max(2, Math.floor(width / 80)));
}

/** The plot-area x of composition X. */
export function xOf(X: number, size: PlotSize): number {
  return X * size.width;
}

/** The plot-area y of temperature T. */
export function yOf(T: number, window: PlotWindow, size: PlotSize): number {
  return ((window.Tmax - T) / (window.Tmax - window.Tmin)) * size.height;
}

/** The temperature at plot-area height y, unclamped. */
export function TAt(y: number, window: PlotWindow, size: PlotSize): number {
  return window.Tmax - (y / size.height) * (window.Tmax - window.Tmin);
}

/** Height of the hit band around the cut line, and the knobs' touch targets, CSS px (§4.2). */
export const HIT_BAND = 44;
/** The cut handle's knob radius, CSS px. */
export const CUT_KNOB_R = 11;
/** The lever knob's radius, CSS px: smaller than the cut's knob, and filled. */
export const LEVER_KNOB_R = 7;
/** The touching points' and the diagram's event points' marker radius, CSS px. */
export const MARKER_R = 3.5;

/** About one T or g tick per this many CSS px of plot height. */
export const TICK_SPACING = 50;
/** The baseline of the diagram's X-axis label and component names above the SVG's bottom, px. */
export const X_LABEL_INSET = 6;
/** The x of the rotated Y-axis labels' baseline from the SVG's left edge, CSS px. */
export const Y_LABEL_X = 14;

/**
 * The width of an SVG text element's text, CSS px. Before layout (or before its font has loaded)
 * it has no length yet, so it is estimated at `pxPerChar` per character.
 */
export function measureText(el: SVGTextContentElement, pxPerChar: number): number {
  return el.getComputedTextLength() || pxPerChar * (el.textContent ?? "").length;
}
