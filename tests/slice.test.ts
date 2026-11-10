import { describe, expect, it } from "vitest";
import { boundaries, type Boundary } from "../src/physics/boundaries";
import { fieldsAt } from "../src/physics/cut";
import { curves, g } from "../src/physics/gibbs";
import { sliceReference, sliceXs, touchingXs, type TouchPoint } from "../src/physics/slice";
import { fieldKind } from "../src/ui/regions";
import {
  envelopeAt,
  invariantsOf,
  scanOf,
  sliceOf,
  SYSTEMS,
  temperatures,
  WIDE,
} from "./sliceFixtures";

describe("the reference r", () => {
  it.each(SYSTEMS.map((s) => [s.id, s] as const))(
    "%s: the envelope starts and ends at 0 at every T",
    (_, sys) => {
      for (const T of temperatures(sys.window, 25)) {
        const { s, fields } = sliceOf(sys, T);
        expect(Math.abs(envelopeAt(sys.params, T, fields, 0))).toBeLessThan(1e-12);
        expect(Math.abs(envelopeAt(sys.params, T, fields, 1))).toBeLessThan(1e-12);
        expect(s.min).toBeLessThanOrEqual(0);
      }
    },
  );
});

describe("the curves, tangents and shading", () => {
  it.each(SYSTEMS.map((s) => [s.id, s] as const))(
    "%s: the shades tile [0, 1], start and end at the touching points and carry their field's kind",
    (_, sys) => {
      for (const T of temperatures(sys.window, 40)) {
        const { s, fields } = sliceOf(sys, T);
        // One shade per field of non-zero width, in order, each ending where the next starts.
        const wide = fields.filter((f) => f.kind === "tie" || f.X[1] > f.X[0]);
        expect(s.shades.map((d) => d.field)).toEqual(wide);
        expect(s.shades[0]!.points[0]!.X).toBe(0);
        expect(s.shades.at(-1)!.points.at(-1)!.X).toBe(1);
        for (let k = 1; k < s.shades.length; k++) {
          const end = s.shades[k - 1]!.points.at(-1)!;
          const start = s.shades[k]!.points[0]!;
          expect(start.X).toBe(end.X);
          expect(Math.abs(start.g - end.g)).toBeLessThan(1e-9);
        }
        // Under a tangent: exactly its two touching points, and the field's checkerboard.
        const touches = new Set(s.tangents.flatMap((t) => t.points.map((p) => `${p.X},${p.g}`)));
        for (const d of s.shades) {
          if (d.field.kind !== "tie") {
            expect(fieldKind(d.field)).toBe(d.field.phase === "L" ? "L" : "S");
            continue;
          }
          expect(d.points).toHaveLength(2);
          for (const p of d.points) expect(touches.has(`${p.X},${p.g}`)).toBe(true);
          const [p, q] = d.field.ends;
          expect(fieldKind(d.field)).toBe(
            p.phase !== q.phase ? "L+S" : p.phase === "L" ? "L+L" : "S+S",
          );
        }
      }
    },
  );

  it.each(SYSTEMS.map((s) => [s.id, s] as const))(
    "%s: stable runs lie on the envelope and the rest above it",
    (_, sys) => {
      for (const T of temperatures(sys.window, 20)) {
        const { s, fields } = sliceOf(sys, T);
        for (const run of s.runs) {
          for (const p of run.points) {
            const env = envelopeAt(sys.params, T, fields, p.X);
            if (run.stable) expect(Math.abs(p.g - env)).toBeLessThan(1e-9);
            else expect(p.g).toBeGreaterThanOrEqual(env - 1e-9);
          }
        }
        // Each phase's runs cover [0, 1] once, in order.
        for (const phase of ["L", "S"]) {
          const runs = s.runs.filter((r) => r.phase === phase);
          expect(runs[0]!.points[0]!.X).toBe(0);
          expect(runs.at(-1)!.points.at(-1)!.X).toBe(1);
          for (let k = 1; k < runs.length; k++) {
            expect(runs[k]!.points[0]!.X).toBe(runs[k - 1]!.points.at(-1)!.X);
            expect(runs[k]!.stable).not.toBe(runs[k - 1]!.stable);
          }
        }
      }
    },
  );

  it("each tangent touches its curves: every touching point lies on its phase's curve", () => {
    const sys = SYSTEMS.find((s) => s.id === "(h)")!;
    const { s } = sliceOf(sys, 900);
    expect(s.tangents).toHaveLength(1);
    const [a, b] = sliceReference(sys.params, 900);
    const byId = new Map(curves(sys.params, 900).map((c) => [c.id, c]));
    for (const p of s.tangents[0]!.points) {
      expect(p.g).toBeCloseTo(g(byId.get(p.phase)!, p.X) - (a + (b - a) * p.X), 12);
    }
  });
});

describe("the guide lines meet the diagram's boundaries", () => {
  /** X of a boundary polyline at T, by linear interpolation as the diagram draws it. */
  const XAt = (b: Boundary, T: number): number | null => {
    const pts = b.points;
    for (let k = 1; k < pts.length; k++) {
      const p = pts[k - 1]!;
      const q = pts[k]!;
      if (T >= p.T && T <= q.T) return p.X + ((q.X - p.X) * (T - p.T)) / (q.T - p.T);
    }
    return null;
  };

  it.each(SYSTEMS.map((s) => [s.id, s] as const))(
    "%s: each touching point lies within 0.5 px of a boundary at the cut",
    (_, sys) => {
      const scanned = scanOf(sys);
      const lines = boundaries(sys.params, sys.window, scanned);
      // Near a critical point the boundary turns vertical and its 1 K chords cut the corner;
      // within an event the cut sits on an invariant line rather than a boundary.
      const near = (T: number) => scanned.events.some((e) => Math.abs(e.T - T) < 3);
      for (const T of temperatures(sys.window, 60).filter((T) => !near(T))) {
        const fields = fieldsAt(sys.params, T, scanned.events);
        for (const e of touchingXs(fields)) {
          const misses = lines
            .filter((b) => b.phases.includes(e.phase))
            .map((b) => XAt(b, T))
            .filter((X): X is number => X !== null)
            .map((X) => Math.abs(X - e.X) * WIDE);
          expect(Math.min(...misses), `${e.phase} at X = ${e.X}, T = ${T}`).toBeLessThan(0.5);
        }
      }
    },
  );
});

describe("at an invariant temperature", () => {
  const cases = SYSTEMS.flatMap((sys) =>
    invariantsOf(scanOf(sys).events).map((e) => [`${sys.id} ${e.kind}`, sys, e] as const),
  );

  it.each(cases)("%s: one tangent touches three points on one line", (_, sys, e) => {
    const { s } = sliceOf(sys, e.T);
    const three = s.tangents.filter((t) => t.points.length === 3);
    expect(three).toHaveLength(1);
    const [p, q, r] = three[0]!.points as [TouchPoint, TouchPoint, TouchPoint];
    expect([p.X, q.X, r.X]).toEqual(e.points.map((pt) => pt.X));
    const onLine = p.g + ((r.g - p.g) * (q.X - p.X)) / (r.X - p.X);
    expect(Math.abs(q.g - onLine)).toBeLessThan(1e-6);
    // The touching points, once each, for the guide lines and the bold values.
    const fields = fieldsAt(sys.params, e.T, scanOf(sys).events);
    const xs = touchingXs(fields).map((t) => t.X);
    for (const pt of e.points) expect(xs.filter((X) => X === pt.X)).toHaveLength(1);
  });

  it("just off it, the hull's own tie lines are used", () => {
    const sys = SYSTEMS.find((s) => s.id === "(h)")!;
    const e = invariantsOf(scanOf(sys).events)[0]!;
    const below = sliceOf(sys, e.T - 0.01).s;
    const above = sliceOf(sys, e.T + 0.01).s;
    expect(below.tangents.map((t) => t.points.length)).toEqual([2]);
    expect(above.tangents.map((t) => t.points.length)).toEqual([2, 2]);
  });
});

describe("sliceXs", () => {
  it("has a point per pixel column and finer points within a pixel of each end", () => {
    const xs = sliceXs(500);
    expect(xs[0]).toBe(0);
    expect(xs.at(-1)).toBe(1);
    for (let k = 0; k <= 500; k++) expect(xs).toContain(k / 500);
    expect(xs[1]!).toBeLessThan(1e-8);
    expect(1 - xs.at(-2)!).toBeLessThan(1e-8);
    for (let k = 1; k < xs.length; k++) expect(xs[k]!).toBeGreaterThan(xs[k - 1]!);
  });
});
