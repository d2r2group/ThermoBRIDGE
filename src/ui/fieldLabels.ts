// Where each field's name goes on the diagram (plan §4 item 1), adapted from pTerrain's
// ui/labels.ts: the connected fields of the diagram by union-find on a raster, each at its pole of
// inaccessibility by a distance transform, and the ones whose name fits. A line compound's field
// has no area, so its name goes beside its line instead (§9 phase 13).

import type { Boundary } from "../physics/boundaries";
import type { NamedField, Naming } from "../physics/fields";
import { COMPOUND, type Params } from "../physics/gibbs";
import type { Hull } from "../physics/hull";
import type { PlotWindow } from "../physics/plotWindow";
import { TAt, type PlotSize } from "./geometry";
import { columnFields } from "./regions";
import { mean } from "./textLayout";

/** Stands in for an infinite squared distance in the distance transform. */
const FAR = 1e20;
/** How far below the largest clearance, in cells, a cell still counts as on the ridge. */
const RIDGE = 1;
/** The raster cell of the label search, CSS px: fine enough for a label, and 4× cheaper than 1. */
export const LABEL_CELL = 2;
/** A label keeps at least this far from its field's edge, CSS px. */
export const MIN_CLEARANCE = 10;

/** Where a field's name goes on the diagram. */
export interface FieldLabel {
  name: string;
  kind: NamedField["kind"];
  /** The phase of a one-phase field, for its colour. */
  phase?: string;
  /** Plot-area px. */
  x: number;
  y: number;
  X: number;
  T: number;
  /** The distance in px from the point to the field's edge or the plot frame. */
  clearance: number;
}

/**
 * A connected field that may get a label (plan §4 item 1), with its pole of inaccessibility:
 * everything about it but the width of its name, so that a font swap only measures again.
 */
export interface LabelCandidate extends FieldLabel {
  /** Its cells on the label raster. */
  cells: number;
  /** CSS px per cell (the smaller of the two, as cols and rows round). */
  scale: number;
}

/**
 * The connected fields of the diagram, each at its pole of inaccessibility inside the plot area,
 * on a raster of LABEL_CELL CSS px. Each raster row takes the hull of `hulls` (`rowHulls`, from
 * the top, of any count) whose row holds its centre. A field type can occur more than once (a
 * eutectic has two L + S fields), so each connected field is found on its own: two cells in one
 * row join when they are in the same field of that row's hull, two in one column when their
 * fields have the same name. A field too small to clear MIN_CLEARANCE is left out.
 */
export function labelCandidates(
  window: PlotWindow,
  naming: Naming,
  size: PlotSize,
  hulls: readonly Hull[],
): LabelCandidate[] {
  const cols = Math.max(1, Math.round(size.width / LABEL_CELL));
  const rows = Math.max(1, Math.round(size.height / LABEL_CELL));
  const n = cols * rows;
  const fieldIndex = new Int32Array(n);
  const nameIndex = new Int32Array(n);
  const names: { field: NamedField; phase?: string }[] = [];
  const nameIds = new Map<string, number>();
  const rowFields = new Int32Array(cols);
  for (let r = 0; r < rows; r++) {
    const hull = hulls[Math.min(hulls.length - 1, Math.floor(((r + 0.5) / rows) * hulls.length))]!;
    const named = naming.name(hull);
    columnFields(hull.fields, cols, rowFields);
    for (let c = 0; c < cols; c++) {
      const f = named[rowFields[c]!]!;
      let id = nameIds.get(f.name);
      if (id === undefined) {
        id = names.length;
        nameIds.set(f.name, id);
        const field = hull.fields[rowFields[c]!]!;
        names.push({ field: f, ...(field.kind === "single" ? { phase: field.phase } : {}) });
      }
      fieldIndex[r * cols + c] = rowFields[c]!;
      nameIndex[r * cols + c] = id;
    }
  }

  // Connected fields, by union-find.
  const parent = Int32Array.from({ length: n }, (_, k) => k);
  const find = (k: number): number => {
    while (parent[k] !== k) k = parent[k] = parent[parent[k]!]!;
    return k;
  };
  const join = (a: number, b: number) => {
    const [ra, rb] = [find(a), find(b)];
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c;
      if (c + 1 < cols && fieldIndex[k] === fieldIndex[k + 1]) join(k, k + 1);
      if (r + 1 < rows && nameIndex[k] === nameIndex[k + cols]) join(k, k + cols);
    }
  }
  const members = new Map<number, number>();
  const component = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    component[k] = find(k);
    members.set(component[k]!, (members.get(component[k]!) ?? 0) + 1);
  }

  const scale = Math.min(size.width / cols, size.height / rows);
  // No name needs less than MIN_CLEARANCE, so a field of fewer cells than a disc of it is out.
  const least = MIN_CLEARANCE / scale;
  const out: LabelCandidate[] = [];
  const mask = new Uint8Array(n);
  for (const [root, cells] of members) {
    if (cells < Math.PI * least * least) continue;
    const { field: f, phase } = names[nameIndex[root]!]!;
    for (let k = 0; k < n; k++) mask[k] = component[k] === root ? 1 : 0;
    const pole = poleOfInaccessibility(mask, cols, rows, 1);
    if (!pole) continue;
    const x = (pole.x / cols) * size.width;
    const y = (pole.y / rows) * size.height;
    out.push({
      name: f.name,
      kind: f.kind,
      ...(phase === undefined ? {} : { phase }),
      x,
      y,
      X: x / size.width,
      T: TAt(y, window, size),
      // A cell is LABEL_CELL px only up to the rounding of cols and rows; the smaller scale is
      // taken.
      clearance: pole.clearance * scale,
      cells,
      scale,
    });
  }
  return out;
}

/**
 * The candidates that get a label: those whose clearance holds `halfWidth(name)` px, and at
 * least MIN_CLEARANCE, and whose cells could hold a disc of that radius.
 */
export function placeLabels(
  candidates: readonly LabelCandidate[],
  halfWidth: (name: string) => number,
): FieldLabel[] {
  const out: FieldLabel[] = [];
  for (const { cells, scale, ...label } of candidates) {
    const need = Math.max(halfWidth(label.name), MIN_CLEARANCE) / scale;
    if (cells < Math.PI * need * need || label.clearance < need * scale) continue;
    out.push(label);
  }
  return out;
}

/**
 * The label of each connected field of the diagram (plan §4 item 1): `labelCandidates` that
 * `placeLabels` keeps. A field whose largest clearance is under `halfWidth(name)` px, or under
 * MIN_CLEARANCE, gets no label.
 */
export function fieldLabels(
  window: PlotWindow,
  naming: Naming,
  size: PlotSize,
  hulls: readonly Hull[],
  halfWidth: (name: string) => number,
): FieldLabel[] {
  return placeLabels(labelCandidates(window, naming, size, hulls), halfWidth);
}

/** A stretch of a line compound's vertical line: where it is stable, from T0 up to T1. */
export interface CompoundLine {
  X: number;
  T0: number;
  T1: number;
}

/**
 * The stretches of T over which a line compound is stable, from the boundaries that trace its
 * end of a tie line (all at X_c), joined where they meet at an event; none without one.
 */
export function compoundLines(params: Params, boundaries: readonly Boundary[]): CompoundLine[] {
  const c = params.compound;
  if (c?.width !== "line") return [];
  const spans = boundaries
    .filter((b) => b.phases[b.side] === COMPOUND && b.points.length > 0)
    .map((b) => [b.points[0]!.T, b.points.at(-1)!.T] as const)
    .sort((a, b) => a[0] - b[0]);
  const out: CompoundLine[] = [];
  for (const [T0, T1] of spans) {
    const last = out.at(-1);
    if (last && T0 <= last.T1) last.T1 = Math.max(last.T1, T1);
    else out.push({ X: c.Xc, T0, T1 });
  }
  return out;
}

/** The gap between a line compound's line and its name, CSS px. */
export const COMPOUND_LABEL_GAP = 4;

/** Where a line compound's name goes: beside its line at mid-height. */
export interface CompoundLabel {
  /** The centre of the name, plot-area px. */
  x: number;
  y: number;
}

/**
 * The name of each stretch of a line compound's line (plot-area px: x of the line, y0 above y1),
 * `width` px wide: beside the line at mid-height, on the right unless it would leave the plot
 * area, and left out where the line is shorter than the name.
 */
export function placeCompoundLabel(
  x: number,
  [y0, y1]: readonly [number, number],
  width: number,
  plotWidth: number,
): CompoundLabel | null {
  if (y1 - y0 < width) return null;
  const right = x + COMPOUND_LABEL_GAP + width <= plotWidth;
  const offset = COMPOUND_LABEL_GAP + width / 2;
  return { x: right ? x + offset : x - offset, y: 0.5 * (y0 + y1) };
}

/**
 * The centre of the cell of `value` in the cols × rows `grid` (row by row from the top left)
 * that lies farthest from every other cell and from the grid's edge, with that distance in
 * cells, or null if `value` does not occur. The distance is a lower bound: it is measured to the
 * nearest corner of the nearest cell outside. Where a ridge of cells comes within RIDGE of the
 * farthest, as along a strip, the one nearest the ridge's centroid is taken, so that the label
 * sits in the middle of the strip rather than at its first cell. Copied from pTerrain.
 */
export function poleOfInaccessibility(
  grid: Uint8Array,
  cols: number,
  rows: number,
  value: number,
): { x: number; y: number; clearance: number } | null {
  // A border of outside cells stands for the plot frame.
  const W = cols + 2;
  const H = rows + 2;
  const f = new Float64Array(W * H);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r * cols + c] === value) f[(r + 1) * W + c + 1] = FAR;
    }
  }
  distanceTransform(f, W, H);
  let best = 0;
  for (let k = 0; k < f.length; k++) best = Math.max(best, f[k]!);
  if (best === 0) return null;
  const floor = (Math.sqrt(best) - RIDGE) ** 2;
  const ridge: number[] = [];
  for (let k = 0; k < f.length; k++) if (f[k]! >= floor) ridge.push(k);
  const cx = mean(ridge.map((k) => k % W));
  const cy = mean(ridge.map((k) => Math.floor(k / W)));
  let at = ridge[0]!;
  for (const k of ridge) {
    const d = ((k % W) - cx) ** 2 + (Math.floor(k / W) - cy) ** 2;
    if (d < ((at % W) - cx) ** 2 + (Math.floor(at / W) - cy) ** 2) at = k;
  }
  return {
    x: (at % W) - 1 + 0.5,
    y: Math.floor(at / W) - 1 + 0.5,
    clearance: Math.sqrt(f[at]!) - Math.SQRT1_2,
  };
}

/**
 * Squared Euclidean distance to the nearest 0 cell, in place, for a W × H grid of 0 (outside)
 * and FAR (inside): Felzenszwalb and Huttenlocher's transform, by columns and then by rows.
 */
function distanceTransform(f: Float64Array, W: number, H: number): void {
  const n = Math.max(W, H);
  const line = new Float64Array(n);
  const out = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let c = 0; c < W; c++) {
    for (let r = 0; r < H; r++) line[r] = f[r * W + c]!;
    distance1d(line, H, out, v, z);
    for (let r = 0; r < H; r++) f[r * W + c] = out[r]!;
  }
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) line[c] = f[r * W + c]!;
    distance1d(line, W, out, v, z);
    for (let c = 0; c < W; c++) f[r * W + c] = out[c]!;
  }
}

/** The 1D lower envelope of parabolas: d[q] = min over s of (q − s)² + f[s]. */
function distance1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  const at = (q: number) => f[q]!;
  const meet = (q: number, s: number) => (at(q) + q * q - (at(s) + s * s)) / (2 * (q - s));
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = meet(q, v[k]!);
    while (s <= z[k]!) {
      k--;
      s = meet(q, v[k]!);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    const s = v[k]!;
    d[q] = (q - s) * (q - s) + at(s);
  }
}
