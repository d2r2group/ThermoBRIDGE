// The α mode's caption (plan §9 phases 17 and 19): the drawn system's α and melting points in the
// plot area's top-left corner, set as the lever rule's summary line is, and its line compound on
// the line under them. Where the plot is too narrow for one line, the melting points go on a
// second. The pad (alphaPad.ts) hides it while the knob or a slider is held.

import { alphaCaptionParts } from "../alphaPoint";
import { setAxisLabel, type LabelPart } from "../axisLabels";
import type { Box } from "../fieldLabels";
import type { PlotSize } from "../geometry";
import type { Layer } from "../marks";
import type { State } from "../state";
import { SUMMARY_SEP, SUMMARY_X, SUMMARY_Y } from "./leverLayer";

/** Between the two lines' baselines, CSS px (12 px text). */
const LINE_GAP = 16;

const joined = (parts: LabelPart[][]) => parts.flatMap((p, k) => (k > 0 ? [SUMMARY_SEP, ...p] : p));

/** Below the last line's baseline to the bottom of its descenders and halo, CSS px. */
const DESCENT = 6;

/**
 * Builds the caption's three lines in `group`; the returned function draws them and returns the
 * box they take from the plot area's top-left corner (null outside the α mode), which the field
 * labels keep clear of.
 */
export function createAlphaCaption(
  group: Layer,
): (state: Readonly<State>, size: PlotSize) => Box | null {
  const lines = [0, 1, 2].map((k) =>
    group
      .append<SVGTextElement>("text")
      .attr("class", "alpha-summary")
      .attr("x", SUMMARY_X)
      .attr("y", SUMMARY_Y + k * LINE_GAP)
      .node()!,
  );
  return (state, size) => {
    for (const line of lines) line.replaceChildren();
    if (state.mode !== "alpha") return null;
    const [first, second, third] = lines as [SVGTextElement, SVGTextElement, SVGTextElement];
    const parts = alphaCaptionParts(state.params);
    const compound = parts[4];
    setAxisLabel(first, joined(parts.slice(0, 4)));
    let next = second;
    if (first.getComputedTextLength() > size.width - 2 * SUMMARY_X) {
      setAxisLabel(first, joined(parts.slice(0, 2)));
      setAxisLabel(second, joined(parts.slice(2, 4)));
      next = third;
    }
    if (compound) setAxisLabel(next, compound);
    const used = lines.filter((line) => line.hasChildNodes());
    return {
      width: SUMMARY_X + Math.max(...used.map((line) => line.getComputedTextLength())) + DESCENT,
      height: SUMMARY_Y + (used.length - 1) * LINE_GAP + DESCENT,
    };
  };
}
