// The intermediate compound γ (plan §9 phase 12): its model, the hull with it, its events, the
// line limit, its validity limits, its names and the lever rule through it.

import { describe, expect, it } from "vitest";
import { fieldsAt } from "../src/physics/cut";
import {
  invariantKind,
  invariantsOf,
  scan as scanAnew,
  type DiagramEvent,
  type Scan,
} from "../src/physics/events";
import { compoundFormula, fields as namingOf } from "../src/physics/fields";
import {
  compoundPhase,
  dg,
  fusionGibbs,
  formationGibbs,
  g,
  logit,
  logitState,
  phaseAt,
  phases,
  R,
  solidLine,
  type Compound,
  type Curve,
  type Params,
  type PointPhase,
} from "../src/physics/gibbs";
import { sliceHull, type TieField } from "../src/physics/hull";
import { pointCongruentSystem, pointInvariantSystem, type System } from "../src/physics/invariants";
import { lever } from "../src/physics/lever";
import { slice, sliceXs } from "../src/physics/slice";
import type { PlotWindow } from "../src/physics/plotWindow";
import {
  COMPOUND_PRESETS,
  compoundPreset,
  PANELS,
  type CompoundPresetId,
} from "../src/physics/presets";
import { checkSystem, validate, type ValidityCheck } from "../src/physics/validity";

const scans = new Map<string, Scan>();
function scan(params: Params, window: PlotWindow): Scan {
  const key = JSON.stringify([params, window]);
  let s = scans.get(key);
  if (!s) scans.set(key, (s = scanAnew(params, window)));
  return s;
}
const scanOf = (id: CompoundPresetId) => {
  const p = compoundPreset(id);
  return scan(p.params, p.window);
};

/** (h)'s or another system's α with a line compound at X_c = 0.5 unless given. */
const withLine = (base: Params, c: Partial<Compound>): Params => ({
  ...base,
  compound: { Xc: 0.5, dhf: 0, dsf: 0, width: "line", alphaG: 0, ...c },
});
const WIDE: PlotWindow = { Tmin: 100, Tmax: 1500 };

const c3 = compoundPreset("c3").params;
const c1 = compoundPreset("c1").params;

describe("the compound's model", () => {
  const Ts = [300, 700, 1200];

  it("puts the minimum of g_γ − r_s at X_c, with value F(T)", () => {
    for (const T of Ts) {
      const gamma = compoundPhase(c3, T) as Curve;
      const slopeOfLine = fusionGibbs(c3.dsB, c3.TmB, T) - fusionGibbs(c3.dsA, c3.TmA, T);
      expect(g(gamma, 0.5) - solidLine(c3, 0.5, T)).toBeCloseTo(
        formationGibbs(c3.compound!, T),
        12,
      );
      expect(dg(gamma, 0.5) - slopeOfLine).toBeCloseTo(0, 12);
    }
  });

  it("does so off X = 0.5 too", () => {
    const params = { ...c3, compound: { ...c3.compound!, Xc: 0.3 } };
    const gamma = compoundPhase(params, 700) as Curve;
    const slopeOfLine = fusionGibbs(10, 1200, 700) - fusionGibbs(10, 800, 700);
    expect(g(gamma, 0.3) - solidLine(params, 0.3, 700)).toBeCloseTo(-6, 12);
    expect(dg(gamma, 0.3) - slopeOfLine).toBeCloseTo(0, 12);
  });

  it("has gAT and gBT that match finite differences in T", () => {
    for (const T of Ts) {
      const at = (t: number) => compoundPhase(c3, t) as Curve;
      const h = 1e-3;
      const c = at(T);
      expect((at(T + h).gA - at(T - h).gA) / (2 * h)).toBeCloseTo(c.gAT, 10);
      expect((at(T + h).gB - at(T - h).gB) / (2 * h)).toBeCloseTo(c.gBT, 10);
    }
  });

  it("makes a line compound the point (X_c, r_s + F)", () => {
    const pt = compoundPhase(c1, 600) as PointPhase;
    expect(pt).toMatchObject({ kind: "point", id: "C", X: 0.5 });
    expect(pt.g).toBeCloseTo(solidLine(c1, 0.5, 600) - 6, 12);
  });

  it("adds γ to the phases only when there is a compound", () => {
    expect(phases(PANELS.h.params, 600).map((p) => p.id)).toEqual(["L", "S"]);
    expect(phases({ ...PANELS.h.params, compound: null }, 600).map((p) => p.id)).toEqual([
      "L",
      "S",
    ]);
    expect(phases(c1, 600).map((p) => p.id)).toEqual(["L", "S", "C"]);
  });
});

describe("the hull with a compound", () => {
  it("leaves a point above an all-liquid or all-solid envelope out, with no HullError", () => {
    expect(sliceHull(c1, 1300).fields).toEqual([{ kind: "single", phase: "L", X: [0, 1] }]);
    // (n)'s α: γ dissolves into the solid near 228 K, and is above it at 400 K.
    const n = withLine(PANELS.n.params, { dhf: -2, dsf: -3 });
    expect(sliceHull(n, 400).fields).toEqual([{ kind: "single", phase: "S", X: [0, 1] }]);
    // Just above c1's congruent melting point, where the grid alone would keep the point.
    const hasC = (T: number) =>
      sliceHull(c1, T).fields.some((f) => f.kind === "single" && f.phase === "C");
    expect(hasC(1015.02)).toBe(true);
    expect(hasC(1015.03)).toBe(false);
  });

  it("gives tie lines with equal μ at both ends, and tangents through the point", () => {
    for (const p of COMPOUND_PRESETS) {
      for (const step of scanOf(p.id).steps.filter((_, k) => k % 37 === 0)) {
        for (const t of step.hull.ties) checkTie(p.params, step.T, t);
      }
    }
  });
});

/**
 * μ equal at both ends of a tie line (1e-9 relative), or its tangent through a point end. Each μ
 * also gets the error of rebuilding it from X, a double: RT·ε/(1 − X) or RT·ε/X per ulp of X,
 * which matters at an end within 1e-8 of a pure component (c8's B-rich solid at 300 K).
 */
function checkTie(params: Params, T: number, t: TieField) {
  const onTangent = (X: number) => t.intercept + t.slope * X;
  for (const e of t.ends) {
    const ph = phaseAt(params, e.phase, T);
    if (ph.kind === "point") {
      expect(Math.abs(onTangent(e.X) - ph.g)).toBeLessThan(1e-9 * Math.max(1, Math.abs(ph.g)));
      continue;
    }
    const s = logitState(ph, logit(e.X));
    const ofX = R * T * Number.EPSILON * 4;
    const tol = (mu: number, fromX: number) => 1e-9 * Math.max(1, Math.abs(mu)) + 1e-12 + fromX;
    expect(Math.abs(s.muA - t.intercept)).toBeLessThan(tol(s.muA, (ofX * e.X) / (1 - e.X)));
    expect(Math.abs(s.muB - (t.intercept + t.slope))).toBeLessThan(tol(s.muB, ofX));
  }
}

const kindsAndT = (evs: DiagramEvent[]) =>
  evs.filter((e) => e.kind !== "melting").map((e) => [e.kind, e.T] as const);

describe("the events with a compound", () => {
  // The trial's events (plan §9 phase 12), stepped in 1 K, without the melting points.
  const expected: Record<CompoundPresetId, [string, number][]> = {
    c1: [
      ["eutectic", 760],
      ["eutectic", 964],
      ["maximum", 1016],
    ],
    c2: [
      ["eutectic", 674],
      ["peritectic", 726],
    ],
    c3: [
      // The trial's α_γ = −150 kJ/mol (phase 13 moved c3 there from −40).
      ["eutectic", 763],
      ["eutectic", 971],
      ["maximum", 1017],
    ],
    c4: [
      ["eutectoid", 409],
      ["eutectic", 669],
      ["peritectic", 740],
    ],
    c5: [
      ["peritectoid", 483],
      ["eutectic", 635],
    ],
    c6: [
      ["peritectic", 813],
      ["peritectic", 1274],
      ["syntectic", 1467],
      ["critical", 1804],
    ],
    // Phase 13's c7: no trial, so its expected event is the one the core computed (§2.1).
    c7: [["congruent", 684.7]],
    // c8 widens the random search's metatectic below; its events are the core's as well.
    c8: [
      ["peritectic", 992.7],
      ["metatectic", 1402.3],
      ["congruent", 1693.7],
      ["maximum", 1906.6],
    ],
  };

  it.each(Object.keys(expected) as CompoundPresetId[])(
    "%s yields the trial's events within the trial's 1 K steps",
    (id) => {
      const got = kindsAndT(scanOf(id).events);
      expect(got.map(([k]) => k)).toEqual(expected[id].map(([k]) => k));
      got.forEach(([, T], k) => expect(Math.abs(T - expected[id][k]![1])).toBeLessThan(1.5));
    },
  );

  it("pins every compound preset's events as a regression snapshot", () => {
    const round = (x: number, d: number) => Number(x.toFixed(d));
    const all = Object.fromEntries(
      COMPOUND_PRESETS.map((p) => [
        p.id,
        scanOf(p.id).events.map(
          (e) =>
            `${e.kind} ${round(e.T, 3)} K: ${e.points.map((q) => `${q.phase} ${round(q.X, 4)}`).join(", ")}`,
        ),
      ]),
    );
    expect(all).toMatchSnapshot();
  });

  it("gives c3's γ field X_B 0.46–0.54 at 600 K, and melts it off X_c", () => {
    const gamma = sliceHull(c3, 600).fields.find((f) => f.kind === "single" && f.phase === "C")!;
    expect(gamma.kind === "single" && gamma.X[0]).toBeCloseTo(0.46, 2);
    expect(gamma.kind === "single" && gamma.X[1]).toBeCloseTo(0.54, 2);
    const top = scanOf("c3").events.find((e) => e.kind === "maximum")!;
    expect(top.points.map((p) => p.phase)).toEqual(["L", "C"]);
    expect(top.points[0]!.X).toBeGreaterThan(0.51);
  });

  it("puts each invariant's three points on one tangent, through the point where there is one", () => {
    for (const p of COMPOUND_PRESETS) {
      for (const e of invariantsOf(scanOf(p.id).events)) {
        const ends = e.points.map((q) => ({ q, ph: phaseAt(p.params, q.phase, e.T) }));
        const curve = ends.find(({ ph }) => ph.kind === "curve")!;
        const s = logitState(curve.ph as Curve, logit(curve.q.X));
        for (const { q, ph } of ends) {
          const tangent = s.muA + (s.muB - s.muA) * q.X;
          const gq = ph.kind === "point" ? ph.g : g(ph, q.X);
          expect(Math.abs(gq - tangent), `${p.id} ${e.kind}`).toBeLessThan(1e-8);
        }
      }
    }
  });

  /** The largest difference between the Jacobian and central differences of the residuals. */
  function jacobianError(sys: System, v: number[], h: number[]): number {
    const { J } = sys(v);
    let worst = 0;
    v.forEach((_, k) => {
      const up = [...v];
      const down = [...v];
      up[k]! += h[k]!;
      down[k]! -= h[k]!;
      const [fu, fd] = [sys(up).f, sys(down).f];
      fu.forEach((x, r) => {
        const fd1 = (x - fd[r]!) / (2 * h[k]!);
        worst = Math.max(worst, Math.abs(fd1 - J[r]![k]!) / Math.max(1, Math.abs(J[r]![k]!)));
      });
    });
    return worst;
  }

  it("solves the point cases with Jacobians that match finite differences", () => {
    const c2 = compoundPreset("c2").params;
    const inv = pointInvariantSystem(c2, c2.compound!, "L", "S");
    expect(jacobianError(inv, [logit(0.43), logit(0.92), 725], [1e-6, 1e-6, 1e-4])).toBeLessThan(
      1e-6,
    );
    const melt = pointCongruentSystem(c1, c1.compound!, "L");
    expect(jacobianError(melt, [1000], [1e-3])).toBeLessThan(1e-6);
    // The congruent solve lands where the liquid at X_c meets the point.
    const top = scanOf("c1").events.find((e) => e.kind === "maximum")!;
    expect(top.points.map((p) => [p.phase, p.X])).toEqual([
      ["L", 0.5],
      ["C", 0.5],
    ]);
    expect(Math.abs(melt([top.T]).f[0]!)).toBeLessThan(1e-12);
  });

  it("classifies the invariants without liquid in the middle (plan's table)", () => {
    expect(invariantKind("S", "C", "S", true)).toBe("eutectoid");
    expect(invariantKind("S", "S", "C", true)).toBe("monotectoid");
    expect(invariantKind("C", "S", "S", true)).toBe("monotectoid");
    expect(invariantKind("L", "S", "C", true)).toBe("metatectic");
    expect(invariantKind("S", "C", "S", false)).toBe("peritectoid");
    expect(invariantKind("L", "C", "S", false)).toBe("peritectic");
    expect(invariantKind("L", "C", "L", false)).toBe("syntectic");
    expect(invariantKind("S", "L", "C", true)).toBe("eutectic");
    expect(invariantKind("S", "L", "C", false)).toBeNull();
  });

  // Systems found by a random search over the limits (November 2026).
  it.each([
    [
      "monotectoid",
      { ...PANELS.h.params, TmB: 1700, alphaS: 5 },
      { Xc: 0.9, dhf: -0.5, dsf: -1 },
      { Tmin: 100, Tmax: 1800 },
      251.6,
      ["S", "S", "C"],
    ],
    [
      "metatectic",
      { ...PANELS.h.params, TmB: 1800, alphaL: 15, alphaS: 0 },
      { Xc: 0.65, dhf: -9, dsf: 0 },
      { Tmin: 100, Tmax: 1900 },
      1654.0,
      ["L", "S", "C"],
    ],
    ["congruent", PANELS.n.params, { dhf: -2, dsf: -3 }, WIDE, 228.2, ["S", "C"]],
    ["congruent", PANELS.n.params, { dhf: 1, dsf: 8 }, WIDE, 447.1, ["S", "C"]],
  ] as const)("finds a %s", (kind, base, c, window, T, phasesAt) => {
    const params = withLine(base, c);
    expect(validate(params, window)).toEqual([]);
    const e = scan(params, window).events.find((ev) => ev.kind === kind)!;
    expect(e.T).toBeCloseTo(T, 1);
    expect(e.points.map((p) => p.phase)).toEqual(phasesAt);
  });

  it("names a congruent transformation in either sense", () => {
    const cooling = scan(withLine(PANELS.n.params, { dhf: -2, dsf: -3 }), WIDE).events[0]!;
    const heating = scan(withLine(PANELS.n.params, { dhf: 1, dsf: 8 }), WIDE).events[0]!;
    expect([cooling.kind, cooling.sigBelow, cooling.sigAbove]).toEqual([
      "congruent",
      "S S|C C|S",
      "S",
    ]);
    expect([heating.kind, heating.sigBelow, heating.sigAbove]).toEqual([
      "congruent",
      "S",
      "S S|C C|S",
    ]);
  });

  it("names a solid without a gap α on both sides of the compound and above its transformation", () => {
    const params = withLine(PANELS.n.params, { dhf: -6, dsf: -3 });
    const window: PlotWindow = { Tmin: 300, Tmax: 1500 };
    const scanned = scan(params, window);
    expect(scanned.events.find((e) => e.kind === "congruent")!.T).toBeCloseTo(684.7, 1);
    const naming = namingOf(params, window, scanned);
    const names = (T: number) => naming.name(sliceHull(params, T)).map((f) => f.name);
    // (n)'s solid has no gap (α_s = 0), so it is one solution on both sides of AB (phase 13).
    expect(names(400)).toEqual(["α", "α + AB", "AB", "AB + α", "α"]);
    expect(names(750)).toEqual(["α"]);
    // With (h)'s gap, which the compound hides, it is α and β (c1).
    const c1Naming = namingOf(c1, compoundPreset("c1").window, scanOf("c1"));
    expect(c1Naming.solid).toBe("alphaBeta");
  });
});

describe("the line limit", () => {
  it("narrows c3's γ field towards X_c and moves its events towards c1's as α_γ falls", () => {
    const alphas = [-40, -80, -120, -160, -200];
    const runs = alphas.map((alphaG) => {
      const params = { ...c3, compound: { ...c3.compound!, alphaG } };
      const f = sliceHull(params, 600).fields.find((x) => x.kind === "single" && x.phase === "C")!;
      return {
        width: f.kind === "single" ? f.X[1] - f.X[0] : NaN,
        Ts: kindsAndT(scan(params, compoundPreset("c3").window).events).map(([, T]) => T),
      };
    });
    const line = kindsAndT(scanOf("c1").events).map(([, T]) => T);
    for (let k = 1; k < runs.length; k++) {
      expect(runs[k]!.width).toBeLessThan(runs[k - 1]!.width);
      runs[k]!.Ts.forEach((T, j) => {
        expect(Math.abs(T - line[j]!)).toBeLessThan(Math.abs(runs[k - 1]!.Ts[j]! - line[j]!));
      });
    }
    expect(runs.at(-1)!.width).toBeLessThan(0.08);
  });
});

describe("the compound's validity limits", () => {
  const base = compoundPreset("c3");
  const checks = (c: Partial<Compound>, p: Partial<Params> = {}): [ValidityCheck, string[]][] =>
    validate(
      { ...base.params, ...p, compound: { ...base.params.compound!, ...c } },
      base.window,
    ).map((i) => [i.check, i.fields]);

  it("pass c1–c8", () => {
    for (const p of COMPOUND_PRESETS) {
      expect(checkSystem(p.params, p.window, scanOf(p.id))).toMatchObject({ ok: true });
    }
  });

  it("reject each broken limit, naming its keys", () => {
    expect(checks({ Xc: Number.NaN })).toEqual([["finite", ["Xc"]]]);
    expect(checks({ Xc: 0.04 })).toEqual([["compoundX", ["Xc"]]]);
    expect(checks({ Xc: 0.96 })).toEqual([["compoundX", ["Xc"]]]);
    expect(checks({ dhf: -31 })).toEqual([["formation", ["dhf"]]]);
    expect(checks({ dhf: 10.5, dsf: -21 })).toContainEqual(["formation", ["dhf", "dsf"]]);
    expect(checks({ alphaG: 0 })).toEqual([["alphaG", ["alphaG"]]]);
    expect(checks({ alphaG: -201 })).toEqual([["alphaG", ["alphaG"]]]);
    expect(checks({ dsf: 10 }, { dsA: 5, dsB: 5 })).toContainEqual(["compoundMelts", ["dsf"]]);
    // a(T) and b(T) below 0: pure γ would undercut the pure solids.
    expect(checks({ alphaG: -10, dhf: -6 })).toEqual([["compoundEnds", ["alphaG", "dhf"]]]);
  });

  it("ignore α_γ for a line compound, and accept the edges of the ranges", () => {
    expect(checks({ width: "line", alphaG: Number.NaN })).toEqual([]);
    expect(checks({ Xc: 0.05, width: "line", dhf: -2 })).toEqual([]);
    expect(checks({ dhf: -30, alphaG: -200 })).toEqual([]);
  });
});

describe("names and the lever rule with a compound", () => {
  const AB = { A: "A", B: "B" };

  it("names a line compound by its formula", () => {
    const name = (Xc: number, names = AB) => compoundFormula(Xc, names).name;
    expect(name(0.5)).toBe("AB");
    expect(name(2 / 3)).toBe("AB₂");
    expect(name(0.25)).toBe("A₃B");
    expect(name(0.4)).toBe("A₃B₂");
    expect(name(0.4004)).toBe("A₃B₂");
    expect(name(2 / 3, { A: "Cu", B: "Mg" })).toBe("CuMg₂");
    const odd = compoundFormula(0.43, AB);
    expect(odd.name).toBe("A₀.₅₇B₀.₄₃");
    expect(odd.spoken).toBe("A 0.57 B 0.43");
    expect(odd.parts).toEqual([
      { text: "A", sub: false },
      { text: "0.57", sub: true },
      { text: "B", sub: false },
      { text: "0.43", sub: true },
    ]);
  });

  it("names the fields of c1, c3 and c4 as plan §9 phase 12 sets out", () => {
    const names = (id: CompoundPresetId, T: number, components = AB) => {
      const p = compoundPreset(id);
      return namingOf(p.params, p.window, scanOf(id), components)
        .name(sliceHull(p.params, T))
        .map((f) => f.name);
    };
    expect(names("c1", 600)).toEqual(["α", "α + AB", "AB", "AB + β", "β"]);
    expect(names("c1", 900)).toEqual(["L", "L + AB", "AB", "AB + β", "β"]);
    expect(names("c1", 600, { A: "Cu", B: "Mg" })).toContain("CuMg");
    expect(names("c3", 900)).toEqual(["L", "L + γ", "γ", "γ + β", "β"]);
    // Below the eutectoid the S + S tie line spans X_c.
    expect(names("c4", 350)).toEqual(["α", "α + β", "β"]);
  });

  it("names an S + S tie line on one side of X_c α₁ + α₂", () => {
    const params = withLine(
      { ...PANELS.h.params, TmB: 1700, alphaS: 5 },
      {
        Xc: 0.9,
        dhf: -0.5,
        dsf: -1,
      },
    );
    const window = { Tmin: 100, Tmax: 1800 };
    const names = namingOf(params, window, scan(params, window))
      .name(sliceHull(params, 260))
      .map((f) => f.name);
    expect(names).toContain("α₁ + α₂");
  });

  it("gives AB 100 % at X_c on c1, a tie line beside it, and three phases at an invariant", () => {
    const naming = namingOf(c1, compoundPreset("c1").window, scanOf("c1"));
    const events = scanOf("c1").events;
    const at600 = fieldsAt(c1, 600, events);
    expect(lever(0.5, at600, naming)).toMatchObject({
      kind: "single",
      name: "AB",
      phases: [{ name: "AB", X: 0.5, fraction: 1 }],
    });
    const beside = lever(0.51, at600, naming);
    expect(beside.kind).toBe("tie");
    expect(beside.phases.map((p) => p.name)).toEqual(["AB", "β"]);
    const eutectic = invariantsOf(events)[0]!;
    const atInv = lever(0.3, fieldsAt(c1, eutectic.T, events), naming);
    expect(atInv.kind).toBe("invariant");
    expect(atInv.phases.map((p) => p.name)).toEqual(["α", "L", "AB"]);
  });
});

describe("the slice with a line compound", () => {
  it("keeps the two tangents through the point apart, and joins an invariant's", () => {
    const events = scanOf("c1").events;
    const two = slice(c1, 600, fieldsAt(c1, 600, events), sliceXs(200));
    expect(two.tangents.map((t) => t.points.map((p) => p.phase))).toEqual([
      ["S", "C"],
      ["C", "S"],
    ]);
    const eutectic = invariantsOf(events)[0]!;
    const three = slice(c1, eutectic.T, fieldsAt(c1, eutectic.T, events), sliceXs(200));
    expect(three.tangents.map((t) => t.points.map((p) => p.phase))).toEqual([
      ["S", "L", "C"],
      ["C", "S"],
    ]);
  });
});
