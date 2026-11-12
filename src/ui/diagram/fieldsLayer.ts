// The diagram's fields (plan §4 item 1, §4.1): the bitmap of the field fills under the SVG, and the
// field labels over it. Both come from the hull of each row of device pixels, computed once per
// diagram and size and shared by the two; a preview (plan §9 phase 15) has half the rows and no
// labels. A line compound's name goes beside its line instead, on a
// patch of the background over the lines (§9 phase 13).

import type { Selection } from "d3";
import { setSvgName } from "../compoundText";
import {
  compoundLines,
  labelCandidates,
  type Box,
  placeCompoundLabel,
  placeLabels,
  type FieldLabel,
  type LabelCandidate,
} from "../fieldLabels";
import { MARGIN, measureText, xOf, yOf, type PlotSize } from "../geometry";
import type { Layer } from "../marks";
import { MAX_DPR, paintRegions, RasterCache, rowHullsOf } from "../regions";
import { isPreview, type State } from "../state";

/** Half the height of a field label's 14 px text, CSS px. */
const LABEL_HALF_HEIGHT = 7;
/** A field label's estimated width per character before its text is laid out, CSS px. */
const LABEL_PX_PER_CHAR = 8;

/** A closed polyline in plot-area px. */
export type Outline = [number, number][];

export interface FieldsLayer {
  /**
   * Paints the bitmap of `state`'s fields under the plot area, from half as many rows for a
   * preview (plan §9 phase 15), a quarter for one with a compound (phase 19).
   */
  paint(state: Readonly<State>, size: PlotSize): void;
  /**
   * Places the field labels, each at its field's pole of inaccessibility, in the curve colour for
   * a one-phase field and in --fg for a two-phase one, and a line compound's name beside its
   * line, and returns their outlines, which the points' names avoid. They depend on the
   * system, the plot size and `keepOut` (the α mode's caption, which they keep clear of) only, so
   * a cut drag leaves them.
   */
  drawLabels(state: Readonly<State>, size: PlotSize, keepOut?: Box | null): Outline[];
  /** Removes the field labels and a line compound's name, which a preview does not place. */
  clearLabels(): void;
}

/** A line compound's name on the diagram, at its centre in plot-area px. */
interface PlacedCompoundLabel {
  x: number;
  y: number;
  width: number;
}

/** The outline of a box `halfWidth` × `halfHeight` around (x, y). */
function boxOutline(x: number, y: number, halfWidth: number, halfHeight: number): Outline {
  return [
    [x - halfWidth, y - halfHeight],
    [x + halfWidth, y - halfHeight],
    [x + halfWidth, y + halfHeight],
    [x - halfWidth, y + halfHeight],
    [x - halfWidth, y - halfHeight],
  ];
}

/**
 * The fields layer: the bitmap in `canvas`, the field labels in `labels`, and a line compound's
 * name in `compoundLabels`, a layer over the boundaries so that its patch hides those beneath.
 */
export function createFieldsLayer(
  container: HTMLElement,
  canvas: Selection<HTMLCanvasElement, unknown, null, undefined>,
  labels: Layer,
  compoundLabels: Layer,
): FieldsLayer {
  const rasters = new RasterCache();
  /** The label candidates of the last system and size: a font swap only measures the names. */
  let candidates: { key: readonly unknown[]; value: LabelCandidate[] } | null = null;

  /**
   * The bitmap's grid in device pixels, `dprY` rows per CSS px (half `dpr` for a preview, a
   * quarter for a preview with a compound, whose scan costs more: plan §9 phase 19), and the hull
   * of each of its rows.
   */
  const grid = ({ diagram }: Readonly<State>, size: PlotSize) => {
    const dpr = Math.min(MAX_DPR, globalThis.devicePixelRatio || 1);
    const preview = diagram.scan.params.compound ? dpr / 4 : dpr / 2;
    const dprY = isPreview(diagram) ? preview : dpr;
    const cols = Math.max(1, Math.round(size.width * dpr));
    const rows = Math.max(1, Math.round(size.height * dprY));
    return { dpr, dprY, cols, rows, hulls: rowHullsOf(diagram, rows) };
  };

  return {
    paint(state, size) {
      canvas
        .style("left", `${MARGIN.left}px`)
        .style("top", `${MARGIN.top}px`)
        .style("width", `${size.width}px`)
        .style("height", `${size.height}px`);
      const { dpr, dprY, cols, rows, hulls } = grid(state, size);
      const kinds = rasters.get(hulls, cols);
      const el = canvas.node() as HTMLCanvasElement;
      paintRegions(el, kinds, cols, rows, dpr, getComputedStyle(container), dprY);
    },

    clearLabels() {
      labels.selectAll("*").remove();
      compoundLabels.selectAll("*").remove();
    },

    drawLabels(state, size, keepOut = null) {
      const { window, diagram } = state;
      const probe = labels.append("text").attr("class", "field-label");
      const node = probe.node() as SVGTextElement;
      const widths = new Map<string, number>();
      const halfWidth = (name: string) => {
        let w = widths.get(name);
        if (w === undefined) {
          setSvgName(node, name, diagram.naming.compound);
          w = measureText(node, LABEL_PX_PER_CHAR);
          widths.set(name, w);
        }
        return w / 2;
      };
      const { hulls } = grid(state, size);
      const key = [diagram, size, hulls, keepOut?.width, keepOut?.height];
      if (!candidates || candidates.key.some((k, i) => k !== key[i])) {
        candidates = {
          key,
          value: labelCandidates(window, diagram.naming, size, hulls, keepOut),
        };
      }
      const placed = placeLabels(candidates.value, halfWidth);
      const name = diagram.naming.compound?.name;
      // Measured while the probe is in the layer.
      const compoundWidth = name === undefined ? 0 : 2 * halfWidth(name);
      probe.remove();
      labels
        .selectAll<SVGTextElement, FieldLabel>(":scope > text")
        .data(placed)
        .join("text")
        .attr("class", "field-label")
        .attr("data-kind", (l) => l.kind)
        .attr("data-phase", (l) => l.phase ?? null)
        .attr("x", (l) => l.x)
        .attr("y", (l) => l.y)
        .each(function (l) {
          setSvgName(this, l.name, diagram.naming.compound);
        });
      const lines: PlacedCompoundLabel[] = [];
      if (name !== undefined) {
        for (const run of compoundLines(state.params, diagram.boundaries)) {
          const x = xOf(run.X, size);
          const ys = [yOf(run.T1, window, size), yOf(run.T0, window, size)] as const;
          const spot = placeCompoundLabel(x, ys, compoundWidth, size.width);
          if (spot) lines.push({ ...spot, width: compoundWidth });
        }
      }
      const groups = compoundLabels
        .selectAll<SVGGElement, PlacedCompoundLabel>("g.compound-label")
        .data(lines)
        .join((enter) => {
          const g = enter.append("g").attr("class", "compound-label");
          g.append("rect");
          g.append("text").attr("class", "field-label").attr("data-phase", "C");
          return g;
        })
        .attr("transform", (l) => `translate(${l.x},${l.y})`);
      groups
        .select("rect")
        .attr("x", (l) => -l.width / 2 - 2)
        .attr("y", -LABEL_HALF_HEIGHT - 1)
        .attr("width", (l) => l.width + 4)
        .attr("height", 2 * LABEL_HALF_HEIGHT + 2);
      groups.select<SVGTextElement>("text").each(function () {
        setSvgName(this, name ?? "", diagram.naming.compound);
      });
      return [
        ...placed.map((l) => boxOutline(l.x, l.y, halfWidth(l.name), LABEL_HALF_HEIGHT)),
        ...lines.map((l) => boxOutline(l.x, l.y, l.width / 2, LABEL_HALF_HEIGHT)),
      ];
    },
  };
}
