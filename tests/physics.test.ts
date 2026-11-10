import { describe, expect, it } from "vitest";
import { boundaries } from "../src/physics/boundaries";
import { events } from "../src/physics/events";
import {
  criticalT,
  curves,
  d2g,
  dg,
  fusionGibbs,
  g,
  liquid,
  logit,
  logitState,
  muA,
  muB,
  R,
  type Curve,
} from "../src/physics/gibbs";
import { binodal, hull } from "../src/physics/hull";
import { PANELS } from "../src/physics/presets";
import { newton, solveLinear } from "../src/physics/roots";

const h = PANELS.h.params;

describe("Gibbs energies", () => {
  const cases: [string, Curve][] = [
    ["liquid", curves(h, 700)[0]!],
    ["solid", curves(h, 700)[1]!],
    ["solid, α < 0", curves({ ...h, alphaS: -15 }, 1300)[1]!],
  ];
  const Xs = [1e-6, 0.01, 0.2, 0.5, 0.73, 0.99, 1 - 1e-6];

  it.each(cases)("g′ and g″ of the %s match finite differences", (_, c) => {
    for (const X of Xs) {
      const step = 1e-5 * Math.min(X, 1 - X);
      const fd1 = (g(c, X + step) - g(c, X - step)) / (2 * step);
      const fd2 = (dg(c, X + step) - dg(c, X - step)) / (2 * step);
      expect(Math.abs(fd1 - dg(c, X))).toBeLessThan(1e-6 * Math.max(1, Math.abs(dg(c, X))));
      expect(Math.abs(fd2 - d2g(c, X))).toBeLessThan(1e-6 * Math.max(1, Math.abs(d2g(c, X))));
    }
  });

  it.each(cases)("μ_A and μ_B of the %s are the tangent's ends", (_, c) => {
    for (const X of Xs) {
      expect(muA(c, X)).toBeCloseTo(g(c, X) - X * dg(c, X), 9);
      expect(muB(c, X)).toBeCloseTo(g(c, X) + (1 - X) * dg(c, X), 9);
    }
  });

  it.each(cases)("the logit state of the %s matches X and its derivatives", (_, c) => {
    for (const X of Xs) {
      const u = logit(X);
      const s = logitState(c, u);
      expect(s.x).toBeCloseTo(X, 14);
      expect(s.muA).toBeCloseTo(muA(c, X), 9);
      expect(s.muB).toBeCloseTo(muB(c, X), 9);
      const du = 1e-6;
      const p = logitState(c, u + du);
      const m = logitState(c, u - du);
      expect(s.muA_u).toBeCloseTo((p.muA - m.muA) / (2 * du), 6);
      expect(s.muB_u).toBeCloseTo((p.muB - m.muB) / (2 * du), 6);
    }
  });

  it("the T derivatives of μ match finite differences", () => {
    const u = logit(0.3);
    const dT = 1e-3;
    for (const k of [0, 1]) {
      const s = logitState(curves(h, 700)[k]!, u);
      const p = logitState(curves(h, 700 + dT)[k]!, u);
      const m = logitState(curves(h, 700 - dT)[k]!, u);
      expect(s.muA_T).toBeCloseTo((p.muA - m.muA) / (2 * dT), 8);
      expect(s.muB_T).toBeCloseTo((p.muB - m.muB) / (2 * dT), 8);
    }
  });

  it("puts the pure solids at Δs (T − T_m) below the liquids", () => {
    const [, s] = curves(h, 600);
    expect(s!.gA).toBeCloseTo(fusionGibbs(10, 800, 600), 15);
    expect(s!.gA).toBeCloseTo(-2, 12);
    expect(s!.gB).toBeCloseTo(-6, 12);
  });
});

describe("closed forms", () => {
  it("gives the ideal lens of (n) to 1e-9", () => {
    const { params, window } = PANELS.n;
    const lens = boundaries(params, window).filter(
      (b) => b.phases[0] === "L" && b.phases[1] === "S",
    );
    expect(lens.length).toBe(2);
    let checked = 0;
    for (const b of lens) {
      for (const { X, T } of b.points) {
        if (!(T > params.TmA && T < params.TmB)) continue;
        const RT = R * T;
        const KA = Math.exp(-fusionGibbs(params.dsA, params.TmA, T) / RT);
        const KB = Math.exp(-fusionGibbs(params.dsB, params.TmB, T) / RT);
        const Xl = (1 - KA) / (KB - KA);
        expect(Math.abs(X - (b.side === 0 ? Xl : KB * Xl))).toBeLessThan(1e-9);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(700);
  });

  it("gives a binodal with ln(X / (1 − X)) = α (2X − 1) / RT, topped at α / (2R)", () => {
    const alpha = 20;
    const Tc = criticalT(alpha);
    expect(Tc).toBeCloseTo(1202.72, 2);
    for (const T of [300, 800, 1100, 1200, Tc - 1]) {
      const c = liquid({ ...h, alphaL: alpha }, T);
      const [tie, ...rest] = hull([c]).ties;
      expect(rest).toEqual([]);
      for (const { X } of tie!.ends) {
        const lhs = Math.log(X / (1 - X));
        expect(Math.abs(lhs - (alpha * (2 * X - 1)) / (R * T))).toBeLessThan(
          1e-9 * Math.max(1, Math.abs(lhs)),
        );
      }
      expect(tie!.ends[0].X + tie!.ends[1].X).toBeCloseTo(1, 12);
    }
    // Closer to T_c the gap is narrower than the grid's spacing, but the closed form still holds.
    for (const T of [Tc - 0.01, Tc - 1e-4]) {
      const X = binodal(alpha, T)!;
      expect(X).toBeGreaterThan(0.49);
      expect(Math.abs(Math.log(X / (1 - X)) - (alpha * (2 * X - 1)) / (R * T))).toBeLessThan(1e-12);
    }
    expect(binodal(alpha, Tc + 0.01)).toBeNull();
    expect(binodal(-5, 300)).toBeNull();
    expect(binodal(0, 300)).toBeNull();
  });

  it("puts every stable critical point at α / (2R), X = 1/2", () => {
    for (const id of ["e", "j", "k"] as const) {
      const { params, window } = PANELS[id];
      for (const e of events(params, window).filter((ev) => ev.kind === "critical")) {
        const alpha = e.points[0]!.phase === "L" ? params.alphaL : params.alphaS;
        expect(e.T).toBe(criticalT(alpha));
        expect(e.points[0]!.X).toBe(0.5);
      }
    }
  });

  it("puts a congruent point where g_l − g_s and its slope vanish", () => {
    // (m): α_l − α_s = −10 kJ/mol, so the slope vanishes at X = 0.3 and then T = 710 K exactly.
    const { params, window } = PANELS.m;
    const [min] = events(params, window).filter((e) => e.kind === "minimum");
    expect(min!.T).toBeCloseTo(710, 9);
    expect(min!.points[0]!.X).toBeCloseTo(0.3, 9);
  });
});

describe("roots", () => {
  it("solves a small linear system and reports a singular one", () => {
    expect(
      solveLinear(
        [
          [2, 1],
          [1, 3],
        ],
        [3, 5],
      ),
    ).toEqual([0.8, 1.4]);
    expect(
      solveLinear(
        [
          [1, 2],
          [2, 4],
        ],
        [1, 2],
      ),
    ).toBeNull();
  });

  it("finds a root by Newton and gives up on none", () => {
    const sq = newton(([x]) => ({ f: [x! * x! - 2], J: [[2 * x!]] }), [1]);
    expect(sq![0]).toBeCloseTo(Math.SQRT2, 14);
    expect(newton(([x]) => ({ f: [x! * x! + 1], J: [[2 * x!]] }), [1], { maxIter: 20 })).toBeNull();
  });
});
