// The lever rule (plan §3 `lever`, §4 item 7, §9 phase 7).

import { describe, expect, it } from "vitest";
import { solidNaming, type NameRules } from "../src/physics/fields";
import { lever } from "../src/physics/lever";
import { SOLID } from "../src/physics/gibbs";
import { binodal, type Field, type TieField } from "../src/physics/hull";
import { preset } from "../src/physics/presets";
import { fieldsAt } from "../src/physics/cut";
import { mixtureG } from "../src/physics/slice";
import { x0AfterKey } from "../src/ui/diagram/leverLayer";
import { leverArms, leverOf, leverRows, leverSentence, percents } from "../src/ui/leverText";
import { Store } from "../src/ui/state";
import {
  envelopeAt,
  invariantsOf,
  scanOf,
  SYSTEMS,
  temperatures,
  type TestSystem,
} from "./sliceFixtures";

/** The naming of a system with an α + β gap and no compound. */
const ALPHA_BETA: NameRules = { solid: "alphaBeta", compound: null };

/** Panel (h), as the slice tests name it. */
const H = SYSTEMS.find((s) => s.id === "(h)")!;

const X0S = Array.from({ length: 41 }, (_, k) => k / 40);

describe("lever", () => {
  it.each(SYSTEMS.map((s) => [s.id, s] as const))(
    "%s: the fractions sum to 1 and reproduce X₀, and the mixture's g lies on the envelope",
    (_, sys) => {
      const naming = { solid: solidNaming(scanOf(sys)), compound: null };
      for (const T of temperatures(sys.window, 15)) {
        const fields = fieldsAt(sys.params, T, scanOf(sys).events);
        for (const X0 of X0S) {
          const l = lever(X0, fields, naming);
          expect(l.X0).toBe(X0);
          if (l.kind === "single") {
            expect(l.phases[0].fraction).toBe(1);
            expect(l.phases[0].X).toBe(X0);
          } else if (l.kind === "tie") {
            const [p, q] = l.phases;
            expect(p.fraction! + q.fraction!).toBeCloseTo(1, 12);
            expect(p.fraction! * p.X + q.fraction! * q.X).toBeCloseTo(X0, 12);
            expect(p.fraction!).toBeGreaterThanOrEqual(0);
            expect(q.fraction!).toBeGreaterThanOrEqual(0);
          }
          const gMix = mixtureG(sys.params, T, X0, l.phases);
          expect(gMix).toBeCloseTo(envelopeAt(sys.params, T, fields, X0), 9);
        }
      }
    },
  );

  it("goes to 0 and 1 at the edges of a two-phase field", () => {
    const fields = fieldsAt(H.params, 900, scanOf(H).events);
    const tie = fields.find((f): f is TieField => f.kind === "tie")!;
    const [X1, X2] = [tie.ends[0].X, tie.ends[1].X];
    const at = (X: number) => lever(X, fields, ALPHA_BETA);
    const left = at(X1);
    const right = at(X2);
    expect(left.kind).toBe("tie");
    expect(left.phases.map((p) => p.fraction)).toEqual([1, 0]);
    expect(right.phases.map((p) => p.fraction)).toEqual([0, 1]);
    // Just inside, nearly all of the near phase; just outside, one phase.
    expect(at(X1 + 1e-9).phases[0].fraction).toBeCloseTo(1, 6);
    expect(at(X2 - 1e-9).phases[1]?.fraction).toBeCloseTo(1, 6);
    expect(at(X1 - 1e-6).kind).toBe("single");
    expect(at(X2 + 1e-6).kind).toBe("single");
  });

  it("names the phases as the diagram does: L + β at 900 K and X₀ = 0.8 in (h), α below the eutectic", () => {
    const sys = H;
    const events = scanOf(sys).events;
    const l = lever(0.8, fieldsAt(sys.params, 900, events), ALPHA_BETA);
    expect(l.kind).toBe("tie");
    expect(l.kind === "tie" && l.name).toBe("L + β");
    expect(l.phases.map((p) => p.name)).toEqual(["L", "β"]);
    const one = lever(0.02, fieldsAt(sys.params, 500, events), ALPHA_BETA);
    expect(one).toMatchObject({ kind: "single", name: "α" });
  });

  it("lists the three phases without fractions at an invariant temperature", () => {
    for (const sys of SYSTEMS) {
      for (const inv of invariantsOf(scanOf(sys).events)) {
        const fields = fieldsAt(sys.params, inv.T, scanOf(sys).events);
        const naming = { solid: solidNaming(scanOf(sys)), compound: null };
        const [p1, p2, p3] = inv.points;
        for (const X0 of [p1!.X, 0.5 * (p1!.X + p2!.X), p2!.X, 0.5 * (p2!.X + p3!.X), p3!.X]) {
          const l = lever(X0, fields, naming);
          expect(l.kind, `${sys.id} ${inv.kind} at ${X0}`).toBe("invariant");
          expect(l.phases.map((p) => p.X)).toEqual([p1!.X, p2!.X, p3!.X]);
          expect(l.phases.every((p) => p.fraction === null)).toBe(true);
        }
        // Outside the invariant's line, an ordinary field.
        if (p1!.X > 1e-3) expect(lever(0, fields, naming).kind).toBe("single");
      }
    }
  });

  it("clamps X₀ into [0, 1]", () => {
    const sys = H;
    const fields = fieldsAt(sys.params, 900, scanOf(sys).events);
    expect(lever(-1, fields, ALPHA_BETA).X0).toBe(0);
    expect(lever(2, fields, ALPHA_BETA).X0).toBe(1);
  });
});

describe("the lever's text", () => {
  const store = new Store(preset("h"));

  it("labels each arm with the share of the phase at its other end", () => {
    store.setCut(900);
    store.setX0(0.8);
    const l = leverOf(store.state);
    if (l.kind !== "tie") throw new Error("expected a tie line");
    const [L, beta] = l.phases;
    const arms = leverArms(l);
    // The arm towards L (left) carries β's share, which grows with that arm's length.
    expect(arms[0]!.to).toBe(L.X);
    expect(arms[0]!.text).toMatch(/^β \d+\u00a0%$/);
    expect(arms[1]!.to).toBe(beta.X);
    expect(arms[1]!.text).toMatch(/^L \d+\u00a0%$/);
    const share = (text: string) => Number(text.match(/(\d+)/)![1]);
    expect(share(arms[0]!.text) / 100).toBeCloseTo(beta.fraction!, 2);
    expect(share(arms[0]!.text) + share(arms[1]!.text)).toBe(100);
  });

  it("writes the rows and the screen-reader line", () => {
    store.setCut(900);
    store.setX0(0.8);
    const rows = leverRows(leverOf(store.state));
    expect(rows.map((r) => r.name)).toEqual(["L", "β"]);
    expect(leverSentence(leverOf(store.state))).toMatch(
      /^Lever rule at X₀ = 0\.800: L, X_B = 0\.\d{3}: \d+\u00a0%; β, X_B = 0\.\d{3}: \d+\u00a0%$/,
    );
    // One phase: 100 %.
    store.setX0(0.02);
    store.setCut(500);
    expect(leverSentence(leverOf(store.state))).toBe("Lever rule at X₀ = 0.020: α: 100\u00a0%");
    // At the eutectic: three phases, no shares.
    const eutectic = invariantsOf(store.state.diagram.scan.events)[0]!;
    store.setCut(eutectic.T);
    store.setX0(0.5);
    const at = leverRows(leverOf(store.state));
    expect(at.map((r) => r.name)).toEqual(["α", "L", "β"]);
    expect(at.every((r) => r.share === null)).toBe(true);
    expect(leverSentence(leverOf(store.state))).toMatch(/fractions are not fixed/);
  });

  it("rounds the shares to whole percentages that add up to 100", () => {
    expect(percents(0.375)).toEqual([38, 62]);
    expect(percents(0.635)).toEqual([64, 36]);
    expect(percents(1)).toEqual([100, 0]);
  });
});

describe("the knob's keys", () => {
  it("step X₀ by 0.01 and 0.1, and go to the ends", () => {
    expect(x0AfterKey("ArrowRight", 0.5)).toBe(0.51);
    expect(x0AfterKey("ArrowUp", 0.5)).toBe(0.51);
    expect(x0AfterKey("ArrowLeft", 0.5)).toBe(0.49);
    expect(x0AfterKey("PageUp", 0.5)).toBe(0.6);
    expect(x0AfterKey("PageDown", 0.05)).toBe(-0.05);
    expect(x0AfterKey("Home", 0.5)).toBe(0);
    expect(x0AfterKey("End", 0.5)).toBe(1);
    expect(x0AfterKey("a", 0.5)).toBeNull();
  });
});

describe("the store's lever", () => {
  it("is off at first with X₀ at 0.5, and toggles", () => {
    const store = new Store(preset("h"));
    expect(store.state.showLever).toBe(false);
    expect(store.state.X0).toBe(0.5);
    store.setShowLever(true);
    expect(store.state.showLever).toBe(true);
  });

  it("clamps X₀ and ignores values that are not numbers", () => {
    const store = new Store(preset("h"));
    store.setX0(1.5);
    expect(store.state.X0).toBe(1);
    store.setX0(-0.2);
    expect(store.state.X0).toBe(0);
    store.setX0(Number.NaN);
    expect(store.state.X0).toBe(0);
  });

  it("keeps X₀ when the cut moves, a preset is chosen or a system is applied", () => {
    const store = new Store(preset("h"));
    store.setShowLever(true);
    store.setX0(0.3);
    store.setCut(700);
    expect(store.state.X0).toBe(0.3);
    store.applyPreset("n");
    expect(store.state.X0).toBe(0.3);
    expect(store.state.showLever).toBe(true);
    store.setSystem(preset("m1"));
    expect(store.state.X0).toBe(0.3);
  });
});

// Two edge cases that the code review (plan §12, B10) flagged as uncertain, settled here.
describe("naming and invariants at the edges", () => {
  const CASES = SYSTEMS.map((s) => [s.id, s] as const);

  /** The fields at each scan step, and near each event, where a coincidence is likeliest. */
  function fieldsNear(sys: TestSystem): { T: number; fields: Field[] }[] {
    const { steps, events } = scanOf(sys);
    const out = steps.map((s) => ({ T: s.T, fields: s.hull.fields }));
    for (const e of events) {
      for (const dT of [-2e-3, -1e-6, 0, 1e-6, 2e-3]) {
        const T = e.T + dT;
        if (T > sys.window.Tmin && T < sys.window.Tmax) {
          out.push({ T, fields: fieldsAt(sys.params, T, events) });
        }
      }
    }
    return out;
  }

  it.each(CASES)(
    "%s: a stable solid lies outside its own binodal, so X < 0.5 names its side of the gap",
    (_, sys) => {
      if (solidNaming(scanOf(sys)) !== "alphaBeta") return;
      for (const { T, fields } of fieldsNear(sys)) {
        const b = binodal(sys.params.alphaS, T);
        if (b === null) continue;
        const solids = fields.flatMap((f): number[] => {
          if (f.kind === "single") return f.phase === SOLID ? [...f.X] : [];
          if (f.ends[0].phase === SOLID && f.ends[1].phase === SOLID) return [];
          return f.ends.filter((e) => e.phase === SOLID).map((e) => e.X);
        });
        for (const X of solids) expect(X <= b + 1e-6 || X >= 1 - b - 1e-6).toBe(true);
        // A solid field never straddles the gap, so its midpoint names it correctly.
        for (const f of fields) {
          if (f.kind === "single" && f.phase === SOLID) {
            expect(f.X[1] < 0.5 || f.X[0] > 0.5).toBe(true);
          }
        }
      }
    },
  );

  it.each(CASES)(
    "%s: a zero-width field between two tie lines occurs only at an invariant",
    (_, sys) => {
      const invariants = invariantsOf(scanOf(sys).events);
      for (const { T, fields } of fieldsNear(sys)) {
        for (let k = 1; k + 1 < fields.length; k++) {
          const [left, mid, right] = [fields[k - 1]!, fields[k]!, fields[k + 1]!];
          if (left.kind !== "tie" || right.kind !== "tie" || mid.kind !== "single") continue;
          if (mid.X[0] !== mid.X[1]) continue;
          expect(invariants.some((e) => Math.abs(e.T - T) <= 1e-3)).toBe(true);
        }
      }
    },
  );
});
