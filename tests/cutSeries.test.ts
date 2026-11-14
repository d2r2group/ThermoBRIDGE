import { describe, expect, it } from "vitest";
import { invariantsOf, scan } from "../src/physics/events";
import { sliceHull } from "../src/physics/hull";
import { compoundPreset, preset, PRESETS } from "../src/physics/presets";
import { seriesCuts, seriesName } from "../src/ui/cutSeries";
import { fieldKind } from "../src/ui/regions";

// The cuts of a figure series (plan §9 phase 20): one in each band of the same fields, at its
// middle, and one at each invariant, from the top of the window down.

/** The kinds of the fields along the cut at T. */
const kinds = (id: Parameters<typeof preset>[0], T: number) =>
  sliceHull(preset(id).params, T).fields.map(fieldKind);

describe("seriesCuts", () => {
  it("gives (h) the liquid, L + β, both two-phase fields, the eutectic and α + β", () => {
    const { params, window } = preset("h");
    const cuts = seriesCuts(scan(params, window).events, window);
    expect(cuts.map((c) => c.invariant?.kind ?? null)).toEqual([
      null,
      null,
      null,
      "eutectic",
      null,
    ]);
    const [liquid, first, both, eutectic, solid] = cuts as [
      (typeof cuts)[0],
      (typeof cuts)[0],
      (typeof cuts)[0],
      (typeof cuts)[0],
      (typeof cuts)[0],
    ];
    expect(kinds("h", liquid.T)).toEqual(["L"]);
    expect(kinds("h", first.T)).toEqual(["L", "L+S", "S"]);
    expect(kinds("h", both.T)).toEqual(["S", "L+S", "L", "L+S", "S"]);
    expect(kinds("h", solid.T)).toEqual(["S", "S+S", "S"]);
    // The middle of each band, in whole kelvin: (1500 + 1200) / 2, (1200 + 800) / 2.
    expect(liquid.T).toBe(1350);
    expect(first.T).toBe(1000);
    expect(eutectic.T).toBe(eutectic.invariant!.T);
  });

  it.each(PRESETS.map((p) => [p.id] as const))(
    "%s: T decreasing, inside the window, each invariant once, and the bands' fields differ",
    (id) => {
      const { params, window } = PRESETS.find((p) => p.id === id)!;
      const { events } = scan(params, window);
      const cuts = seriesCuts(events, window);
      for (let k = 1; k < cuts.length; k++) expect(cuts[k]!.T).toBeLessThan(cuts[k - 1]!.T);
      for (const c of cuts) {
        expect(c.T).toBeGreaterThan(window.Tmin);
        expect(c.T).toBeLessThan(window.Tmax);
      }
      const inside = invariantsOf(events).filter((e) => e.T > window.Tmin && e.T < window.Tmax);
      expect(cuts.filter((c) => c.invariant).map((c) => c.invariant)).toEqual(
        [...inside].sort((a, b) => b.T - a.T),
      );
      // Two band cuts next to each other lie on either side of an event that changes the fields.
      const bands = cuts.filter((c) => !c.invariant);
      for (let k = 1; k < bands.length; k++) {
        const [upper, lower] = [bands[k - 1]!.T, bands[k]!.T];
        expect(events.some((e) => e.T < upper && e.T > lower)).toBe(true);
      }
    },
  );

  it("gives a band narrower than a kelvin no cut, and a narrow one its exact middle", () => {
    const window = { Tmin: 300, Tmax: 1500 };
    const event = (T: number, sig: string) => ({
      kind: "melting" as const,
      T,
      points: [],
      below: [],
      above: [],
      sigBelow: `${sig}-`,
      sigAbove: sig,
    });
    const cuts = seriesCuts([event(1000, "a"), event(1000.5, "b"), event(1001.5, "c")], window);
    // 1500–1001.5, 1001.5–1000.5 (1 K: its exact middle), 1000.5–1000 (none), 1000–300.
    expect(cuts.map((c) => c.T)).toEqual([1251, 1001, 650]);
  });

  it("cuts an invariant once where another event shares its T", () => {
    const window = { Tmin: 300, Tmax: 1500 };
    const at = (kind: "melting" | "eutectic", sig: string) => ({
      kind,
      T: 900,
      points: [],
      below: [],
      above: [],
      sigBelow: `${sig}-`,
      sigAbove: sig,
    });
    const cuts = seriesCuts([at("melting", "a"), at("eutectic", "b")], window);
    expect(cuts.map((c) => [c.T, c.invariant?.kind ?? null])).toEqual([
      [1200, null],
      [900, "eutectic"],
      [600, null],
    ]);
  });

  it("keeps c1's two eutectics and the bands around its melting peak", () => {
    const { params, window } = compoundPreset("c1");
    const cuts = seriesCuts(scan(params, window).events, window);
    expect(cuts.filter((c) => c.invariant).map((c) => c.invariant!.kind)).toEqual([
      "eutectic",
      "eutectic",
    ]);
    expect(cuts).toHaveLength(8);
  });
});

describe("seriesName", () => {
  it("numbers the cut in two digits and gives its T in whole kelvin", () => {
    expect(seriesName(0, 1350)).toBe("01-1350K");
    expect(seriesName(11, 634.24)).toBe("12-634K");
  });
});
