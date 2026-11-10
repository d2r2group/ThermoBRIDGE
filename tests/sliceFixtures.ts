// Shared by the slice tests: the systems they run on, their cached scans, and the envelope at
// any X, computed independently of slice.ts's own sampling.

import { scan, type DiagramEvent, type Scan } from "../src/physics/events";
import { curves, g, type Params } from "../src/physics/gibbs";
import type { Field } from "../src/physics/hull";
import { PANELS, PRESETS } from "../src/physics/presets";
import { AT_INVARIANT, fieldsAt } from "../src/physics/cut";
import { slice, sliceReference, sliceXs, type Slice } from "../src/physics/slice";

/** The widest plot area of the page, CSS px, for the half-pixel tolerance. */
export const WIDE = 900;
export const XS = sliceXs(WIDE);

// The 18 grid systems and the five presets off the grid (the other seven are grid systems).
export const SYSTEMS = [
  ...Object.entries(PANELS).map(([id, s]) => ({ id: `(${id})`, ...s })),
  ...PRESETS.filter((p) => !(p.id in PANELS) && p.group !== "compound").map(
    ({ id, params, window }) => ({
      id,
      params,
      window,
    }),
  ),
];
export type TestSystem = (typeof SYSTEMS)[number];
const scans = new Map<string, Scan>();
export const scanOf = (sys: TestSystem): Scan => {
  let s = scans.get(sys.id);
  if (!s) scans.set(sys.id, (s = scan(sys.params, sys.window)));
  return s;
};

const stepHulls = new Map<string, Map<number, Field[]>>();

/**
 * `fieldsAt` at T, from the scan's own step at T when it has one: there the hull is the same,
 * and `fieldsAt` changes it only within AT_INVARIANT of an invariant, where it is called instead.
 */
export function fieldsOf(sys: TestSystem, T: number): Field[] {
  let steps = stepHulls.get(sys.id);
  if (!steps) {
    steps = new Map(scanOf(sys).steps.map((st) => [st.T, st.hull.fields]));
    stepHulls.set(sys.id, steps);
  }
  const { events } = scanOf(sys);
  const step = steps.get(T);
  if (step && !invariantsOf(events).some((e) => Math.abs(e.T - T) <= AT_INVARIANT)) return step;
  return fieldsAt(sys.params, T, events);
}

const INVARIANTS = new Set(["eutectic", "monotectic", "peritectic", "syntectic"]);
export const invariantsOf = (events: readonly DiagramEvent[]) =>
  events.filter((e) => INVARIANTS.has(e.kind));

/** The envelope g − r at X on `fields`: the curve over a one-phase field, the tangent over a tie. */
export function envelopeAt(params: Params, T: number, fields: readonly Field[], X: number): number {
  const [a, b] = sliceReference(params, T);
  const r = a + (b - a) * X;
  const byId = new Map(curves(params, T).map((c) => [c.id, c]));
  for (const f of fields) {
    if (f.kind === "single" && X >= f.X[0] && X <= f.X[1]) return g(byId.get(f.phase)!, X) - r;
    if (f.kind === "tie" && X >= f.ends[0].X && X <= f.ends[1].X) {
      return f.intercept + f.slope * X - r;
    }
  }
  throw new Error(`no field holds X = ${X}`);
}

/** The envelope at each of `xs` (sorted), in one pass. */
export function envelopeOver(
  params: Params,
  T: number,
  fields: readonly Field[],
  xs: readonly number[],
): number[] {
  const [a, b] = sliceReference(params, T);
  const byId = new Map(curves(params, T).map((c) => [c.id, c]));
  const out: number[] = [];
  let k = 0;
  for (const X of xs) {
    const end = (f: Field) => (f.kind === "single" ? f.X[1] : f.ends[1].X);
    while (k < fields.length - 1 && X > end(fields[k]!)) k++;
    const f = fields[k]!;
    const v = f.kind === "single" ? g(byId.get(f.phase)!, X) : f.intercept + f.slope * X;
    out.push(v - (a + (b - a) * X));
  }
  return out;
}

/** Temperatures across a window, `count` of them, inside its ends. */
export function temperatures(window: { Tmin: number; Tmax: number }, count: number): number[] {
  const out: number[] = [];
  for (let k = 1; k <= count; k++) {
    out.push(window.Tmin + ((window.Tmax - window.Tmin) * k) / (count + 1));
  }
  return out;
}

export function sliceOf(sys: TestSystem, T: number): { s: Slice; fields: Field[] } {
  const fields = fieldsAt(sys.params, T, scanOf(sys).events);
  return { s: slice(sys.params, T, fields, XS), fields };
}
