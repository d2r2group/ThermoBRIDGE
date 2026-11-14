// The α mode's page (plan §9 phase 16): its starting point, its names, the store's mode round trip
// and the readout of the system's invariants.

import { describe, expect, it } from "vitest";
import { STEP } from "../src/physics/events";
import { compoundPreset, preset } from "../src/physics/presets";
import {
  ALPHA_COMPOUND,
  ALPHA_MAX,
  alphaCaptionParts,
  alphaFormula,
  alphaName,
  alphaPointOf,
  alphaSystem,
  alphaWindow,
  DHF_MAX,
  DHF_MIN,
  DSF_MAX,
  DSF_MIN,
  TMB_MAX,
  TMB_MIN,
  XC_STOPS,
  xcStop,
  type AlphaPoint,
} from "../src/ui/alphaPoint";
import { invariantsReadout } from "../src/ui/controls";
import { NAME_MAX } from "../src/ui/systemFile";
import { matchPreset } from "../src/ui/systemFields";
import { computeDiagram, DEFAULT_COMPONENTS, Store } from "../src/ui/state";

const params = (over: object) => ({ ...preset("h").params, ...over });
/** (h)'s position, without a compound. */
const H: AlphaPoint = { alphaS: 15, alphaL: 0, TmB: 1200, compound: null };

describe("the α mode's starting point", () => {
  it("keeps α_s, α_l and T_m,B inside the ranges", () => {
    expect(alphaPointOf(preset("h").params)).toEqual({
      alphaS: 15,
      alphaL: 0,
      TmB: 1200,
      compound: null,
    });
    expect(alphaPointOf(preset("p3").params)).toEqual({
      alphaS: 17.5,
      alphaL: 20,
      TmB: 2000,
      compound: null,
    });
  });

  it("clamps into the pad's and the slider's ranges and rounds to their steps", () => {
    expect(alphaPointOf(params({ alphaS: 45, alphaL: -31, TmB: 600 }))).toEqual({
      alphaS: ALPHA_MAX,
      alphaL: -ALPHA_MAX,
      TmB: TMB_MIN,
      compound: null,
    });
    expect(alphaPointOf(params({ alphaS: 3.3, alphaL: -0.1, TmB: 1203 }))).toEqual({
      alphaS: 3.5,
      alphaL: 0,
      TmB: 1205,
      compound: null,
    });
    expect(alphaPointOf(preset("p1").params).TmB).toBe(TMB_MAX);
  });

  it("keeps a line compound, on X_c's stops and inside the ranges, and drops one with a range", () => {
    expect(alphaPointOf(compoundPreset("c1").params).compound).toEqual(ALPHA_COMPOUND);
    expect(alphaPointOf(compoundPreset("c8").params).compound).toEqual({
      Xc: 0.75,
      dhf: -13,
      dsf: -3,
    });
    expect(alphaPointOf(compoundPreset("c3").params).compound).toBeNull();
    const line = (Xc: number, dhf: number, dsf: number) =>
      params({ compound: { Xc, dhf, dsf, width: "line", alphaG: 0 } });
    // X_c = 0.3 (A₇B₃) goes to the nearest stop, 1/3 (A₂B).
    expect(alphaPointOf(line(0.3, -30, 12)).compound).toEqual({
      Xc: 1 / 3,
      dhf: DHF_MIN,
      dsf: DSF_MAX,
    });
    expect(alphaPointOf(line(0.97, 9, -20.2)).compound).toEqual({
      Xc: 0.9,
      dhf: DHF_MAX,
      dsf: DSF_MIN,
    });
    expect(alphaPointOf(line(0.04, -6.3, 0.2)).compound).toEqual({ Xc: 0.1, dhf: -6.5, dsf: 0 });
  });

  it("builds a line compound into the system", () => {
    const { params: p } = alphaSystem({ ...H, compound: { Xc: 0.25, dhf: -6, dsf: 1 } });
    expect(p.compound).toEqual({ Xc: 0.25, dhf: -6, dsf: 1, width: "line", alphaG: -150 });
    expect(alphaSystem(H).params.compound).toBeNull();
  });
});

describe("X_c's stops", () => {
  it("have eleven whole-number formulas, mirrored about AB", () => {
    expect(XC_STOPS.map(alphaFormula)).toEqual([
      "A₉B",
      "A₄B",
      "A₃B",
      "A₂B",
      "A₃B₂",
      "AB",
      "A₂B₃",
      "AB₂",
      "AB₃",
      "AB₄",
      "AB₉",
    ]);
  });

  it("snap any X_c to the nearest", () => {
    expect(xcStop(0)).toBe(0);
    expect(xcStop(0.3)).toBe(3);
    expect(xcStop(0.52)).toBe(5);
    expect(xcStop(1)).toBe(10);
  });
});

describe("alphaName", () => {
  it("names a system by its values, within the name's length", () => {
    expect(alphaName({ alphaL: 10, alphaS: 15, TmB: 1200 })).toBe("αₗ +10, αₛ +15, Tₘ,B 1200 K");
    expect(alphaName({ alphaL: 0, alphaS: -2.5, TmB: 805 })).toBe("αₗ 0, αₛ −2.5, Tₘ,B 805 K");
    const longest = alphaName({ alphaL: -27.5, alphaS: -27.5, TmB: 1395 });
    expect(Array.from(longest).length).toBeLessThanOrEqual(NAME_MAX);
  });

  it("appends a line compound's formula only, within the name's length", () => {
    const { params: p } = alphaSystem({ ...H, compound: { Xc: 0.75, dhf: -6, dsf: 0 } });
    expect(alphaName(p)).toBe("αₗ 0, αₛ +15, Tₘ,B 1200 K, AB₃");
    const longest = alphaName(
      alphaSystem({
        alphaS: -12.5,
        alphaL: 10.5,
        TmB: 1205,
        compound: { Xc: 0.4, dhf: -19.5, dsf: -9.5 },
      }).params,
    );
    expect(longest).toBe("αₗ +10.5, αₛ −12.5, Tₘ,B 1205 K, A₃B₂");
    expect(Array.from(longest).length).toBeLessThanOrEqual(NAME_MAX);
  });
});

describe("alphaCaptionParts", () => {
  it("gives both α, signed with one decimal, and both melting points", () => {
    expect(alphaCaptionParts({ alphaS: 15, alphaL: 0, TmA: 800, TmB: 1205 })).toEqual([
      [{ symbol: "α", sub: "s" }, " = +15.0 kJ/mol"],
      [{ symbol: "α", sub: "l" }, " = 0.0 kJ/mol"],
      [{ symbol: "T", sub: "m,A" }, " = 800 K"],
      [{ symbol: "T", sub: "m,B" }, " = 1205 K"],
    ]);
    expect(alphaCaptionParts({ alphaS: -2.5, alphaL: 27.5, TmA: 800, TmB: 805 })[0]![1]).toBe(
      " = −2.5 kJ/mol",
    );
  });

  it("gives a line compound a fifth part, with its formula, Δh_f and Δs_f", () => {
    const { params: p } = alphaSystem({ ...H, compound: { Xc: 0.75, dhf: -6, dsf: 0 } });
    expect(alphaCaptionParts(p)[4]).toEqual([
      "AB₃: Δ",
      { symbol: "h", sub: "f" },
      " = −6.0 kJ/mol, Δ",
      { symbol: "s", sub: "f" },
      " = 0.0 J/(mol·K)",
    ]);
  });
});

describe("Store.setMode", () => {
  it("opens in the Δg^M mode", () => {
    expect(new Store(preset("h")).state.mode).toBe("dg");
  });

  it("enters the α mode at the current system, with the fixed values and no lever rule", () => {
    const store = new Store(preset("p1"));
    store.setShowLever(true);
    store.setCut(1000);
    store.setMode("alpha");
    const s = store.state;
    expect(s.mode).toBe("alpha");
    expect(s.params).toEqual({
      TmA: 800,
      TmB: 2400,
      dsA: 10,
      dsB: 10,
      alphaL: 0,
      alphaS: 15,
      compound: null,
    });
    expect(s.window).toEqual(alphaWindow(s.params.TmB));
    expect(s.components).toEqual(DEFAULT_COMPONENTS);
    expect(s.auto).toBe(false);
    expect(s.showLever).toBe(false);
    expect(s.cut).toBe(1300);
    expect(s.name).toBe("αₗ 0, αₛ +15, Tₘ,B 2400 K");
    expect(s.diagram.scan.step).toBe(STEP);
  });

  it("keeps a line compound on entry, and drops one with a range", () => {
    const c1 = new Store(compoundPreset("c1"));
    c1.setMode("alpha");
    expect(c1.state.params.compound).toMatchObject({ ...ALPHA_COMPOUND, width: "line" });
    expect(c1.state.diagram.naming.compound?.name).toBe("AB");
    expect(c1.state.name).toBe("αₗ 0, αₛ +15, Tₘ,B 1200 K, AB");
    const c3 = new Store(compoundPreset("c3"));
    c3.setMode("alpha");
    expect(c3.state.params.compound).toBeNull();
    expect(c3.state.diagram.naming.compound).toBeNull();
    const h = new Store(preset("h"));
    h.setMode("alpha");
    expect(h.state.params.compound).toBeNull();
  });

  it("counts ticking Line Compound as a move, but not ticking and unticking it", () => {
    const point = alphaPointOf(preset("h").params);
    const ticked = new Store(preset("h"));
    ticked.setMode("alpha");
    ticked.setSystem(alphaSystem({ ...point, compound: ALPHA_COMPOUND }));
    ticked.setMode("dg");
    // (h) with c1's compound is c1.
    expect(ticked.state.name).toBe("Congruent compound");
    expect(matchPreset(ticked.state.params, ticked.state.window, DEFAULT_COMPONENTS)).toBe("c1");

    const custom = new Store(preset("h"));
    custom.setMode("alpha");
    custom.setSystem(alphaSystem({ ...point, compound: { ...ALPHA_COMPOUND, Xc: 0.25 } }));
    custom.setMode("dg");
    expect(custom.state.name).toBe("αₗ 0, αₛ +15, Tₘ,B 1200 K, A₃B");
    expect(custom.state.params.compound).toMatchObject({ Xc: 0.25, width: "line" });

    const back = new Store(preset("h"));
    const before = back.state;
    back.setMode("alpha");
    back.setSystem(alphaSystem({ ...point, compound: ALPHA_COMPOUND }));
    back.setSystem(alphaSystem(point));
    back.setMode("dg");
    expect(back.state).toEqual(before);
  });

  it("brings c3 back unchanged when nothing moved", () => {
    const store = new Store(compoundPreset("c3"));
    const before = store.state;
    store.setMode("alpha");
    store.setMode("dg");
    expect(store.state).toEqual(before);
    expect(store.state.params).toBe(before.params);
  });

  it("names c4 in the menu when the compound's sliders reach it", () => {
    const store = new Store(compoundPreset("c1"));
    store.setMode("alpha");
    const point = alphaPointOf(store.state.params);
    store.setSystem(alphaSystem({ ...point, compound: { Xc: 0.5, dhf: 2, dsf: 5 } }));
    const { params, components } = store.state;
    expect(matchPreset(params, null, components)).toBe("c4");
  });

  it("brings the Δg^M mode's state back unchanged when nothing moved", () => {
    const store = new Store(compoundPreset("c2"), { A: "Cu", B: "Ag" }, "Mine");
    store.setCut(700);
    store.setX0(0.3);
    store.setShowLever(true);
    const before = store.state;
    store.setMode("alpha");
    store.setMode("dg");
    expect(store.state).toEqual(before);
    // The very objects, so the diagram is not recomputed.
    expect(store.state.params).toBe(before.params);
    expect(store.state.diagram).toBe(before.diagram);
  });

  it("keeps the Metastable toggle as the α mode left it", () => {
    const store = new Store(preset("h"));
    store.setMode("alpha");
    store.setShowMetastable(false);
    store.setMode("dg");
    expect(store.state.showMetastable).toBe(false);
  });

  it("clears the moving knob's flag when the α mode is left mid-drag", () => {
    for (const moved of [false, true]) {
      const store = new Store(preset("c"));
      store.setMode("alpha");
      if (moved)
        store.setSystem(alphaSystem({ alphaS: 15, alphaL: 10, TmB: 1200, compound: null }));
      store.setAlphaMoving(true);
      store.setMode("dg");
      expect(store.state.alphaMoving).toBe(false);
    }
  });

  it("takes the α mode's last system as Custom when it moved, keeping X₀ and the lever rule", () => {
    const store = new Store(preset("c"));
    store.setX0(0.25);
    store.setShowLever(true);
    store.setCut(1100);
    store.setMode("alpha");
    store.setSystem(alphaSystem({ alphaS: 15, alphaL: 10, TmB: 1200, compound: null }));
    expect(store.state.name).toBe("αₗ +10, αₛ +15, Tₘ,B 1200 K");
    store.setMode("dg");
    const s = store.state;
    expect(s.mode).toBe("dg");
    expect(s.name).toBe("αₗ +10, αₛ +15, Tₘ,B 1200 K");
    expect(s.params).toEqual({
      TmA: 800,
      TmB: 1200,
      dsA: 10,
      dsB: 10,
      alphaL: 10,
      alphaS: 15,
      compound: null,
    });
    expect(s.window).toEqual(alphaWindow(s.params.TmB));
    expect(s.auto).toBe(false);
    expect(s.cut).toBe(1000);
    expect(s.X0).toBe(0.25);
    expect(s.showLever).toBe(true);
    expect(matchPreset(s.params, s.window, s.components)).toBeNull();
  });

  it("gives with dgState what leaving would give, without leaving (plan §9 phase 20)", () => {
    const cases: [string, (store: Store) => void][] = [
      ["nothing moved", () => {}],
      [
        "moved",
        (store) =>
          store.setSystem(alphaSystem({ alphaS: 15, alphaL: 10, TmB: 1200, compound: null })),
      ],
      [
        "at a preset",
        (store) =>
          store.setSystem(alphaSystem({ alphaS: 0, alphaL: 10, TmB: 1200, compound: null })),
      ],
    ];
    for (const [, move] of cases) {
      const store = new Store(preset("c"));
      store.setShowLever(true);
      store.setX0(0.3);
      expect(store.dgState()).toBe(store.state);
      store.setMode("alpha");
      move(store);
      const before = store.state;
      const seen: unknown[] = [];
      store.subscribe((state) => seen.push(state));
      const view = store.dgState();
      expect(store.state).toBe(before);
      expect(seen).toEqual([]);
      store.setMode("dg");
      const { diagram, atCut, metastableAtCut, ...rest } = store.state;
      const { diagram: d, atCut: a, metastableAtCut: m, ...viewRest } = view;
      expect(viewRest).toEqual(rest);
      expect(d.scan.params).toEqual(diagram.scan.params);
      expect(d.scan.window).toEqual(diagram.scan.window);
      expect(a).toEqual(atCut);
      expect(m).toEqual(metastableAtCut);
    }
  });

  it("takes a preset, with its name and window, when the α mode left off at its parameters", () => {
    const store = new Store(preset("h"));
    store.setMode("alpha");
    store.setSystem(alphaSystem({ alphaS: 0, alphaL: 10, TmB: 1200, compound: null }));
    store.setMode("dg");
    const s = store.state;
    expect(s.name).toBe("Lens with a melting peak");
    expect(s.window).toEqual(preset("o").window);
    expect(s.diagram.scan.window).toEqual(preset("o").window);
    expect(s.cut).toBe(900);
    expect(matchPreset(s.params, s.window, s.components)).toBe("o");
  });

  it("replaces a preview left on screen with the full diagram on leaving", () => {
    const store = new Store(preset("h"));
    store.setMode("alpha");
    const { params, window } = alphaSystem({ alphaS: 10, alphaL: 0, TmB: 1200, compound: null });
    const preview = computeDiagram(params, window, undefined, DEFAULT_COMPONENTS, 4);
    store.setSystem({ params, window }, { diagram: preview });
    store.setMode("dg");
    expect(store.state.diagram.scan.step).toBe(STEP);
  });

  it("names a grid preset's system as the preset in the α mode's menu", () => {
    const store = new Store(preset("p1"));
    store.setMode("alpha");
    store.setSystem(alphaSystem({ alphaS: 0, alphaL: 10, TmB: 1200, compound: null }));
    const { params, window, components } = store.state;
    // By its parameters alone: the α mode's window is not the preset's.
    expect(matchPreset(params, window, components)).toBeNull();
    expect(matchPreset(params, null, components)).toBe("o");
  });

  it("unticks Stay on the axes each time the α mode opens", () => {
    const store = new Store(preset("h"));
    expect(store.state.alphaLock).toBe(false);
    store.setMode("alpha");
    store.setAlphaLock(true);
    expect(store.state.alphaLock).toBe(true);
    store.setMode("dg");
    store.setMode("alpha");
    expect(store.state.alphaLock).toBe(false);
  });

  it("neither snaps the cut nor shows the lever rule in the α mode", () => {
    const store = new Store(preset("h"));
    store.setMode("alpha");
    const cut = store.state.cut;
    store.snapToInvariant();
    store.setShowLever(true);
    expect(store.state.cut).toBe(cut);
    expect(store.state.showLever).toBe(false);
  });
});

describe("invariantsReadout", () => {
  it("lists the invariants as the logo's tooltip names them, or says there are none", () => {
    const h = new Store(preset("h"));
    expect(invariantsReadout(h.state)).toMatch(/^Invariants: eutectic, 63\d K\.$/);
    const p4 = new Store(preset("p4"));
    expect(invariantsReadout(p4.state)).toMatch(
      /^Invariants: peritectic, 821 K; monotectic, 113\d K\.$/,
    );
    expect(invariantsReadout(new Store(preset("n")).state)).toBe("This system has no invariant.");
  });
});
