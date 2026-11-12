import { describe, expect, it } from "vitest";
import { preset } from "../src/physics/presets";
import { cutAfterKey, snapCut } from "../src/ui/cutDrag";
import { TAt, yOf } from "../src/ui/geometry";
import { labelsShown } from "../src/ui/controls";
import { Store } from "../src/ui/state";

describe("Store", () => {
  it("starts with the cut in the middle of the window and the diagram computed", () => {
    const store = new Store(preset("h"));
    expect(store.state.cut).toBe(900);
    expect(store.state.components).toEqual({ A: "A", B: "B" });
    expect(store.state.diagram.scan.events.map((e) => e.kind)).toContain("eutectic");
    expect(store.state.diagram.boundaries.length).toBeGreaterThan(0);
    expect(store.state.diagram.naming.solid).toBe("alphaBeta");
  });

  it("opens on the field names alone, and the Labels button steps to both, to none and back", () => {
    const store = new Store(preset("h"));
    const steps = [labelsShown(store.state)];
    for (let k = 0; k < 3; k++) {
      store.cycleLabels();
      steps.push(labelsShown(store.state));
    }
    expect(steps).toEqual(["field names", "field names and point names", "none", "field names"]);
  });

  it("keeps the labels through the α mode and back", () => {
    const store = new Store(preset("h"));
    store.cycleLabels();
    store.setMode("alpha");
    store.cycleLabels();
    expect(labelsShown(store.state)).toBe("none");
    store.setMode("dg");
    expect(labelsShown(store.state)).toBe("none");
  });

  it("clamps the cut into the window and ignores values that are not numbers", () => {
    const store = new Store(preset("h"));
    store.setCut(2000);
    expect(store.state.cut).toBe(1500);
    store.setCut(-5);
    expect(store.state.cut).toBe(300);
    store.setCut(Number.NaN);
    expect(store.state.cut).toBe(300);
    store.setCut(634.5);
    expect(store.state.cut).toBe(634.5);
  });

  it("tells listeners of each change, with the previous state, and not of a no-op", () => {
    const store = new Store(preset("h"));
    const seen: [number, number][] = [];
    const off = store.subscribe((s, prev) => seen.push([prev.cut, s.cut]));
    store.setCut(700);
    store.setCut(700);
    off();
    store.setCut(800);
    expect(seen).toEqual([[900, 700]]);
  });

  it("recomputes the diagram for a new system, and keeps or resets the cut", () => {
    const store = new Store(preset("h"));
    const first = store.state.diagram;
    store.setCut(1400);
    store.setSystem(preset("m1"));
    expect(store.state.diagram).not.toBe(first);
    expect(store.state.window).toBe(preset("m1").window);
    expect(store.state.cut).toBe(1400);
    store.setSystem(preset("n"), { resetCut: true, components: { A: "Cu", B: "Ni" } });
    expect(store.state.cut).toBe(900);
    expect(store.state.components).toEqual({ A: "Cu", B: "Ni" });
    // Kept when it lies outside the new window: clamped to its edge.
    store.setCut(1500);
    store.setSystem(preset("m1"));
    expect(store.state.cut).toBe(1400);
  });

  it("keeps the fields along the cut in step with the cut and the system", () => {
    const store = new Store(preset("h"));
    // At 900 K in (h): L, then L + β, then β.
    const kinds = () => store.state.atCut.map((f) => f.kind);
    expect(kinds()).toEqual(["single", "tie", "single"]);
    const before = store.state.atCut;
    store.setCut(450);
    expect(store.state.atCut).not.toBe(before);
    // α, α + β, β.
    const tie = store.state.atCut[1]!;
    expect(tie.kind === "tie" && tie.ends.map((e) => e.phase)).toEqual(["S", "S"]);
    store.setSystem(preset("n"), { resetCut: true });
    // The lens at 900 K, above T_m,A: L, L + S, S.
    expect(kinds()).toEqual(["single", "tie", "single"]);
    expect(store.state.atCut[0]!.kind === "single" && store.state.atCut[0]!.phase).toBe("L");
  });
});

describe("the cut's keyboard steps", () => {
  const window = { Tmin: 300, Tmax: 1500 };

  it("step by a round hundredth of the window, ten at a time with Page Up/Down", () => {
    expect(cutAfterKey("ArrowUp", 900, window)).toBe(910);
    expect(cutAfterKey("ArrowRight", 900, window)).toBe(910);
    expect(cutAfterKey("ArrowDown", 900, window)).toBe(890);
    expect(cutAfterKey("ArrowLeft", 900, window)).toBe(890);
    expect(cutAfterKey("PageUp", 900, window)).toBe(1000);
    expect(cutAfterKey("PageDown", 900, window)).toBe(800);
    expect(cutAfterKey("Home", 900, window)).toBe(300);
    expect(cutAfterKey("End", 900, window)).toBe(1500);
    expect(cutAfterKey("a", 900, window)).toBeNull();
  });
});

describe("the marked points' magnet", () => {
  // 1200 K over 400 px: 3 K a pixel, so 6 px is 18 K (a wider radius than the app's, for room).
  const window = { Tmin: 300, Tmax: 1500 };
  const size = { width: 700, height: 400 };
  it("pulls a dragged cut onto the nearest marked point within the radius only", () => {
    expect(snapCut(650, [634.2, 900], window, size, 6)).toBe(634.2);
    expect(snapCut(655, [634.2, 900], window, size, 6)).toBe(655);
    expect(snapCut(890, [634.2, 900], window, size, 6)).toBe(900);
    expect(snapCut(890, [], window, size, 6)).toBe(890);
  });
});

describe("geometry", () => {
  it("maps T to the plot height and back", () => {
    const window = { Tmin: 300, Tmax: 1500 };
    const size = { width: 700, height: 350 };
    expect(yOf(1500, window, size)).toBe(0);
    expect(yOf(300, window, size)).toBe(350);
    expect(TAt(yOf(634.2, window, size), window, size)).toBeCloseTo(634.2, 9);
  });

  it("keeps the metastable tie lines at the cut, recomputed as the cut moves", () => {
    const store = new Store(preset("h"));
    expect(store.state.diagram.metastable).toHaveLength(2);
    expect(store.state.diagram.spinodals.length).toBeGreaterThan(0);
    expect(store.state.metastableAtCut).toEqual([]);
    store.setCut(600);
    expect(store.state.metastableAtCut).toHaveLength(2);
    expect(store.state.metastableAtCut.every((m) => m.at[0].X < m.at[1].X)).toBe(true);
    store.applyPreset("n");
    expect(store.state.diagram.metastable).toEqual([]);
    expect(store.state.diagram.spinodals).toEqual([]);
    expect(store.state.metastableAtCut).toEqual([]);
  });
});
