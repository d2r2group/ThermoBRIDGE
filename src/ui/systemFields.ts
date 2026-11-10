// The system as the controls see it (plan §4 items 4–6), adapted from pTerrain's
// ui/substanceFields.ts: the Parameters panel's field keys and labels, the conversion between
// them and the parameters and window, what Apply makes of them (`prepareSystem`), the cleaned
// component names and the preset they match. No DOM here, so it can be tested in Node.

import { fitWindow } from "../physics/autoWindow";
import type { Scan } from "../physics/events";
import { sameParams, type Compound, type Params } from "../physics/gibbs";
import type { PlotWindow } from "../physics/plotWindow";
import { PRESETS, type PresetId } from "../physics/presets";
import { checkParams, checkSystem, type SystemKey, type ValidityIssue } from "../physics/validity";
import { DEFAULT_COMPONENTS, type Components } from "./state";

/** The numeric inputs of the Parameters panel: the parameters, the compound's and the window edges. */
export type FieldKey = SystemKey;

/** One numeric field: its key, its label as HTML (a fixed string), its unit, its spoken name. */
export interface FieldSpec {
  key: FieldKey;
  html: string;
  unit: string;
  spoken: string;
}

const field = (key: FieldKey, html: string, unit: string, spoken: string): FieldSpec => ({
  key,
  html,
  unit,
  spoken,
});

/**
 * The fields of each group (plan §4 item 6), molar quantities lowercase and variables italic with
 * the subscripts upright. The component names sit in the Components group before its numbers.
 */
export const SOLUTION_FIELDS: readonly FieldSpec[] = [
  field("alphaL", "<i>α</i><sub>l</sub>", "kJ/mol", "alpha l, liquid"),
  field("alphaS", "<i>α</i><sub>s</sub>", "kJ/mol", "alpha s, solid"),
];
export const COMPONENT_FIELDS: readonly FieldSpec[] = [
  field("TmA", "<i>T</i><sub>m,A</sub>", "K", "melting point of A"),
  field("TmB", "<i>T</i><sub>m,B</sub>", "K", "melting point of B"),
  field("dsA", "Δ<i>s</i><sub>A</sub>", "J/(mol·K)", "entropy of fusion of A"),
  field("dsB", "Δ<i>s</i><sub>B</sub>", "J/(mol·K)", "entropy of fusion of B"),
];
export const COMPOUND_FIELDS: readonly FieldSpec[] = [
  field("Xc", "<i>X</i><sub>c</sub>", "", "composition, mole fraction of B"),
  field("dhf", "Δ<i>h</i><sub>f</sub>", "kJ/mol", "formation enthalpy"),
  field("dsf", "Δ<i>s</i><sub>f</sub>", "J/(mol·K)", "formation entropy"),
  field("alphaG", "<i>α</i><sub>γ</sub>", "kJ/mol", "alpha gamma, compound"),
];
export const WINDOW_FIELDS: readonly FieldSpec[] = [
  field("Tmin", "<i>T</i><sub>min</sub>", "K", "lowest temperature"),
  field("Tmax", "<i>T</i><sub>max</sub>", "K", "highest temperature"),
];
/** Every numeric field, in the panel's order. */
export const FIELDS: readonly FieldSpec[] = [
  ...SOLUTION_FIELDS,
  ...COMPONENT_FIELDS,
  ...COMPOUND_FIELDS,
  ...WINDOW_FIELDS,
];
export const FIELD_KEYS: readonly FieldKey[] = FIELDS.map((f) => f.key);

/**
 * A record with one entry for each of `keys`. `Object.fromEntries` types its result by `string`,
 * so the one cast is here.
 */
export function recordOf<K extends string, V>(
  keys: readonly K[],
  value: (key: K) => V,
): Record<K, V> {
  return Object.fromEntries(keys.map((key) => [key, value(key)])) as Record<K, V>;
}

/** The longest component name, so that it fits under its end of the X axis. */
export const COMPONENT_NAME_MAX = 12;

/**
 * What the Compound fieldset's fields show while there is no compound, and α_γ while it is a
 * line: c1's, with c3's α_γ (plan §2.1).
 */
export const DEFAULT_COMPOUND: Compound = {
  Xc: 0.5,
  dhf: -6,
  dsf: 0,
  width: "line",
  alphaG: -150,
};

/** The Compound fieldset's box and its Width control (plan §9 phase 13). */
export interface CompoundChoice {
  on: boolean;
  width: Compound["width"];
}

/** The choice that a system's compound (or its absence) shows. */
export function compoundChoice(params: Params): CompoundChoice {
  const c = params.compound;
  return c ? { on: true, width: c.width } : { on: false, width: DEFAULT_COMPOUND.width };
}

/**
 * The parameters and window as field values. Without a compound its fields show
 * DEFAULT_COMPOUND's, and for a line α_γ shows its default, since a line ignores it.
 */
export function systemValues(params: Params, window: PlotWindow): Record<FieldKey, number> {
  const { TmA, TmB, dsA, dsB, alphaL, alphaS } = params;
  const c = params.compound ?? DEFAULT_COMPOUND;
  const alphaG = c.width === "range" ? c.alphaG : DEFAULT_COMPOUND.alphaG;
  return {
    TmA,
    TmB,
    dsA,
    dsB,
    alphaL,
    alphaS,
    Xc: c.Xc,
    dhf: c.dhf,
    dsf: c.dsf,
    alphaG,
    Tmin: window.Tmin,
    Tmax: window.Tmax,
  };
}

/**
 * The parameters and window that the field values and the compound's choice describe; the
 * inverse of `systemValues` and `compoundChoice`. Without a compound, `params` has no `compound`
 * key, as a preset without one has none.
 */
export function systemFrom(
  values: Readonly<Record<FieldKey, number>>,
  choice: CompoundChoice = { on: false, width: DEFAULT_COMPOUND.width },
): {
  params: Params;
  window: PlotWindow;
} {
  const { alphaL, alphaS, TmA, TmB, dsA, dsB, Xc, dhf, dsf, alphaG, Tmin, Tmax } = values;
  const params: Params = { TmA, TmB, dsA, dsB, alphaL, alphaS };
  if (choice.on) params.compound = { Xc, dhf, dsf, width: choice.width, alphaG };
  return { params, window: { Tmin, Tmax } };
}

/**
 * What Apply makes of the parameters and the typed window: with `auto` (and parameters that
 * `checkParams` passes) the window fitted by `fitWindow`, otherwise the typed one; and either the
 * scan that `checkSystem` found it valid with, for `Store.setSystem`, or its issues. `fitted`
 * says whether the window is the rule's. One scan in all: the window rule hands its own on.
 */
export type Prepared = { window: PlotWindow; fitted: boolean } & (
  { ok: true; scan: Scan } | { ok: false; issues: ValidityIssue[] }
);

export function prepareSystem(params: Params, typed: PlotWindow, auto: boolean): Prepared {
  const fit = auto && checkParams(params).length === 0 ? fitWindow(params) : null;
  const window = fit?.window ?? typed;
  return { window, fitted: fit !== null, ...checkSystem(params, window, fit?.scan) };
}

/**
 * The first `max` code points of `text`. `String.slice` counts UTF-16 code units, so it can split
 * an emoji and leave a lone surrogate, on which `encodeURIComponent` throws.
 */
export function cutText(text: string, max: number): string {
  return Array.from(text).slice(0, max).join("");
}

/**
 * A component name as applied: trimmed, inner runs of space collapsed, cut to
 * `COMPONENT_NAME_MAX` code points, and the default letter when nothing is left.
 */
export function cleanComponent(name: string, end: keyof Components): string {
  const clean = cutText(name.trim().replace(/\s+/g, " "), COMPONENT_NAME_MAX).trim();
  return clean || DEFAULT_COMPONENTS[end];
}

/**
 * The preset that this system is, or null for a custom one: the same parameters (the compound
 * included), window and the default component names, which a preset applies.
 */
export function matchPreset(
  params: Params,
  window: PlotWindow,
  components: Components,
): PresetId | null {
  if (components.A !== DEFAULT_COMPONENTS.A || components.B !== DEFAULT_COMPONENTS.B) return null;
  const match = PRESETS.find(
    (p) =>
      sameParams(params, p.params) &&
      window.Tmin === p.window.Tmin &&
      window.Tmax === p.window.Tmax,
  );
  return match?.id ?? null;
}
