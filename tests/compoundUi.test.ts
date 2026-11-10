import { describe, expect, it } from "vitest";
import { boundaries } from "../src/physics/boundaries";
import { fieldsAt } from "../src/physics/cut";
import { scan } from "../src/physics/events";
import { compoundFormula, compoundName } from "../src/physics/fields";
import { COMPOUND } from "../src/physics/gibbs";
import { preset, type PresetId } from "../src/physics/presets";
import { compoundPointAt, distinctTouches, relativeG, slice, sliceXs } from "../src/physics/slice";
import { nameParts, spokenName } from "../src/ui/compoundText";
import { markedPointsOf } from "../src/ui/diagram/linesLayer";
import { compoundLines, COMPOUND_LABEL_GAP, placeCompoundLabel } from "../src/ui/fieldLabels";
import { leverArms, leverOf, leverRows, leverSentence } from "../src/ui/leverText";
import { snapTitle } from "../src/ui/logo";
import { Store } from "../src/ui/state";

// The compound on screen (plan §9 phase 13): its line and its name on the diagram, its point in the
// slice panel, its markers, the logo's snap, the lever rule and its formula's subscripts.

const AB = { A: "A", B: "B" };
const XS = sliceXs(900);

/** A preset's scan, made once. */
const scans = new Map<PresetId, ReturnType<typeof scan>>();
const scanOf = (id: PresetId) => {
  let s = scans.get(id);
  if (!s) scans.set(id, (s = scan(preset(id).params, preset(id).window)));
  return s;
};
const fieldsOf = (id: PresetId, T: number) => fieldsAt(preset(id).params, T, scanOf(id).events);

describe("a line compound's line on the diagram", () => {
  const linesOf = (id: PresetId) => {
    const { params, window } = preset(id);
    return compoundLines(params, boundaries(params, window, scanOf(id)));
  };

  it("runs at X_c over the temperatures where the compound is stable", () => {
    // c1: from the bottom of the window to its congruent melting point.
    const [c1] = linesOf("c1");
    expect(linesOf("c1")).toHaveLength(1);
    expect(c1).toMatchObject({ X: 0.5, T0: 300 });
    expect(c1!.T1).toBeCloseTo(1015.0, 1);
    // c4: from its eutectoid to its peritectic; c7: up to its congruent transformation.
    const [c4] = linesOf("c4");
    expect([c4!.T0, c4!.T1].map((T) => Math.round(T))).toEqual([409, 740]);
    const [c7] = linesOf("c7");
    expect([c7!.T0, Math.round(c7!.T1)]).toEqual([300, 685]);
  });

  it("is none for a compound with a range, or none at all", () => {
    expect(linesOf("c3")).toEqual([]);
    expect(linesOf("h")).toEqual([]);
  });

  it("carries its name beside it at mid-height, left near the right edge, none where short", () => {
    expect(placeCompoundLabel(100, [50, 250], 20, 600)).toEqual({
      x: 100 + COMPOUND_LABEL_GAP + 10,
      y: 150,
    });
    expect(placeCompoundLabel(590, [50, 250], 20, 600)).toEqual({
      x: 590 - COMPOUND_LABEL_GAP - 10,
      y: 150,
    });
    expect(placeCompoundLabel(100, [50, 65], 20, 600)).toBeNull();
  });
});

describe("the markers and the logo's snap", () => {
  it("mark a congruent transformation and a compound's congruent melting point", () => {
    expect(markedPointsOf(scanOf("c7").events).map((e) => e.kind)).toEqual(["congruent"]);
    expect(markedPointsOf(scanOf("c1").events).map((e) => e.kind)).toEqual(["maximum"]);
  });

  it("names the new invariant kinds in the logo's tooltip", () => {
    expect(snapTitle(scanOf("c4").events, 300)).toBe("Snap the cut to the eutectoid, 409 K");
    expect(snapTitle(scanOf("c5").events, 300)).toBe("Snap the cut to the peritectoid, 483 K");
    expect(snapTitle(scanOf("c7").events, 300)).toBe(
      "This system has no invariant to snap the cut to",
    );
  });
});

describe("a line compound in the slice panel", () => {
  it("is a point on the envelope where it is stable, with the tangents through it", () => {
    const { params } = preset("c1");
    const fields = fieldsOf("c1", 900);
    const point = compoundPointAt(params, 900, fields)!;
    expect(point.stable).toBe(true);
    expect(point.X).toBe(0.5);
    const s = slice(params, 900, fields, XS);
    // The L + AB and AB + β tangents both end on it.
    const ends = s.tangents.map((t) => t.points.find((p) => p.phase === COMPOUND));
    expect(ends).toHaveLength(2);
    for (const end of ends) expect(end!.g).toBeCloseTo(point.g, 12);
    // One guide and one marker at X_c, though two tangents touch there.
    const touches = distinctTouches(s.tangents);
    expect(touches.map((t) => t.phase)).toEqual(["L", COMPOUND, "S"]);
  });

  it("lies above the envelope where it is not stable, drawn dashed", () => {
    const { params } = preset("c1");
    const fields = fieldsOf("c1", 1100);
    const point = compoundPointAt(params, 1100, fields)!;
    expect(point.stable).toBe(false);
    // Above the liquid, which is the envelope at X_c there (all liquid).
    expect(fields.map((f) => f.kind === "single" && f.phase)).toContain("L");
    expect(point.g).toBeGreaterThan(relativeG(params, 1100)({ phase: "L", X: 0.5 }));
  });

  it("is none for a compound with a range, which is a curve with its own runs", () => {
    const { params } = preset("c3");
    const fields = fieldsOf("c3", 600);
    expect(compoundPointAt(params, 600, fields)).toBeNull();
    const s = slice(params, 600, fields, XS);
    const gamma = s.runs.filter((r) => r.phase === COMPOUND);
    expect(gamma.some((r) => r.stable)).toBe(true);
    expect(gamma.some((r) => !r.stable)).toBe(true);
    expect(s.shades.map((d) => d.field.kind === "single" && d.field.phase)).toContain(COMPOUND);
  });
});

describe("the lever rule with a compound", () => {
  const at = (id: PresetId, T: number, X0: number) => {
    const store = new Store(preset(id));
    store.setCut(T);
    store.setX0(X0);
    return leverOf(store.state);
  };

  it("names the compound like the other phases, by its formula or as γ", () => {
    const c1 = leverRows(at("c1", 900, 0.6));
    expect(c1.map((r) => [r.name, r.X])).toEqual([
      ["AB", "0.500"],
      ["β", expect.stringMatching(/^0\.9\d\d$/)],
    ]);
    expect(leverArms(at("c1", 900, 0.6)).map((a) => a.text.split(" ")[0])).toEqual(["β", "AB"]);
    const c3 = leverRows(at("c3", 900, 0.3));
    expect(c3.map((r) => r.name)).toEqual(["L", "γ"]);
  });

  it("gives the line compound alone at X₀ = X_c", () => {
    const l = at("c1", 900, 0.5);
    expect(l.kind).toBe("single");
    expect(leverSentence(l)).toBe("Lever rule at X₀ = 0.500: AB: 100 %");
  });
});

describe("a formula's subscripts", () => {
  const decimal = compoundFormula(0.43, AB);

  it("are real subscripts only for decimal ones, around any text", () => {
    expect(nameParts("AB₂ + β", compoundFormula(2 / 3, AB))).toEqual([
      { text: "AB₂ + β", sub: false },
    ]);
    expect(nameParts("L + A₀.₅₇B₀.₄₃", decimal)).toEqual([
      { text: "L + ", sub: false },
      { text: "A", sub: false },
      { text: "0.57", sub: true },
      { text: "B", sub: false },
      { text: "0.43", sub: true },
    ]);
    expect(nameParts("γ", compoundName({ ...preset("c3").params.compound! }, AB))).toEqual([
      { text: "γ", sub: false },
    ]);
    expect(nameParts("α", null)).toEqual([{ text: "α", sub: false }]);
  });

  it("are read aloud as numbers", () => {
    expect(spokenName("A₀.₅₇B₀.₄₃ + β", decimal)).toBe("A 0.57 B 0.43 + β");
    expect(spokenName("AB + β", compoundFormula(0.5, AB))).toBe("AB + β");
  });
});
