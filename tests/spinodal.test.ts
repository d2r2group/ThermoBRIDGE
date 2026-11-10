import { describe, expect, it } from "vitest";
import { criticalT, curves, d2g, LIQUID, R, type Params } from "../src/physics/gibbs";
import { binodal, holdsLiquid, sliceHull } from "../src/physics/hull";
import { fieldsAt } from "../src/physics/cut";
import {
  inLiquid,
  spinodal,
  spinodalPointsAt,
  spinodalT,
  spinodalXs,
  type SpinodalRun,
} from "../src/physics/spinodal";
import { invariantsOf, scanOf, SYSTEMS, temperatures, type TestSystem } from "./sliceFixtures";

/** cut.ts's AT_INVARIANT, K, with room for the bisection's end, about 1e-9 K. */
const AT_INVARIANT = 1e-3 + 1e-6;

const CASES = SYSTEMS.map((s) => [s.id, s] as const);
const runsOf = (sys: TestSystem) => spinodal(sys.params, sys.window, scanOf(sys));
const alphaOf = (params: Params, phase: string) =>
  phase === LIQUID ? params.alphaL : params.alphaS;

/**
 * Whether the hull at T hides the spinodal of `phase` at X: the liquid's in a one-phase liquid
 * field, the solid's in any field with liquid in it (L, L + S, L₁ + L₂).
 */
function hullHides(params: Params, phase: string, T: number, X: number): boolean {
  return sliceHull(params, T).fields.some((f) =>
    f.kind === "single"
      ? f.phase === LIQUID && X >= f.X[0] && X <= f.X[1]
      : phase !== LIQUID &&
        f.ends.some((e) => e.phase === LIQUID) &&
        X >= f.ends[0].X &&
        X <= f.ends[1].X,
  );
}

describe("spinodalXs", () => {
  it("are where g″ = 0", () => {
    for (const alpha of [5, 15, 30, 60]) {
      for (const T of [100, 300, 0.5 * criticalT(alpha), 0.99 * criticalT(alpha)]) {
        const xs = spinodalXs(alpha, T);
        expect(xs).toHaveLength(2);
        const c = {
          ...curves({ TmA: 800, TmB: 1200, dsA: 10, dsB: 10, alphaL: alpha, alphaS: 0 }, T)[0]!,
        };
        for (const X of xs) {
          // Relative to either term of g″ = −2α + RT / (X (1 − X)).
          expect(Math.abs(d2g(c, X)) / (2 * alpha)).toBeLessThan(1e-12);
          expect(spinodalT(alpha, X)).toBeCloseTo(T, 9);
        }
        expect(xs[0]! + xs[1]!).toBeCloseTo(1, 15);
      }
    }
  });

  it("are none for α ≤ 0 or at and above T_c", () => {
    expect(spinodalXs(0, 300)).toEqual([]);
    expect(spinodalXs(-10, 300)).toEqual([]);
    expect(spinodalXs(15, criticalT(15))).toEqual([]);
    expect(spinodalXs(15, criticalT(15) + 1)).toEqual([]);
  });

  it("resolve small X without cancellation", () => {
    const [lo] = spinodalXs(60, 1) as [number, number];
    expect(lo).toBeGreaterThan(0);
    expect(lo * (1 - lo)).toBeCloseTo((R * 1) / 120, 18);
  });
});

describe("the spinodals on the diagram", () => {
  it.each(CASES)("%s: are drawn for each phase with α > 0 only, in the window", (_, sys) => {
    const runs = runsOf(sys);
    for (const r of runs) {
      expect(alphaOf(sys.params, r.phase)).toBeGreaterThan(0);
      for (const p of r.points) {
        expect(p.T).toBeGreaterThanOrEqual(sys.window.Tmin);
        expect(p.T).toBeLessThanOrEqual(sys.window.Tmax);
      }
    }
    for (const phase of ["L", "S"]) {
      if (!(alphaOf(sys.params, phase) > 0))
        expect(runs.some((r) => r.phase === phase)).toBe(false);
    }
  });

  it.each(CASES)(
    "%s: are drawn below the liquidus only, the solid's where all is solid",
    (_, sys) => {
      const TcL = criticalT(sys.params.alphaL);
      const invariantTs = invariantsOf(scanOf(sys).events).map((e) => e.T);
      for (const r of runsOf(sys)) {
        for (let k = 0; k < r.points.length; k++) {
          const p = r.points[k]!;
          const q = r.points[k + 1];
          const probes = q ? [p, { X: 0.5 * (p.X + q.X), T: 0.5 * (p.T + q.T) }] : [p];
          for (const s of probes) {
            // Within 0.05 K of the liquid's critical point the hull takes its gap for rounding.
            if (Math.abs(s.T - TcL) < 0.05) continue;
            // Within AT_INVARIANT of an invariant the fields are the invariant's own (cut.ts
            // `fieldsAt`), so a run may end up to that far past the invariant's line.
            if (invariantTs.some((T) => Math.abs(s.T - T) <= AT_INVARIANT)) continue;
            // A run's end, found by bisection, lies on a field's edge to about 1e-9 in X.
            const hidden = [s.X - 1e-8, s.X, s.X + 1e-8].every((X) =>
              hullHides(sys.params, r.phase, s.T, X),
            );
            if (hidden) {
              throw new Error(`${r.phase} spinodal drawn where hidden at X = ${s.X}, T = ${s.T}`);
            }
          }
        }
      }
    },
  );

  it.each(CASES)("%s: lie inside their phase's own binodal and meet it at the top", (_, sys) => {
    for (const r of runsOf(sys)) {
      const alpha = alphaOf(sys.params, r.phase);
      const Tc = criticalT(alpha);
      for (const p of r.points) {
        const b = binodal(alpha, p.T);
        if (b === null) {
          // Only the top itself, at T_c and X = 1/2.
          expect(p.T).toBeGreaterThan(Tc - 1e-6);
          expect(Math.abs(p.X - 0.5)).toBeLessThan(1e-3);
          continue;
        }
        expect(p.X).toBeGreaterThan(b);
        expect(p.X).toBeLessThan(1 - b);
      }
    }
  });

  it("close over the top of a dome whose critical point is drawn", () => {
    const byId = new Map(SYSTEMS.map((s) => [s.id, s]));
    // (e) and (k): the liquid dome; (j) and (k): the solid dome, stable at its top.
    for (const [id, phase] of [
      ["(e)", "L"],
      ["(k)", "L"],
      ["(j)", "S"],
      ["(k)", "S"],
    ] as const) {
      const sys = byId.get(id)!;
      const Tc = criticalT(alphaOf(sys.params, phase));
      const top = runsOf(sys)
        .filter((r) => r.phase === phase)
        .flatMap((r) => r.points)
        .find((p) => p.X === 0.5);
      expect(top, `${id} ${phase}`).toBeDefined();
      expect(top!.T).toBeCloseTo(Tc, 9);
      // The binodal closes onto the same point.
      expect(Math.abs(binodal(alphaOf(sys.params, phase), Tc - 1e-3)! - 0.5)).toBeLessThan(0.01);
      // One run, unbroken at the top.
      const runs = runsOf(sys).filter((r) => r.phase === phase);
      expect(runs.some((r) => r.points[0]!.X < 0.4 && r.points.at(-1)!.X > 0.6)).toBe(true);
    }
  });

  it("are hidden in the liquid above the liquidus, and the solid's in every field with liquid", () => {
    // (d): α_l = +10 kJ/mol, so its liquid spinodal reaches 601 K, below the liquidus; (h): the
    // solid's dome top at 902 K lies in the liquid field, and its spinodal below it in L + α and
    // L + β.
    const byId = new Map(SYSTEMS.map((s) => [s.id, s]));
    const h = runsOf(byId.get("(h)")!).filter((r) => r.phase === "S");
    expect(h).toHaveLength(2);
    expect(h.every((r) => r.points.every((p) => p.T < criticalT(15) - 30))).toBe(true);
    // The solid's stops at the eutectic, above which every field at its X holds liquid.
    const eutectic = scanOf(byId.get("(h)")!).events.find((e) => e.kind === "eutectic")!;
    for (const r of h) {
      const top = Math.max(...r.points.map((p) => p.T));
      expect(Math.abs(top - eutectic.T)).toBeLessThanOrEqual(AT_INVARIANT);
    }
    const d = runsOf(byId.get("(d)")!).filter((r) => r.phase === "L");
    expect(d.length).toBeGreaterThan(0);
  });
});

/**
 * The runs as the diagram found them before it read the scan (plan §12, CR2): every sample and
 * every bisection step from the fields at its own T, and the liquid's binodal for each.
 */
function exactRuns(sys: TestSystem): SpinodalRun[] {
  const { params, window } = sys;
  const { events } = scanOf(sys);
  const out: SpinodalRun[] = [];
  for (const c of curves(params, window.Tmin)) {
    if (!(c.alpha > 0)) continue;
    const xs = new Set<number>();
    for (const T of [window.Tmin, window.Tmax]) for (const X of spinodalXs(c.alpha, T)) xs.add(X);
    for (let k = 1; k < 400; k++) xs.add(k / 400);
    xs.add(0.5);
    const inWindow = (X: number) => {
      const T = spinodalT(c.alpha, X);
      return T >= window.Tmin - 1e-6 && T <= window.Tmax + 1e-6;
    };
    const point = (X: number) => ({
      X,
      T: Math.min(window.Tmax, Math.max(window.Tmin, spinodalT(c.alpha, X))),
    });
    const visible = (X: number) => {
      if (!inWindow(X)) return false;
      const { T } = point(X);
      const fields = fieldsAt(params, T, events);
      const hidden =
        c.id === LIQUID
          ? inLiquid(params, T, fields, X)
          : fields.some((f) => {
              const [lo, hi] = f.kind === "single" ? f.X : [f.ends[0].X, f.ends[1].X];
              return holdsLiquid(f) && X >= lo && X <= hi;
            });
      return !hidden;
    };
    const edge = (shown: number, hidden: number) => {
      for (let k = 0; k < 30; k++) {
        const mid = 0.5 * (shown + hidden);
        if (visible(mid)) shown = mid;
        else hidden = mid;
      }
      return shown;
    };
    let run: SpinodalRun["points"] | null = null;
    let prevX = NaN;
    let prevShown = false;
    for (const X of [...xs].sort((a, b) => a - b)) {
      const shown = visible(X);
      if (shown && !prevShown && run === null) {
        run = [];
        if (Number.isFinite(prevX) && inWindow(prevX)) run.push(point(edge(X, prevX)));
      }
      if (!shown && run !== null) {
        if (inWindow(X)) run.push(point(edge(prevX, X)));
        if (run.length > 1) out.push({ phase: c.id, points: run });
        run = null;
      }
      if (shown) run!.push(point(X));
      prevX = X;
      prevShown = shown;
    }
    if (run !== null && run.length > 1) out.push({ phase: c.id, points: run });
  }
  return out;
}

describe("the spinodals' visibility from the scan", () => {
  it.each(CASES)("%s: gives the runs of the exact hulls at every sample, to 1e-6", (_, sys) => {
    const runs = runsOf(sys);
    const exact = exactRuns(sys);
    expect(runs.map((r) => [r.phase, r.points.length])).toEqual(
      exact.map((r) => [r.phase, r.points.length]),
    );
    runs.forEach((r, k) =>
      r.points.forEach((p, i) => {
        const q = exact[k]!.points[i]!;
        expect(Math.abs(p.X - q.X)).toBeLessThan(1e-6);
        expect(Math.abs(p.T - q.T)).toBeLessThan(1e-6);
      }),
    );
  });
});

describe("spinodalPointsAt", () => {
  it.each(CASES)("%s: are where g″ = 0, where the diagram draws the spinodal", (_, sys) => {
    const { events } = scanOf(sys);
    for (const T of temperatures(sys.window, 12)) {
      const fields = fieldsAt(sys.params, T, events);
      const byId = new Map(curves(sys.params, T).map((c) => [c.id, c]));
      const points = spinodalPointsAt(sys.params, T, fields);
      for (const p of points) {
        const c = byId.get(p.phase)!;
        expect(Math.abs(d2g(c, p.X)) / (2 * c.alpha)).toBeLessThan(1e-9);
        if (Math.abs(T - criticalT(sys.params.alphaL)) > 0.05) {
          expect(hullHides(sys.params, p.phase, T, p.X)).toBe(false);
        }
      }
      // Each phase's points at T where it is not hidden are all listed.
      for (const c of byId.values()) {
        const xs = spinodalXs(c.alpha, T).filter((X) => !hullHides(sys.params, c.id, T, X));
        expect(points.filter((p) => p.phase === c.id).map((p) => p.X)).toEqual(xs);
      }
    }
  });
});

describe("the solid's spinodal in a field with liquid", () => {
  it("is hidden inside a liquid dome and in L + S (P4)", () => {
    const sys = SYSTEMS.find((s) => s.id === "p4")!;
    const solid = runsOf(sys).filter((r) => r.phase === "S");
    // Its top, at 1203 K in the L₁ + L₂ dome, is no longer drawn.
    expect(solid.flatMap((r) => r.points).some((p) => Math.abs(p.X - 0.5) < 0.05)).toBe(false);
    // The liquid's own spinodal still shows inside its dome.
    const liquid = runsOf(sys).filter((r) => r.phase === "L");
    expect(liquid.flatMap((r) => r.points).some((p) => p.X === 0.5)).toBe(true);
  });
});
