import { describe, expect, it } from "vitest";
import {
  BAND_LABEL_GAP,
  placeBandLabels,
  SIDE_INSET,
  type BandLabelRun,
} from "../src/ui/bandLabels";

// The one-phase fields' names over the slice panel's band.

const run = (name: string, x0: number, x1: number, width = 10, point = false): BandLabelRun => ({
  name,
  phase: name,
  x0,
  x1,
  width,
  point,
});

describe("the band's names", () => {
  it("centres each name on its run, left to right", () => {
    const placed = placeBandLabels([run("β", 300, 400), run("L", 0, 200)], 400);
    expect(placed.map((l) => [l.name, l.x])).toEqual([
      ["L", 100],
      ["β", 350],
    ]);
  });

  it("leaves out a field's name where it does not fit over its run", () => {
    const tight = 10 + 2 * BAND_LABEL_GAP;
    expect(placeBandLabels([run("L", 100, 100 + tight)], 400)).toHaveLength(1);
    expect(placeBandLabels([run("L", 100, 99 + tight)], 400)).toHaveLength(0);
  });

  it("names a narrow run on either side, running into the field beside it", () => {
    const placed = placeBandLabels([run("α", 0, 3), run("β", 398, 400)], 400);
    expect(placed.map((l) => [l.name, l.x])).toEqual([
      ["α", 5 + SIDE_INSET],
      ["β", 395 - SIDE_INSET],
    ]);
  });

  it("puts a line compound's name ahead of a side's it would overlap", () => {
    const placed = placeBandLabels([run("α", 0, 3), run("AB", 6, 12, 16, true)], 400);
    expect(placed.map((l) => l.name)).toEqual(["AB"]);
  });

  it("names a line compound's narrow run, ahead of a neighbour it would overlap", () => {
    const placed = placeBandLabels([run("α", 180, 196, 6), run("AB", 197, 203, 16, true)], 400);
    expect(placed.map((l) => l.name)).toEqual(["AB"]);
  });

  it("keeps a name inside the plot area", () => {
    const [l] = placeBandLabels([run("AB", 395, 401, 16, true)], 400);
    expect(l!.x).toBe(392 - SIDE_INSET);
  });
});
