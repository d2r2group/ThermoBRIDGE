import { describe, expect, it } from "vitest";
import { autoWindow, WINDOW_FLOOR } from "../src/physics/autoWindow";
import { invariantsOf, scan } from "../src/physics/events";
import { PANELS, preset, PRESETS } from "../src/physics/presets";
import { checkParams, validate } from "../src/physics/validity";
import { readoutHeading, readoutRows } from "../src/ui/controls";
import { formatEnthalpy, formatInvariantT } from "../src/ui/format";
import { nextInvariant, Store } from "../src/ui/state";
import {
  cleanComponent,
  compoundChoice,
  matchPreset,
  systemFrom,
  systemValues,
} from "../src/ui/systemFields";
import { presetOptionText } from "../src/ui/systemMenu";

const COMPONENTS = { TmA: 800, TmB: 1200, dsA: 10, dsB: 10 };

describe("the store's actions", () => {
  it("applies a preset with its window, the default names, auto off and the cut in the middle", () => {
    const store = new Store(preset("h"));
    store.setSystem(
      { params: { ...COMPONENTS, alphaL: 5, alphaS: 15 }, window: { Tmin: 400, Tmax: 1400 } },
      { components: { A: "Cu", B: "Ag" }, auto: true },
    );
    store.setCut(500);
    expect(store.state.auto).toBe(true);
    store.applyPreset("p1");
    const p1 = preset("p1");
    expect(store.state.params).toEqual(p1.params);
    expect(store.state.window).toEqual({ Tmin: 300, Tmax: 2500 });
    expect(store.state.components).toEqual({ A: "A", B: "B" });
    expect(store.state.auto).toBe(false);
    expect(store.state.cut).toBe(1400);
    expect(invariantsOf(store.state.diagram.scan.events).map((e) => e.kind)).toEqual([
      "peritectic",
    ]);
  });

  it("recomputes the diagram when the same preset is applied again", () => {
    const store = new Store(preset("h"));
    const before = store.state.diagram;
    store.setCut(400);
    store.applyPreset("h");
    expect(store.state.diagram).not.toBe(before);
    expect(store.state.cut).toBe(900);
  });

  it("keeps the auto flag and the names unless they are given", () => {
    const store = new Store(preset("h"));
    store.setSystem(preset("n"), { components: { A: "Cu", B: "Ni" }, auto: true });
    store.setSystem(preset("m"));
    expect(store.state.components).toEqual({ A: "Cu", B: "Ni" });
    expect(store.state.auto).toBe(true);
  });

  it("snaps the cut to the next invariant above it, in order, and wraps round to the lowest", () => {
    const store = new Store(preset("p4"));
    const [peritectic, monotectic] = invariantsOf(store.state.diagram.scan.events);
    expect(peritectic!.T).toBeCloseTo(821.1, 1);
    expect(monotectic!.T).toBeCloseTo(1131.5, 1);
    store.setCut(300);
    store.snapToInvariant();
    expect(store.state.cut).toBe(peritectic!.T);
    store.snapToInvariant();
    expect(store.state.cut).toBe(monotectic!.T);
    store.snapToInvariant();
    expect(store.state.cut).toBe(peritectic!.T);
    // From above the highest, too.
    store.setCut(1400);
    store.snapToInvariant();
    expect(store.state.cut).toBe(peritectic!.T);
  });

  it("snaps to the invariant's exact temperature, with its three points on the cut", () => {
    const store = new Store(preset("h"));
    store.snapToInvariant();
    const eutectic = invariantsOf(store.state.diagram.scan.events)[0]!;
    expect(store.state.cut).toBe(eutectic.T);
    expect(eutectic.T).toBeCloseTo(634.2, 1);
    expect(nextInvariant(store.state.diagram.scan.events, store.state.cut)).toBe(eutectic);
  });

  it("leaves the cut alone in a system without an invariant", () => {
    for (const id of ["n", "m", "o", "m1"] as const) {
      const store = new Store(preset(id));
      expect(nextInvariant(store.state.diagram.scan.events, store.state.cut), id).toBeNull();
      const seen: unknown[] = [];
      store.subscribe((s) => seen.push(s));
      store.snapToInvariant();
      expect(seen, id).toEqual([]);
    }
  });

  it("names the snap target by its kind and its whole kelvins", () => {
    expect(formatInvariantT(634.2)).toBe("634 K");
    expect(formatInvariantT(1131.5)).toBe("1132 K");
  });

  it("toggles the metastable lines", () => {
    const store = new Store(preset("h"));
    expect(store.state.showMetastable).toBe(true);
    store.setShowMetastable(false);
    expect(store.state.showMetastable).toBe(false);
  });
});

describe("autoWindow", () => {
  it("spans 100 K beyond the lowest event and the highest top, rounded out to 100 K", () => {
    // (h): the eutectic at 634.2 K and T_m,B = 1200 K.
    expect(autoWindow(PANELS.h.params)).toEqual({ Tmin: 500, Tmax: 1300 });
    // (n): the lens between the melting points.
    expect(autoWindow(PANELS.n.params)).toEqual({ Tmin: 700, Tmax: 1300 });
    // (r): its congruent maximum at 1401.7 K sets the top.
    expect(autoWindow(PANELS.r.params)).toEqual({ Tmin: 700, Tmax: 1600 });
    // (k): the stable liquid dome's top at 1804.1 K.
    expect(autoWindow(PANELS.k.params)).toEqual({ Tmin: 700, Tmax: 2000 });
    // M1: the stable solid critical point at 360.8 K is the lowest event.
    expect(autoWindow(preset("m1").params)).toEqual({ Tmin: 200, Tmax: 1300 });
  });

  it("does not go below 100 K, and starts there when the liquid reaches below it", () => {
    // The eutectic at 150.8 K would give 0 K.
    expect(autoWindow({ ...COMPONENTS, alphaL: -30, alphaS: 30 }).Tmin).toBe(WINDOW_FLOOR);
    // With α_l = −40 kJ/mol the eutectic lies below 100 K, under the scan, and the liquid is
    // stable at 100 K; the window must not start at the melting point of A instead.
    const deep = { ...COMPONENTS, alphaL: -40, alphaS: 30 };
    expect(autoWindow(deep)).toEqual({ Tmin: WINDOW_FLOOR, Tmax: 1300 });
    expect(validate(deep, autoWindow(deep))).toEqual([]);
  });

  // That the window is valid for all 18 panels and the presets, with its top all liquid, is
  // checked in pipeline.test.ts along with its scan, which saves fitting all 30 twice.

  it("raises its provisional scan above a congruent maximum far above the melting points", () => {
    const params = { ...COMPONENTS, alphaL: 0, alphaS: -60 };
    const w = autoWindow(params);
    expect(validate(params, w)).toEqual([]);
    const maxima = scan(params, w).events.filter((e) => e.kind === "maximum");
    expect(maxima).toHaveLength(1);
    expect(w.Tmax).toBeGreaterThanOrEqual(maxima[0]!.T + 100);
  });

  it("ends at 5000 K at most, and does not scan above it", () => {
    const params = { ...COMPONENTS, TmB: 4950, alphaL: 0, alphaS: 0 };
    expect(autoWindow(params).Tmax).toBe(5000);
    expect(validate(params, autoWindow(params))).toEqual([]);
    // A melting point above the cap is rejected before any scan, which up to 10⁶ K would take
    // seconds (timed in timing.bench.ts).
    const hot = { ...COMPONENTS, TmB: 1e6, alphaL: 0, alphaS: 0 };
    expect(autoWindow(hot).Tmax).toBe(5000);
    expect(validate(hot, autoWindow(hot)).map((i) => i.check)).toEqual(["maxT", "meltingInWindow"]);
  });

  it("rejects a melting point at 5000 K, which no window can hold strictly inside", () => {
    const params = { ...COMPONENTS, TmB: 5000, alphaL: 0, alphaS: 0 };
    expect(autoWindow(params)).toEqual({ Tmin: 700, Tmax: 5000 });
    expect(validate(params, autoWindow(params)).map((i) => i.check)).toEqual([
      "maxT",
      "meltingInWindow",
    ]);
  });

  it("falls back to the melting points for parameters that cannot be scanned", () => {
    const bad = { ...COMPONENTS, alphaL: 0, alphaS: 90 };
    expect(checkParams(bad).map((i) => i.check)).toEqual(["alpha"]);
    expect(autoWindow(bad)).toEqual({ Tmin: 700, Tmax: 1300 });
    const nan = { ...COMPONENTS, TmB: Number.NaN, alphaL: 0, alphaS: 0 };
    expect(validate(nan, autoWindow(nan)).map((i) => i.check)).toEqual(["finite"]);
  });
});

describe("the fields of the Parameters panel", () => {
  it("convert to the parameters and window and back", () => {
    const { params, window } = preset("p3");
    const values = systemValues(params, window);
    // Without a compound its fields show the default compound's values.
    expect(values).toEqual({
      ...params,
      Xc: 0.5,
      dhf: -6,
      dsf: 0,
      alphaG: -150,
      Tmin: 300,
      Tmax: 2100,
    });
    expect(compoundChoice(params)).toEqual({ on: false, width: "line" });
    expect(systemFrom(values, compoundChoice(params))).toEqual({ params, window });
    // No `compound` key at all without one, as a preset without one has none.
    expect("compound" in systemFrom(values).params).toBe(false);
  });

  it("convert a compound to its fields, its box and its Width, and back", () => {
    const c3 = preset("c3");
    const values = systemValues(c3.params, c3.window);
    expect(values).toMatchObject({ Xc: 0.5, dhf: -6, dsf: 0, alphaG: -150 });
    expect(compoundChoice(c3.params)).toEqual({ on: true, width: "range" });
    expect(systemFrom(values, compoundChoice(c3.params))).toEqual({
      params: c3.params,
      window: c3.window,
    });
    // A line ignores α_γ, so its field shows the default, and the system is still c1.
    const c1 = preset("c1");
    const line = systemFrom(systemValues(c1.params, c1.window), compoundChoice(c1.params));
    expect(line.params.compound).toMatchObject({ Xc: 0.5, dhf: -6, dsf: 0, width: "line" });
    expect(matchPreset(line.params, line.window, { A: "A", B: "B" })).toBe("c1");
    // Unticking the box drops the compound.
    expect(systemFrom(values, { on: false, width: "range" }).params).toEqual(PANELS.h.params);
  });

  it("clean the component names", () => {
    expect(cleanComponent("  Cu  ", "A")).toBe("Cu");
    expect(cleanComponent("  ", "B")).toBe("B");
    expect(cleanComponent("Gold  silver", "A")).toBe("Gold silver");
    expect(cleanComponent("Molybdenum alloy", "A")).toBe("Molybdenum a");
  });

  it("show Δh = T_m Δs", () => {
    expect(formatEnthalpy(800, 10)).toBe("8 kJ/mol");
    expect(formatEnthalpy(1234.5, 9.5)).toBe("11.73 kJ/mol");
    expect(formatEnthalpy(Number.NaN, 10)).toBe("—");
  });
});

describe("the System menu", () => {
  it("matches each preset, and Custom after any change", () => {
    const AB = { A: "A", B: "B" };
    for (const p of PRESETS) expect(matchPreset(p.params, p.window, AB)).toBe(p.id);
    const h = preset("h");
    expect(matchPreset({ ...h.params, alphaS: 15.5 }, h.window, AB)).toBeNull();
    expect(matchPreset(h.params, { Tmin: 300, Tmax: 1400 }, AB)).toBeNull();
    expect(matchPreset(h.params, h.window, { A: "Cu", B: "B" })).toBeNull();
    // The eutectic with its automatic window is not the preset either.
    expect(matchPreset(h.params, autoWindow(h.params), AB)).toBeNull();
    // A compound, or a change to one, is not (h) or c1.
    const c1 = preset("c1");
    expect(matchPreset({ ...h.params, compound: c1.params.compound }, h.window, AB)).toBe("c1");
    const dhf = { ...c1.params.compound!, dhf: -5 };
    expect(matchPreset({ ...h.params, compound: dhf }, h.window, AB)).toBeNull();
    expect(matchPreset({ ...h.params, compound: null }, h.window, AB)).toBe("h");
  });

  it("lists the α values and T_m,B in the open list", () => {
    expect(presetOptionText(preset("h"))).toBe("Eutectic: αₗ 0, αₛ +15 kJ/mol; B melts at 1200 K");
    expect(presetOptionText(preset("m1"))).toBe(
      "Melting dip over a solid gap: αₗ −15, αₛ +6 kJ/mol; B melts at 1200 K",
    );
    expect(presetOptionText(preset("p3"))).toBe(
      "Peritectic, flat liquidus: αₗ +20, αₛ +17.5 kJ/mol; B melts at 2000 K",
    );
  });

  it("lists a compound's name and formation values in the open list", () => {
    expect(presetOptionText(preset("c1"))).toBe(
      "Congruent compound: αₗ 0, αₛ +15 kJ/mol; AB, formation Δh −6 kJ/mol",
    );
    expect(presetOptionText(preset("c3"))).toBe(
      "Berthollide compound: αₗ 0, αₛ +15 kJ/mol; γ, formation Δh −6 kJ/mol, αᵧ −150 kJ/mol",
    );
    expect(presetOptionText(preset("c7"))).toBe(
      "Compound that dissolves in the solid: αₗ 0, αₛ 0 kJ/mol; AB, formation Δh −6 kJ/mol, " +
        "Δs −3 J/(mol·K)",
    );
    expect(presetOptionText(preset("c8"))).toBe(
      "Metatectic: αₗ +19, αₛ 0 kJ/mol; B melts at 1800 K, AB₃, formation Δh −13 kJ/mol, " +
        "Δs −3 J/(mol·K)",
    );
    expect(presetOptionText(preset("c9"))).toBe(
      "Monotectoid: αₗ +30, αₛ +15 kJ/mol; AB₉, formation Δh −2 kJ/mol, Δs −1 J/(mol·K)",
    );
  });
});

describe("the readout", () => {
  const rowsAt = (id: Parameters<typeof preset>[0], T: number) => {
    const store = new Store(preset(id));
    store.setCut(T);
    return readoutRows(store.state);
  };

  it("lists the fields along the cut with the names of `fields`", () => {
    const at900 = rowsAt("h", 900);
    expect(at900.map((r) => r.name)).toEqual(["L", "L + β", "β"]);
    expect(at900.map((r) => r.text)).toEqual([
      "0 to 0.638: L",
      "0.638 to 0.948: L + β",
      "0.948 to 1: β",
    ]);
    expect(rowsAt("h", 450).map((r) => r.name)).toEqual(["α", "α + β", "β"]);
    expect(rowsAt("h", 700).map((r) => r.name)).toEqual(["α", "L + α", "L", "L + β", "β"]);
    // A solid gap under a stable dome top, a liquid gap, and the S of a system without a gap.
    expect(rowsAt("k", 600).map((r) => r.name)).toEqual(["α", "α₁ + α₂", "α"]);
    expect(rowsAt("e", 1150).map((r) => r.name)).toContain("L₁ + L₂");
    expect(rowsAt("n", 1000).map((r) => r.name)).toEqual(["L", "L + S", "S"]);
  });

  it("names a compound and its fields, a line compound at its one X", () => {
    const c1 = rowsAt("c1", 900);
    expect(c1.map((r) => r.name)).toEqual(["L", "L + AB", "AB", "AB + β", "β"]);
    expect(c1[2]!.text).toBe("at 0.500: AB");
    expect(rowsAt("c3", 600).map((r) => r.name)).toEqual(["α", "α + γ", "γ", "γ + β", "β"]);
    // c7's solid has no gap, so it is one solution, α, on both sides of AB and above it.
    expect(rowsAt("c7", 900).map((r) => r.name)).toEqual(["L", "L + α", "α"]);
    expect(rowsAt("c7", 1000).map((r) => r.name)).toEqual(["L", "L + α", "α"]);
    expect(rowsAt("c7", 500).map((r) => r.name)).toEqual(["α", "α + AB", "AB", "AB + α", "α"]);
  });

  it("reads a formula with decimal subscripts aloud as its numbers", () => {
    const c1 = preset("c1");
    const Xc43 = {
      ...c1,
      params: { ...c1.params, compound: { ...c1.params.compound!, Xc: 0.43 } },
    };
    const store = new Store(Xc43);
    store.setCut(500);
    const rows = readoutRows(store.state);
    expect(rows.map((r) => r.name)).toContain("A₀.₅₇B₀.₄₃");
    expect(rows.map((r) => r.text)).toContain("at 0.430: A 0.57 B 0.43");
  });

  it("joins up across [0, 1], each row starting where the last one ended", () => {
    for (const p of PRESETS) {
      const store = new Store(p);
      const rows = readoutRows(store.state);
      expect(rows[0]!.from, p.id).toBe(0);
      expect(rows.at(-1)!.to, p.id).toBe(1);
      for (let k = 1; k < rows.length; k++) expect(rows[k]!.from).toBe(rows[k - 1]!.to);
    }
  });

  it("writes small solubilities as powers of ten", () => {
    const rows = rowsAt("c", 400);
    expect(rows.map((r) => r.name)).toEqual(["α", "α + β", "β"]);
    expect(rows[0]!.text).toMatch(/^0 to \d\.\d·10⁻[⁰¹²³⁴⁵⁶⁷⁸⁹]+: α$/);
  });

  it("names the cut and the component in its heading", () => {
    const store = new Store(preset("h"));
    store.setSystem(preset("h"), { components: { A: "Cu", B: "Ag" } });
    expect(readoutHeading(store.state)).toBe(
      "Fields along the cut at 900.0 K, by mole fraction of Ag",
    );
  });
});
