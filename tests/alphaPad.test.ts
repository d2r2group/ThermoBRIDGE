// The α pad (plan §9 phase 17): the map between the pad and (α_s, α_l), the lock to the axes by
// drag and by keys, the T_m,B slider's steps and range, and the values typed in the side column.

import { describe, expect, it } from "vitest";
import {
  alphasAfterKey,
  alphasAt,
  onAxes,
  padXY,
  snapAlphas,
  toAxes,
  typedPoint,
  type Alphas,
} from "../src/ui/alphaKnob";
import { ALPHA_MAX, clampTmB, TMB_MAX, TMB_MIN, type AlphaPoint } from "../src/ui/alphaPoint";
import { GRID_PRESETS, knobText, xcText } from "../src/ui/alphaPad";

const SIDE = 300;
const H: AlphaPoint = { alphaS: 15, alphaL: 0, TmB: 1200, compound: null };

describe("the grid presets' magnet", () => {
  const targets = GRID_PRESETS.map((p) => p.params);
  // On a 300 px pad, 1 kJ/mol is 5 px.
  it("pulls the knob onto a preset within the radius, and leaves it alone beyond it", () => {
    expect(snapAlphas({ alphaS: 14, alphaL: 0.5 }, targets, SIDE, 6)).toEqual({
      alphaS: 15,
      alphaL: 0,
    });
    expect(snapAlphas({ alphaS: 13.5, alphaL: 0.5 }, targets, SIDE, 6)).toEqual({
      alphaS: 13.5,
      alphaL: 0.5,
    });
  });

  it("picks the nearest preset", () => {
    expect(snapAlphas({ alphaS: 0, alphaL: 1 }, targets, SIDE, 6)).toEqual({
      alphaS: 0,
      alphaL: 0,
    });
  });
});

describe("the pad's map", () => {
  it("puts α_s across and α_l up, crossing at the centre", () => {
    expect(alphasAt(SIDE / 2, SIDE / 2, SIDE)).toEqual({ alphaS: 0, alphaL: 0 });
    expect(alphasAt(0, 0, SIDE)).toEqual({ alphaS: -ALPHA_MAX, alphaL: ALPHA_MAX });
    expect(alphasAt(SIDE, SIDE, SIDE)).toEqual({ alphaS: ALPHA_MAX, alphaL: -ALPHA_MAX });
    expect(alphasAt(225, 100, SIDE)).toEqual({ alphaS: 15, alphaL: 10 });
  });

  it("clamps a pointer off the pad to its edges and rounds to 0.5 kJ/mol", () => {
    expect(alphasAt(-40, SIDE + 40, SIDE)).toEqual({ alphaS: -ALPHA_MAX, alphaL: -ALPHA_MAX });
    expect(alphasAt(151.2, 149.4, SIDE)).toEqual({ alphaS: 0, alphaL: 0 });
    expect(alphasAt(153, 150, SIDE)).toEqual({ alphaS: 0.5, alphaL: 0 });
  });

  it("maps back to the same pixels at the edges and the centre", () => {
    for (const p of [
      { alphaS: 0, alphaL: 0 },
      { alphaS: -30, alphaL: 30 },
      { alphaS: 30, alphaL: -30 },
      { alphaS: 15, alphaL: 10 },
    ]) {
      const { x, y } = padXY(p, SIDE);
      expect(alphasAt(x, y, SIDE)).toEqual(p);
    }
    expect(padXY({ alphaS: -30, alphaL: 30 }, SIDE)).toEqual({ x: 0, y: 0 });
    expect(padXY({ alphaS: 0, alphaL: 0 }, SIDE)).toEqual({ x: 150, y: 150 });
  });

  it("marks the seven grid presets", () => {
    expect(GRID_PRESETS.map((p) => p.id).sort()).toEqual(["c", "e", "h", "k", "m", "n", "o"]);
  });

  it("speaks the knob's value", () => {
    expect(knobText({ alphaS: 15, alphaL: 0 })).toBe("αₛ +15, αₗ 0 kJ/mol");
    expect(knobText({ alphaS: 0, alphaL: -2.5 })).toBe("αₛ 0, αₗ −2.5 kJ/mol");
  });
});

describe("the lock", () => {
  it("puts a drag on the nearest axis, α_l = 0 on a tie", () => {
    expect(toAxes({ alphaS: 15, alphaL: 4 })).toEqual({ alphaS: 15, alphaL: 0 });
    expect(toAxes({ alphaS: -3, alphaL: 12 })).toEqual({ alphaS: 0, alphaL: 12 });
    expect(toAxes({ alphaS: -10, alphaL: 10 })).toEqual({ alphaS: -10, alphaL: 0 });
    expect(onAxes({ alphaS: 0, alphaL: 7 })).toBe(true);
    expect(onAxes({ alphaS: 1, alphaL: 7 })).toBe(false);
  });

  it("changes axis through the centre when a drag crosses the diagonal", () => {
    // A drag from (+10, +2) up to (+2, +10): the knob runs in along α_s, then up along α_l.
    const path = [
      { alphaS: 10, alphaL: 2 },
      { alphaS: 6, alphaL: 3 },
      { alphaS: 3, alphaL: 4 },
      { alphaS: 2, alphaL: 10 },
    ].map(toAxes);
    expect(path).toEqual([
      { alphaS: 10, alphaL: 0 },
      { alphaS: 6, alphaL: 0 },
      { alphaS: 0, alphaL: 4 },
      { alphaS: 0, alphaL: 10 },
    ]);
  });
});

describe("the knob's keys", () => {
  const key = (k: string, p: Alphas, locked: boolean, shift = false) =>
    alphasAfterKey(k, shift, p, locked);

  it("step by 1 kJ/mol, by 5 with Shift, and Home goes to the centre", () => {
    expect(key("ArrowRight", { alphaS: 2, alphaL: 3 }, false)).toEqual({ alphaS: 3, alphaL: 3 });
    expect(key("ArrowDown", { alphaS: 2, alphaL: 3 }, false, true)).toEqual({
      alphaS: 2,
      alphaL: -2,
    });
    expect(key("Home", { alphaS: 2, alphaL: 3 }, true)).toEqual({ alphaS: 0, alphaL: 0 });
    expect(key("Enter", { alphaS: 2, alphaL: 3 }, true)).toBeNull();
  });

  it("stay within the pad", () => {
    expect(key("ArrowRight", { alphaS: 29.5, alphaL: 0 }, true, true)).toEqual({
      alphaS: ALPHA_MAX,
      alphaL: 0,
    });
    expect(key("ArrowUp", { alphaS: 0, alphaL: 30 }, false)).toEqual({ alphaS: 0, alphaL: 30 });
  });

  it("under the lock move along the knob's axis, and across it towards the centre", () => {
    expect(key("ArrowLeft", { alphaS: 15, alphaL: 0 }, true)).toEqual({ alphaS: 14, alphaL: 0 });
    expect(key("ArrowUp", { alphaS: 15, alphaL: 0 }, true)).toEqual({ alphaS: 14, alphaL: 0 });
    expect(key("ArrowDown", { alphaS: -15, alphaL: 0 }, true)).toEqual({
      alphaS: -14,
      alphaL: 0,
    });
    expect(key("ArrowRight", { alphaS: 0, alphaL: -8 }, true, true)).toEqual({
      alphaS: 0,
      alphaL: -3,
    });
  });

  it("under the lock pass the centre onto the other axis, in the key's direction", () => {
    expect(key("ArrowUp", { alphaS: 0.5, alphaL: 0 }, true)).toEqual({ alphaS: 0, alphaL: 0.5 });
    expect(key("ArrowLeft", { alphaS: 0, alphaL: 3 }, true, true)).toEqual({
      alphaS: -2,
      alphaL: 0,
    });
    // From the centre each key moves along its own axis.
    expect(key("ArrowDown", { alphaS: 0, alphaL: 0 }, true)).toEqual({ alphaS: 0, alphaL: -1 });
    expect(key("ArrowRight", { alphaS: 0, alphaL: 0 }, true)).toEqual({ alphaS: 1, alphaL: 0 });
  });

  it("under the lock first put a knob off the axes on the nearest one", () => {
    expect(key("ArrowRight", { alphaS: 20, alphaL: 15 }, true)).toEqual({ alphaS: 21, alphaL: 0 });
  });
});

describe("the T_m,B slider", () => {
  it("runs from 805 to 2400 K in 5 K steps, above T_m,A", () => {
    expect([TMB_MIN, TMB_MAX]).toEqual([805, 2400]);
    expect(clampTmB(800)).toBe(805);
    expect(clampTmB(1203)).toBe(1205);
    expect(clampTmB(2500)).toBe(2400);
  });
});

describe("the compound's X_c slider", () => {
  it("speaks and shows the formula and X_B", () => {
    expect(xcText(0.75)).toBe("AB₃, X_B = 0.750");
    expect(xcText(1 / 3)).toBe("A₂B, X_B = 0.333");
  });
});

describe("the typed values", () => {
  it("are clamped into the ranges and rounded to the steps", () => {
    expect(typedPoint("alphaS", 41, H, false)).toEqual({ ...H, alphaS: 30 });
    expect(typedPoint("alphaL", -7.3, H, false)).toEqual({ ...H, alphaL: -7.5 });
    expect(typedPoint("TmB", 700, H, true)).toEqual({ ...H, TmB: 805 });
    expect(typedPoint("TmB", 1333, H, true)).toEqual({ ...H, TmB: 1335 });
    expect(typedPoint("alphaS", NaN, H, true)).toBeNull();
  });

  it("move a compound's X_c to the nearest stop, and clamp and round Δh_f and Δs_f", () => {
    const C: AlphaPoint = { ...H, compound: { Xc: 0.5, dhf: -6, dsf: 0 } };
    expect(typedPoint("Xc", 0.3, C, false)!.compound).toEqual({ Xc: 1 / 3, dhf: -6, dsf: 0 });
    expect(typedPoint("Xc", 0.99, C, false)!.compound!.Xc).toBe(0.9);
    expect(typedPoint("dhf", -30, C, false)!.compound!.dhf).toBe(-20);
    expect(typedPoint("dhf", 2.3, C, false)!.compound!.dhf).toBe(2.5);
    expect(typedPoint("dsf", 9, C, true)!.compound!.dsf).toBe(5);
    expect(typedPoint("dsf", -4.2, C, true)).toEqual({
      ...C,
      compound: { ...C.compound!, dsf: -4 },
    });
    expect(typedPoint("dsf", NaN, C, true)).toBeNull();
  });

  it("ignore a compound field where there is no compound", () => {
    expect(typedPoint("Xc", 0.5, H, false)).toBeNull();
    expect(typedPoint("dhf", -6, H, false)).toBeNull();
  });

  it("under the lock set the other α to 0 for a nonzero α", () => {
    expect(typedPoint("alphaL", 10, H, true)).toEqual({ ...H, alphaS: 0, alphaL: 10 });
    expect(typedPoint("alphaL", 10, H, false)).toEqual({ ...H, alphaL: 10 });
    expect(typedPoint("alphaS", 0, { ...H, alphaS: 0, alphaL: 10 }, true)).toEqual({
      ...H,
      alphaS: 0,
      alphaL: 10,
    });
  });
});
