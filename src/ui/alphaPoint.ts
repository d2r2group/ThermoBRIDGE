// The α mode's systems (plan §9 phases 15–17 and 19, §10.1): the values the mode keeps fixed, the
// window that follows T_m,B, the ranges and steps of the knob, the slider and the line compound's
// three sliders, a position rounded to the steps, the system there, its name and the diagram's
// caption. No DOM and no store here, so the store and the drag's cache can both use it.

import type { Compound, Params } from "../physics/gibbs";
import { compoundFormula } from "../physics/fields";
import type { PlotWindow } from "../physics/plotWindow";
import type { System } from "../physics/presets";
import type { LabelPart } from "./axisLabels";
import { signed, signedTenth } from "./format";

/** The α mode's window starts here, K, below the lowest eutectic on the pad (122 K). */
export const ALPHA_TMIN = 100;
/**
 * The α mode's window never ends below this, K: (k)'s top, which holds every liquid dome on the
 * pad (its top, α_l/2R, is 1804 K at α_l = +30 kJ/mol).
 */
export const ALPHA_TMAX = 1900;

/**
 * The α mode's window at `TmB` (§10.1 item 1): from ALPHA_TMIN to ALPHA_TMAX, or to T_m,B plus
 * 100 K rounded up to 100 K where that is higher. The knob leaves it as it is; only T_m,B moves
 * it. A melting peak above it (α_l > 0 > α_s) is cut off at the top.
 */
export function alphaWindow(TmB: number): PlotWindow {
  return { Tmin: ALPHA_TMIN, Tmax: Math.max(ALPHA_TMAX, Math.ceil((TmB + 100) / 100) * 100) };
}
/** The components the α mode keeps but for T_m,B: the grid's (§2.1). */
const FIXED = { TmA: 800, dsA: 10, dsB: 10 } as const;
/** The knob's step in α_s and α_l, kJ/mol, and the slider's in T_m,B, K. */
export const ALPHA_STEP = 0.5;
export const TMB_STEP = 5;
/** The pad's range of α_s and α_l, ±ALPHA_MAX kJ/mol (§10.1 item 2). */
export const ALPHA_MAX = 30;
/**
 * The slider's range of T_m,B, K (§10.1 item 2). Its floor is above T_m,A = 800 K, where a system
 * cannot be computed (§9 phase 15); its top is P1's, where (h)'s α gives a peritectic. On the axes
 * a peritectic needs T_m,B ≥ 1800 K (α_l = 0, α_s = +15); off them there is one already at
 * 1000 K (α_l = +20, α_s = +15 to +20).
 */
export const TMB_MIN = 805;
export const TMB_MAX = 2400;

/**
 * The α mode's line compound (plan §9 phase 19): its X_c = X_B, its Δh_f, kJ/mol, and its Δs_f,
 * J/(mol·K). A compound with a range is not used in the α mode.
 */
export interface AlphaCompound {
  Xc: number;
  dhf: number;
  dsf: number;
}

/**
 * X_c's eleven stops (§10.1 item 5), each with a whole-number formula: A₉B, A₄B, A₃B, A₂B, A₃B₂,
 * AB, A₂B₃, AB₂, AB₃, AB₄, AB₉.
 */
export const XC_STOPS: readonly number[] = [
  1 / 10,
  1 / 5,
  1 / 4,
  1 / 3,
  2 / 5,
  1 / 2,
  3 / 5,
  2 / 3,
  3 / 4,
  4 / 5,
  9 / 10,
];
/** The ranges and steps of Δh_f, kJ/mol, and Δs_f, J/(mol·K), below Δs_A = Δs_B so γ melts. */
export const DHF_MIN = -20;
export const DHF_MAX = 5;
export const DHF_STEP = 0.5;
export const DSF_MIN = -10;
export const DSF_MAX = 5;
export const DSF_STEP = 0.5;
/**
 * The compound when *Line Compound* is first ticked: c1's (AB, Δh_f = −6 kJ/mol, Δs_f = 0). Not
 * systemFields.ts's DEFAULT_COMPOUND, whose module imports the store, which imports this one.
 */
export const ALPHA_COMPOUND: AlphaCompound = { Xc: 1 / 2, dhf: -6, dsf: 0 };
/** The α_γ a line compound carries and ignores: DEFAULT_COMPOUND's. */
const LINE_ALPHA_G = -150;

/**
 * A position of the α mode: the knob's (α_s, α_l), kJ/mol, the slider's T_m,B, K, and the line
 * compound, or null for none.
 */
export interface AlphaPoint {
  alphaS: number;
  alphaL: number;
  TmB: number;
  compound: AlphaCompound | null;
}

/** `v` rounded to a multiple of `step`, without a negative zero. */
const roundTo = (v: number, step: number) => Math.round(v / step) * step + 0;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** An α_s or α_l, kJ/mol, clamped into the pad's range and rounded to the knob's step. */
export const clampAlpha = (v: number) => roundTo(clamp(v, -ALPHA_MAX, ALPHA_MAX), ALPHA_STEP);

/** A T_m,B, K, clamped into the slider's range and rounded to its step. */
export const clampTmB = (v: number) => roundTo(clamp(v, TMB_MIN, TMB_MAX), TMB_STEP);

/** The index of the X_c stop nearest `Xc`, the lower one on a tie. */
export function xcStop(Xc: number): number {
  let best = 0;
  for (let i = 1; i < XC_STOPS.length; i++) {
    if (Math.abs(XC_STOPS[i]! - Xc) < Math.abs(XC_STOPS[best]! - Xc)) best = i;
  }
  return best;
}

/** An X_c moved to the nearest stop. */
export const clampXc = (v: number) => XC_STOPS[xcStop(v)]!;

/** A Δh_f, kJ/mol, clamped into its range and rounded to its step. */
export const clampDhf = (v: number) => roundTo(clamp(v, DHF_MIN, DHF_MAX), DHF_STEP);

/** A Δs_f, J/(mol·K), clamped into its range and rounded to its step. */
export const clampDsf = (v: number) => roundTo(clamp(v, DSF_MIN, DSF_MAX), DSF_STEP);

/** `c` on X_c's stops and inside the ranges of Δh_f and Δs_f, rounded to their steps. */
export const clampCompound = (c: AlphaCompound): AlphaCompound => ({
  Xc: clampXc(c.Xc),
  dhf: clampDhf(c.dhf),
  dsf: clampDsf(c.dsf),
});

/** `p` rounded to the steps of the knob, the slider and the compound's sliders. */
export function quantise(p: AlphaPoint): AlphaPoint {
  return {
    alphaS: roundTo(p.alphaS, ALPHA_STEP),
    alphaL: roundTo(p.alphaL, ALPHA_STEP),
    TmB: roundTo(p.TmB, TMB_STEP),
    compound: p.compound && {
      Xc: clampXc(p.compound.Xc),
      dhf: roundTo(p.compound.dhf, DHF_STEP),
      dsf: roundTo(p.compound.dsf, DSF_STEP),
    },
  };
}

/** Whether two compounds of the α mode are the same; null for none. */
export const sameCompound = (a: AlphaCompound | null, b: AlphaCompound | null) =>
  a === null || b === null ? a === b : a.Xc === b.Xc && a.dhf === b.dhf && a.dsf === b.dsf;

/** Whether two positions are the same, the compound included. */
export const samePoint = (a: AlphaPoint, b: AlphaPoint) =>
  a.alphaS === b.alphaS &&
  a.alphaL === b.alphaL &&
  a.TmB === b.TmB &&
  sameCompound(a.compound, b.compound);

/**
 * Where the α mode starts from a system (§9 phases 16 and 19): its α_s, α_l and T_m,B clamped
 * into the pad's and the slider's ranges and rounded to their steps, and its line compound moved
 * into the compound's ranges and onto X_c's stops; a compound with a range is dropped.
 */
export function alphaPointOf({ alphaS, alphaL, TmB, compound: c }: Params): AlphaPoint {
  return {
    alphaS: clampAlpha(alphaS),
    alphaL: clampAlpha(alphaL),
    TmB: clampTmB(TmB),
    compound: c && c.width === "line" ? clampCompound(c) : null,
  };
}

/** The system at `p`, with the fixed components, its line compound and the α mode's window. */
export function alphaSystem(p: AlphaPoint): System {
  const compound: Compound | null = p.compound && {
    ...p.compound,
    width: "line",
    alphaG: LINE_ALPHA_G,
  };
  const params: Params = { ...FIXED, TmB: p.TmB, alphaL: p.alphaL, alphaS: p.alphaS, compound };
  return { params, window: alphaWindow(p.TmB) };
}

/** A line compound's formula with the components A and B: "AB₃". */
export const alphaFormula = (Xc: number) => compoundFormula(Xc, { A: "A", B: "B" }).name;

/**
 * The name of the system at `p`, as the Δg^M mode takes it on leaving the α mode (§9 phases 16
 * and 19): "αₗ +10, αₛ +15, Tₘ,B 1200 K", with a line compound's formula after it ("…, AB₃"),
 * within the 40-character name for every position.
 */
export function alphaName({
  alphaS,
  alphaL,
  TmB,
  compound: c,
}: Pick<Params, "alphaS" | "alphaL" | "TmB" | "compound">): string {
  const name = `αₗ ${signed(alphaL)}, αₛ ${signed(alphaS)}, Tₘ,B ${TmB} K`;
  return c ? `${name}, ${alphaFormula(c.Xc)}` : name;
}

/**
 * The α mode's caption in the diagram (diagram/alphaCaption.ts), as axis-label pieces: α_s =
 * +15.0 kJ/mol, α_l = 0.0 kJ/mol, T_m,A = 800 K and T_m,B = 1200 K, and with a compound a fifth,
 * "AB₃: Δh_f = −6.0 kJ/mol, Δs_f = 0.0 J/(mol·K)", which the caption sets on a line of its own.
 */
export function alphaCaptionParts({
  alphaS,
  alphaL,
  TmA,
  TmB,
  compound: c,
}: Pick<Params, "alphaS" | "alphaL" | "TmA" | "TmB" | "compound">): LabelPart[][] {
  const parts: LabelPart[][] = [
    [{ symbol: "α", sub: "s" }, ` = ${signedTenth(alphaS)} kJ/mol`],
    [{ symbol: "α", sub: "l" }, ` = ${signedTenth(alphaL)} kJ/mol`],
    [{ symbol: "T", sub: "m,A" }, ` = ${TmA} K`],
    [{ symbol: "T", sub: "m,B" }, ` = ${TmB} K`],
  ];
  if (c) {
    parts.push([
      `${alphaFormula(c.Xc)}: Δ`,
      { symbol: "h", sub: "f" },
      ` = ${signedTenth(c.dhf)} kJ/mol, Δ`,
      { symbol: "s", sub: "f" },
      ` = ${signedTenth(c.dsf)} J/(mol·K)`,
    ]);
  }
  return parts;
}
