// The region raster of the phase diagram (plan §3 `regionRaster`, §4.1): the field under every
// pixel, from the hull at each pixel row's T, and its painting as a bitmap under the SVG. One-phase
// fields take the phase's colour; two-phase fields are a checkerboard of a colour and its second
// shade (L + γ in diamonds). A line compound's field has no width, so the raster paints nothing
// for it; its boundary draws the line. The bitmap reruns when the system, the window or the plot
// size change, not while the cut moves; its row hulls serve the field labels too.

import { COMPOUND, LIQUID, type Params } from "../physics/gibbs";
import type { PlotWindow } from "../physics/plotWindow";
import { HullError, sliceHull, type Field, type Hull } from "../physics/hull";

/**
 * The kinds of field, by the phases they hold: L + L is a liquid gap and S + S a solid one; C is
 * the compound γ (§9 phase 13).
 */
export const REGION_KINDS = ["L", "S", "L+S", "S+S", "L+L", "C", "L+C", "S+C"] as const;
export type RegionKind = (typeof REGION_KINDS)[number];

/** The checkerboard's cell size, CSS px; the slice panel's shading uses the same (§4.1). */
export const CHECKER_CELL = 8;
/** Upper limit on the device pixel ratio of the bitmap; finer gives no visible gain. */
export const MAX_DPR = 2;

/** The kind of a field of the hull. */
export function fieldKind(f: Field): RegionKind {
  if (f.kind === "single") {
    if (f.phase === COMPOUND) return "C";
    return f.phase === LIQUID ? "L" : "S";
  }
  const [p, q] = f.ends;
  if (p.phase === COMPOUND || q.phase === COMPOUND) {
    const other = p.phase === COMPOUND ? q.phase : p.phase;
    return other === LIQUID ? "L+C" : "S+C";
  }
  if (p.phase !== q.phase) return "L+S";
  return p.phase === LIQUID ? "L+L" : "S+S";
}

/** The plot-area pixel row r of `rows` at its centre's temperature. */
export function rowT(r: number, rows: number, window: PlotWindow): number {
  return window.Tmax - ((r + 0.5) / rows) * (window.Tmax - window.Tmin);
}

/**
 * The hull at the centre of each of `rows` pixel rows over the plot area, from the top. A row
 * whose hull cannot be computed (the system passed `validate`, which steps the window in 1 K, so
 * this is a rare row between two steps) takes the nearest row's.
 */
export function rowHulls(params: Params, window: PlotWindow, rows: number): Hull[] {
  const hulls: (Hull | null)[] = [];
  for (let r = 0; r < rows; r++) {
    try {
      hulls.push(sliceHull(params, rowT(r, rows, window)));
    } catch (err) {
      if (!(err instanceof HullError)) throw err;
      hulls.push(null);
    }
  }
  const nearest = (r: number): Hull => {
    for (let d = 1; d < rows; d++) {
      const h = hulls[r - d] ?? hulls[r + d];
      if (h) return h;
    }
    throw new HullError("no row of the region raster could be computed");
  };
  return hulls.map((h, r) => h ?? nearest(r));
}

/** Into `out`, the index into `fields` of the field at the centre of each of `cols` columns. */
export function columnFields(fields: readonly Field[], cols: number, out: Int32Array): void {
  let k = 0;
  for (let c = 0; c < cols; c++) {
    const X = (c + 0.5) / cols;
    while (k < fields.length - 1 && X > fieldEnd(fields[k]!)) k++;
    out[c] = k;
  }
}

/**
 * The field kind at the centre of every pixel of a cols × rows grid over the plot area, as an
 * index into REGION_KINDS, row by row from the top left, from the hull of each row (`rowHulls`).
 */
export function regionRaster(hulls: readonly Hull[], cols: number): Uint8Array {
  const out = new Uint8Array(cols * hulls.length);
  const index = new Int32Array(cols);
  hulls.forEach(({ fields }, r) => {
    columnFields(fields, cols, index);
    const kinds = fields.map((f) => REGION_KINDS.indexOf(fieldKind(f)));
    for (let c = 0; c < cols; c++) out[r * cols + c] = kinds[index[c]!]!;
  });
  return out;
}

/** The right edge of a field in X. */
function fieldEnd(f: Field): number {
  return f.kind === "single" ? f.X[1] : f.ends[1].X;
}

/**
 * The two colours of each kind's checkerboard, as CSS custom properties: a colour and its second
 * shade for a two-phase kind (plan §4.1), the phase's colour twice for a one-phase one.
 */
export const KIND_COLOURS: Record<RegionKind, [string, string]> = {
  L: ["--phase-liquid", "--phase-liquid"],
  S: ["--phase-solid", "--phase-solid"],
  "L+S": ["--phase-purple", "--phase-purple-alt"],
  "S+S": ["--phase-solid", "--phase-solid-alt"],
  "L+L": ["--phase-liquid", "--phase-liquid-alt"],
  C: ["--phase-compound", "--phase-compound"],
  "L+C": ["--phase-purple", "--phase-purple-alt"],
  "S+C": ["--phase-compound", "--phase-compound-alt"],
};

/** The two-phase kinds: a checkerboard of their two colours. */
export const TWO_PHASE_KINDS: readonly RegionKind[] = ["L+S", "S+S", "L+L", "L+C", "S+C"];

/** The two-phase kinds in diamonds (the checkerboard turned 45°): L + γ, apart from L + S. */
export const DIAMOND_KINDS: readonly RegionKind[] = ["L+C"];

/**
 * The colour, 0 (first) or 1 (second), of the checkerboard at (x, y) CSS px from the plot area's
 * origin: cells of CHECKER_CELL px, or the same cells turned 45° about the origin for `diamond`,
 * as an SVG pattern with `patternTransform="rotate(45)"` draws them.
 */
export function checkerColour(x: number, y: number, diamond: boolean): 0 | 1 {
  const [u, v] = diamond ? [(x + y) / Math.SQRT2, (y - x) / Math.SQRT2] : [x, y];
  return ((Math.floor(u / CHECKER_CELL) + Math.floor(v / CHECKER_CELL)) & 1) as 0 | 1;
}

/**
 * The row hulls (`rowHulls`) of the last system, window and row count asked for: the region raster
 * and the field labels both read them, so they are computed once per system and plot size.
 */
export class RowHullCache {
  #key: { params: Params; window: PlotWindow; rows: number } | null = null;
  #hulls: Hull[] = [];

  get(params: Params, window: PlotWindow, rows: number): Hull[] {
    const key = this.#key;
    if (!key || key.params !== params || key.window !== window || key.rows !== rows) {
      this.#key = { params, window, rows };
      this.#hulls = rowHulls(params, window, rows);
    }
    return this.#hulls;
  }
}

/**
 * The raster of `regionRaster` for the row hulls, kept for the column count it was found for, so
 * that a theme change repaints without recomputing it.
 */
export class RasterCache {
  #key: { hulls: readonly Hull[]; cols: number } | null = null;
  #kinds: Uint8Array = new Uint8Array(0);

  get(hulls: readonly Hull[], cols: number): Uint8Array {
    const key = this.#key;
    if (!key || key.hulls !== hulls || key.cols !== cols) {
      this.#key = { hulls, cols };
      this.#kinds = regionRaster(hulls, cols);
    }
    return this.#kinds;
  }
}

/**
 * Paints `kinds` (cols × rows device pixels, `dpr` per CSS px) into `canvas`, in the colours of
 * `style` at the region opacity. Two-phase fields are a checkerboard (`checkerColour`), as in the
 * slice panel.
 */
export function paintRegions(
  canvas: HTMLCanvasElement,
  kinds: Uint8Array,
  cols: number,
  rows: number,
  dpr: number,
  style: CSSStyleDeclaration,
): void {
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const alpha = Math.round(255 * Number(style.getPropertyValue("--region-opacity") || 0.3));
  const rgba = (name: string, a: number) => {
    const bytes = new Uint8ClampedArray([...parseHex(style.getPropertyValue(name)), a]);
    return new Uint32Array(bytes.buffer)[0]!;
  };
  // Per kind, the word of each colour, whether it is checkered and whether in diamonds.
  const words = REGION_KINDS.map((kind) => KIND_COLOURS[kind].map((name) => rgba(name, alpha)));
  const checkered = REGION_KINDS.map((kind) => TWO_PHASE_KINDS.includes(kind));
  const diamond = REGION_KINDS.map((kind) => DIAMOND_KINDS.includes(kind));

  const image = ctx.createImageData(cols, rows);
  const pixels = new Uint32Array(image.data.buffer);
  for (let r = 0; r < rows; r++) {
    const y = r / dpr;
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c;
      const kind = kinds[k]!;
      const colours = words[kind]!;
      pixels[k] = checkered[kind]
        ? colours[checkerColour(c / dpr, y, diamond[kind]!)]!
        : colours[0]!;
    }
  }
  ctx.putImageData(image, 0, 0);
}

/** The colour `parseHex` falls back to: a mid grey, which shows on both themes. */
const FALLBACK_RGB: [number, number, number] = [128, 128, 128];

/**
 * `#rrggbb` to [r, g, b] in 0–255. Any other text gives a mid grey with a console warning rather
 * than throwing, since it runs in a store listener and would stop the listeners after it.
 */
export function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) {
    console.warn(`ThermoBRIDGE: expected a #rrggbb colour, got "${hex}"`);
    return [...FALLBACK_RGB];
  }
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
}
