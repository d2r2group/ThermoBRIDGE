import { describe, expect, it } from "vitest";
import { boundaries } from "../src/physics/boundaries";
import { curveAt, LIQUID } from "../src/physics/gibbs";
import { refineTie, sliceHull } from "../src/physics/hull";
import { metastable, metastableTiesAt, type MetastableTie } from "../src/physics/metastable";
import type { Params } from "../src/physics/gibbs";
import { invariantsOf, scanOf, SYSTEMS, type TestSystem } from "./sliceFixtures";

const extensionsOf = (sys: TestSystem) => metastable(sys.params, sys.window, scanOf(sys));
const CASES = SYSTEMS.map((s) => [s.id, s] as const);

/** The tie line of `ext`'s phases at T, refined from the guess. */
function tieAt(params: Params, ext: MetastableTie, T: number, guess: readonly number[]) {
  const [a, b] = ext.phases;
  const t = refineTie(curveAt(params, a, T), curveAt(params, b, T), guess[0]!, guess[1]!);
  if (!t) throw new Error(`no tie line at ${T} K`);
  return [t.ends[0].X, t.ends[1].X] as const;
}

describe("metastable extensions", () => {
  it("are found where expected: two per eutectic, none without an invariant", () => {
    const byId = new Map(SYSTEMS.map((s) => [s.id, s]));
    const count = (id: string) => extensionsOf(byId.get(id)!).length;
    expect(count("(a)")).toBe(2);
    expect(count("(h)")).toBe(2);
    expect(count("(e)")).toBe(4); // a eutectic and a monotectic
    for (const id of ["(l)", "(m)", "(n)", "(o)", "(p)", "(q)", "(r)", "m1"]) {
      expect(count(id)).toBe(0);
    }
  });

  it.each(CASES)("%s: are all L + S, so no metastable dome is drawn", (_, sys) => {
    for (const ext of extensionsOf(sys)) {
      expect(ext.phases.filter((p) => p === LIQUID)).toHaveLength(1);
    }
  });

  it.each(CASES)("%s: each starts at its invariant and runs away from it", (_, sys) => {
    const invariants = invariantsOf(scanOf(sys).events);
    for (const ext of extensionsOf(sys)) {
      const inv = invariants.find((e) => e.T === ext.T0);
      expect(inv).toBeDefined();
      const first = ext.steps[0]!;
      expect(first.T).toBe(inv!.T);
      for (const X of first.X) expect(inv!.points.map((p) => p.X)).toContain(X);
      for (let k = 1; k < ext.steps.length; k++) {
        expect(ext.direction * (ext.steps[k]!.T - ext.steps[k - 1]!.T)).toBeGreaterThan(0);
      }
      const far = ext.steps.at(-1)!.T;
      expect(far).toBeGreaterThanOrEqual(sys.window.Tmin);
      expect(far).toBeLessThanOrEqual(sys.window.Tmax);
    }
  });

  it.each(CASES)("%s: each continues its stable boundary smoothly", (_, sys) => {
    const drawn = boundaries(sys.params, sys.window, scanOf(sys));
    const dT = 1e-3;
    for (const ext of extensionsOf(sys)) {
      const T0 = ext.T0;
      const X0 = ext.steps[0]!.X;
      const outward = tieAt(sys.params, ext, T0 + ext.direction * dT, X0);
      const inward = tieAt(sys.params, ext, T0 - ext.direction * dT, X0);
      for (const side of [0, 1] as const) {
        // The stable boundary that ends at the invariant on the other side, at the same point.
        const b = drawn.find((d) => {
          const end = ext.direction > 0 ? d.points.at(-1)! : d.points[0]!;
          return (
            d.phases[0] === ext.phases[0] &&
            d.phases[1] === ext.phases[1] &&
            d.side === side &&
            end.T === T0 &&
            end.X === X0[side]
          );
        });
        expect(b, `${ext.phases.join("+")} side ${side} at ${T0} K`).toBeDefined();
        // The same equilibrium on both sides: one-sided slopes agree (no kink).
        const out = (outward[side] - X0[side]) / dT;
        const into = (X0[side] - inward[side]) / dT;
        expect(Math.abs(out - into)).toBeLessThan(1e-2 * Math.abs(into) + 1e-6);
        // The drawn extension follows that equilibrium: its first step is the tie line reached
        // from just outside the invariant.
        const s1 = ext.steps[1]!;
        const from = tieAt(sys.params, ext, s1.T, outward);
        expect(Math.abs(from[side] - s1.X[side])).toBeLessThan(1e-9);
      }
    }
  });

  it.each(CASES)("%s: every step is a tie line that is not on the stable hull", (_, sys) => {
    for (const ext of extensionsOf(sys)) {
      for (const st of ext.steps.slice(1)) {
        const X = tieAt(sys.params, ext, st.T, st.X);
        expect(Math.abs(X[0] - st.X[0])).toBeLessThan(1e-9);
        expect(Math.abs(X[1] - st.X[1])).toBeLessThan(1e-9);
      }
      // Past the invariant the tie line is no longer stable.
      const mid = ext.steps[Math.max(1, ext.steps.length >> 1)]!;
      const ties = sliceHull(sys.params, mid.T).ties;
      const onHull = ties.some(
        (t) => Math.abs(t.ends[0].X - mid.X[0]) < 1e-6 && Math.abs(t.ends[1].X - mid.X[1]) < 1e-6,
      );
      expect(onHull).toBe(false);
    }
  });
});

describe("metastableTiesAt", () => {
  const sys = SYSTEMS.find((s) => s.id === "(h)")!;
  const exts = extensionsOf(sys);

  it("gives each extension that reaches T, with its tie line there", () => {
    // (h): the α side stops at its spinodal near 591 K; the β side runs to the window's floor.
    expect(metastableTiesAt(sys.params, exts, 900)).toEqual([]);
    expect(metastableTiesAt(sys.params, exts, 600)).toHaveLength(2);
    expect(metastableTiesAt(sys.params, exts, 400)).toHaveLength(1);
  });

  it("reproduces the extension's steps", () => {
    for (const ext of exts) {
      for (const st of ext.steps.filter((_, k) => k % 7 === 3)) {
        const [at] = metastableTiesAt(sys.params, [ext], st.T);
        expect(at).toBeDefined();
        expect(Math.abs(at!.at[0].X - st.X[0])).toBeLessThan(1e-9);
        expect(Math.abs(at!.at[1].X - st.X[1])).toBeLessThan(1e-9);
        expect(at!.at.map((e) => e.phase)).toEqual(ext.phases);
      }
    }
  });
});
