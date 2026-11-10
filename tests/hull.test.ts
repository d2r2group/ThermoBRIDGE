import { describe, expect, it } from "vitest";
import { scan, type Scan } from "../src/physics/events";
import {
  criticalT,
  curveAt,
  curves,
  dg,
  g,
  logitState,
  logit,
  R,
  SOLID,
  type Curve,
  type Params,
  type PointPhase,
} from "../src/physics/gibbs";
import { binodal, hull, refineTie, sliceHull, type Hull } from "../src/physics/hull";
import { PANELS, PRESETS, type System } from "../src/physics/presets";

const h = PANELS.h.params;

/** The 18 grid systems and the five presets off the grid. */
const SYSTEMS: [string, System][] = [
  ...Object.entries(PANELS),
  ...PRESETS.filter((p) => !(p.id in PANELS) && p.group !== "compound").map(
    (p): [string, System] => [p.id, p],
  ),
];

/** The scan of each of SYSTEMS, made once for the tests that step through it. */
const scans = new Map<string, Scan>();
const scanOf = (id: string, { params, window }: System): Scan => {
  let s = scans.get(id);
  if (!s) scans.set(id, (s = scan(params, window)));
  return s;
};

/** The hull's g at X: the phase's curve on a one-phase interval, the tangent on a tie line. */
function hullValue(hl: Hull, cs: Curve[], X: number): number {
  for (const f of hl.fields) {
    if (f.kind === "tie" && X >= f.ends[0].X && X <= f.ends[1].X) return f.intercept + f.slope * X;
    if (f.kind === "single" && X >= f.X[0] && X <= f.X[1]) {
      return g(
        cs.find((c) => c.id === f.phase)!,
        X,
      );
    }
  }
  throw new Error(`X = ${X} outside the hull`);
}

/**
 * The tolerance for μ at a tie line's end: 1e-9 relative, plus the rounding of X itself, which
 * near a pure end limits RT ln X or RT ln(1 − X) to about RT ε / min(X, 1 − X).
 */
function muTol(X: number, T: number, mu: number): number {
  return 1e-9 * Math.max(1, Math.abs(mu)) + (R * T * 4e-16) / Math.min(X, 1 - X);
}

describe("hull", () => {
  it("lies on or under both curves and is convex", () => {
    for (const [, { params, window }] of SYSTEMS) {
      for (let T = window.Tmin; T <= window.Tmax; T += 97) {
        const cs = curves(params, T);
        const hl = hull(cs);
        const N = 2000;
        const H = Array.from({ length: N + 1 }, (_, k) => hullValue(hl, cs, k / N));
        // One assertion per sweep: millions of `expect` calls time the test out on CI.
        let above = -Infinity;
        for (let k = 0; k <= N; k++) {
          for (const c of cs) above = Math.max(above, H[k]! - g(c, k / N));
        }
        let concave = Infinity;
        for (let k = 1; k < N; k++) {
          concave = Math.min(concave, H[k - 1]! - 2 * H[k]! + H[k + 1]!);
        }
        expect(above).toBeLessThanOrEqual(1e-10);
        expect(concave).toBeGreaterThanOrEqual(-1e-10);
      }
    }
  });

  it("has equal μ_A and μ_B at the two ends of every tie line", () => {
    let checked = 0;
    for (const [id, sys] of SYSTEMS) {
      const { params } = sys;
      for (const { T, hull: hl } of scanOf(id, sys).steps) {
        const cs = curves(params, T);
        for (const t of hl.ties) {
          const [p, q] = t.ends.map((e) =>
            logitState(
              cs.find((c) => c.id === e.phase)!,
              logit(e.X),
            ),
          );
          expect(Math.abs(p!.muA - q!.muA)).toBeLessThan(muTol(Math.min(p!.x, q!.x), T, p!.muA));
          expect(Math.abs(p!.muB - q!.muB)).toBeLessThan(muTol(Math.min(p!.y, q!.y), T, p!.muB));
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(20000);
  });

  it("puts the three points of every invariant on one tangent", () => {
    let checked = 0;
    for (const [id, sys] of SYSTEMS) {
      const { params } = sys;
      for (const e of scanOf(id, sys).events) {
        if (e.points.length !== 3) continue;
        const states = e.points.map((pt) =>
          logitState(
            curves(params, e.T).find((c) => c.id === pt.phase)!,
            logit(pt.X),
          ),
        );
        for (const s of states.slice(1)) {
          expect(Math.abs(s.muA - states[0]!.muA)).toBeLessThan(
            muTol(Math.min(s.x, states[0]!.x), e.T, s.muA),
          );
          expect(Math.abs(s.muB - states[0]!.muB)).toBeLessThan(
            muTol(Math.min(s.y, states[0]!.y), e.T, s.muB),
          );
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(15);
  });

  it("shows no fake tie lines at 0.5 K steps", () => {
    let gaps = 0;
    for (const [id, sys] of SYSTEMS) {
      const { params, window } = sys;
      // The whole kelvins are the scan's own steps (every window spans whole kelvins).
      const steps = new Map(scanOf(id, sys).steps.map((st) => [st.T, st.hull]));
      for (let T = window.Tmin; T <= window.Tmax; T += 0.5) {
        for (const t of (steps.get(T) ?? sliceHull(params, T)).ties) {
          const [p, q] = t.ends;
          if (p.phase !== q.phase) continue;
          const alpha = p.phase === "L" ? params.alphaL : params.alphaS;
          expect(alpha).toBeGreaterThan(0);
          expect(T).toBeLessThan(criticalT(alpha));
          gaps++;
        }
      }
    }
    expect(gaps).toBeGreaterThan(1000);
  });

  it("finds no gap in a phase with α = 0 just below 800 K, where an unguarded hull did", () => {
    for (const id of ["c", "h", "m"] as const) {
      for (let T = 780; T < 800; T += 0.1) {
        const liquidGap = sliceHull(PANELS[id].params, T).ties.some(
          (t) => t.ends[0].phase === "L" && t.ends[1].phase === "L",
        );
        expect(liquidGap).toBe(false);
      }
    }
  });
});

describe("hull with a point phase", () => {
  // (h) at 1000 K: L on the A side, L + S, then S.
  const T = 1000;
  const cs = curves(h, T);
  const plain = hull(cs);
  const below = (X: number, by: number): PointPhase => ({
    kind: "point",
    id: "C",
    X,
    g: hullValue(plain, cs, X) - by,
  });

  it("puts a point below the envelope's hull on the hull, with tangents through it", () => {
    for (const X of [0.3, 0.5, 0.8]) {
      const point = below(X, 0.5);
      const hl = hull([...cs, point]);
      const at = hl.fields.filter((f) => f.kind === "single" && f.phase === "C");
      expect(at).toHaveLength(1);
      const ties = hl.ties.filter((t) => t.ends.some((e) => e.phase === "C"));
      expect(ties).toHaveLength(2);
      for (const t of ties) {
        const other = t.ends.find((e) => e.phase !== "C")!;
        const c = cs.find((cv) => cv.id === other.phase)!;
        const tangentAtPoint = g(c, other.X) + dg(c, other.X) * (point.X - other.X);
        expect(Math.abs(tangentAtPoint - point.g)).toBeLessThan(1e-9);
        // The stored tangent passes through the point too.
        expect(t.intercept + t.slope * point.X).toBeCloseTo(point.g, 9);
      }
    }
  });

  it("skips a point above the hull", () => {
    const hl = hull([...cs, below(0.5, -0.1)]);
    expect(hl.fields.some((f) => f.kind === "single" && f.phase === "C")).toBe(false);
    expect(hl.ties.map((t) => t.ends.map((e) => e.phase))).toEqual(
      plain.ties.map((t) => t.ends.map((e) => e.phase)),
    );
  });

  it("joins two points by a straight tie line", () => {
    const p: PointPhase = { ...below(0.4, 1), id: "C" };
    const q: PointPhase = { ...below(0.6, 1), id: "D" };
    const hl = hull([...cs, p, q]);
    const tie = hl.ties.find((t) => t.ends[0].phase === "C" && t.ends[1].phase === "D")!;
    expect(tie.ends.map((e) => e.X)).toEqual([0.4, 0.6]);
    expect(tie.slope).toBeCloseTo((q.g - p.g) / 0.2, 12);
  });
});

describe("the point-phase path at the pure ends", () => {
  // (h) at 1000 K, as above; a point at X = 0 or X = 1 lies below the envelope there.
  const T = 1000;
  const cs = curves(h, T);
  const plain = hull(cs);
  const point = (id: string, X: number, by: number): PointPhase => ({
    kind: "point",
    id,
    X,
    g: hullValue(plain, cs, X) - by,
  });
  /** The tie line's tangent: through both ends' g, and tangent to a curve at a curve's end. */
  const expectTangent = (
    t: { ends: { phase: string; X: number }[]; slope: number; intercept: number },
    phases: (Curve | PointPhase)[],
  ) => {
    for (const e of t.ends) {
      const ph = phases.find((q) => q.id === e.phase)!;
      const gAt = ph.kind === "point" ? ph.g : g(ph, e.X);
      expect(t.intercept + t.slope * e.X).toBeCloseTo(gAt, 9);
      if (ph.kind === "curve") expect(dg(ph, e.X)).toBeCloseTo(t.slope, 7);
    }
  };

  it.each([0, 1])("refineTie joins a point at X = %i to a curve, in either order", (X) => {
    const c = point("C", X, 0.5);
    const liquid = cs.find((cv) => cv.id === "L")!;
    const [first, second] = X === 0 ? [c, liquid] : [liquid, c];
    const t = refineTie(first, second, X === 0 ? 0 : 0.3, X === 0 ? 0.3 : 1)!;
    expect(t).not.toBeNull();
    expect(t.ends.map((e) => e.phase)).toEqual([first.id, second.id]);
    expect(X === 0 ? t.ends[0].X : t.ends[1].X).toBe(X);
    const other = X === 0 ? t.ends[1].X : t.ends[0].X;
    expect(other > 0 && other < 1).toBe(true);
    expectTangent(t, [c, liquid]);
  });

  it("refineTie joins a point at X = 0 to one at X = 1 by the straight line", () => {
    const p = point("C", 0, 0.2);
    const q = point("D", 1, 0.3);
    const t = refineTie(p, q, 0, 1)!;
    expect(t.ends.map((e) => e.X)).toEqual([0, 1]);
    expect(t.intercept).toBe(p.g);
    expect(t.slope).toBeCloseTo(q.g - p.g, 12);
  });

  it.each([0, 1])("hull takes a point at X = %i, with a tangent from it to a curve", (X) => {
    const c = point("C", X, 0.5);
    const hl = hull([...cs, c]);
    const at = hl.fields.filter((f) => f.kind === "single" && f.phase === "C");
    expect(at).toEqual([{ kind: "single", phase: "C", X: [X, X] }]);
    const ties = hl.ties.filter((t) => t.ends.some((e) => e.phase === "C"));
    expect(ties).toHaveLength(1);
    expectTangent(ties[0]!, [...cs, c]);
    expect(hl.fields[X === 0 ? 0 : hl.fields.length - 1]).toEqual(at[0]);
  });

  it("hull joins points at both ends straight across, when they lie far enough below", () => {
    const p = point("C", 0, 5);
    const q = point("D", 1, 5);
    const hl = hull([...cs, p, q]);
    expect(hl.ties).toHaveLength(1);
    expect(hl.ties[0]!.ends).toEqual([
      { phase: "C", X: 0 },
      { phase: "D", X: 1 },
    ]);
    expect(hl.fields.map((f) => f.kind)).toEqual(["single", "tie", "single"]);
  });
});

describe("hull on degenerate inputs", () => {
  it("gives one phase when only one curve is passed and it has no gap", () => {
    const params: Params = { ...h, alphaL: -10 };
    const hl = hull([curves(params, 900)[0]!]);
    expect(hl.ties).toEqual([]);
    expect(hl.fields).toEqual([{ kind: "single", phase: "L", X: [0, 1] }]);
  });

  it("handles the exact melting point, where both curves meet at the pure end", () => {
    expect(sliceHull(h, 800).ties.every((t) => t.ends[1].X - t.ends[0].X > 0)).toBe(true);
    expect(sliceHull(h, 800 + 1e-10).ties.length).toBeGreaterThan(0);
  });
});

describe("refineTie within one phase", () => {
  it("takes two copies of one curve for the same phase, and returns its binodal", () => {
    // Near the critical point, where Newton on two curves would start by its trivial root.
    const params: Params = { ...h, alphaS: 15 };
    const T = 0.999 * criticalT(params.alphaS);
    const copy = () => curveAt(params, SOLID, T);
    const t = refineTie(copy(), copy(), 0.45, 0.55)!;
    const X = binodal(params.alphaS, T)!;
    expect(t.ends.map((e) => e.X)).toEqual([X, 1 - X]);
  });
});
