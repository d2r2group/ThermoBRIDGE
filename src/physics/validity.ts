// The validity limits of plan §2.2. An edit is applied only when it passes them; otherwise the
// plots keep the last valid system and a warning lists what failed, with the fields to blame.

import { boundaries } from "./boundaries";
import { EventError, scan, scanIsFor, type Scan } from "./events";
import { compoundEnds, type Compound, type Params } from "./gibbs";
import { HullError } from "./hull";
import type { PlotWindow } from "./plotWindow";

export type ValidityCheck =
  | "finite"
  | "meltingPoint"
  | "maxT"
  | "entropy"
  | "alpha"
  | "Tmin"
  | "window"
  | "meltingInWindow"
  | "compoundX"
  | "formation"
  | "alphaG"
  | "compoundMelts"
  | "compoundEnds"
  | "computed";

/** The numbers of the compound (plan §9 phase 12). */
export type CompoundKey = "Xc" | "dhf" | "dsf" | "alphaG";

/** The numbers of a system: the parameters, the compound's and the window edges. */
export type SystemKey = Exclude<keyof Params, "compound"> | CompoundKey | keyof PlotWindow;

export interface ValidityIssue {
  check: ValidityCheck;
  message: string;
  /** The numbers the check failed on, for the panel to mark; none for "computed". */
  fields: SystemKey[];
}

/** What `checkSystem` finds: the scan of a valid system, or what is wrong with it. */
export type Checked = { ok: true; scan: Scan } | { ok: false; issues: ValidityIssue[] };

/** The range of α_l and α_s, kJ/mol. */
export const ALPHA_LIMIT = 60;
/**
 * The highest T_max, K, which melting points must stay below: it bounds the scan of the window in
 * 1 K steps, which would otherwise hold the page for as long as a typed window is wide. A melting
 * point at `T_LIMIT` is rejected because the window must hold it strictly inside.
 */
export const T_LIMIT = 5000;
const T_LIMIT_MESSAGE = `Melting points must lie below ${T_LIMIT} K, and T_max must not exceed it.`;

const PARAM_KEYS = ["TmA", "TmB", "dsA", "dsB", "alphaL", "alphaS"] as const;

/** The range of X_c. */
export const XC_LIMITS = [0.05, 0.95] as const;
/** The range of Δh_f, kJ/mol, and of Δs_f, J/(mol·K): a choice that covers c1–c8. */
export const DHF_LIMITS = [-30, 10] as const;
export const DSF_LIMITS = [-20, 10] as const;
/** The lowest α_γ, kJ/mol; α_γ must also be negative. */
export const ALPHA_G_MIN = -200;

/** The compound's numbers that count: α_γ only for a range. */
const compoundKeys = (c: Compound): CompoundKey[] =>
  c.width === "range" ? ["Xc", "dhf", "dsf", "alphaG"] : ["Xc", "dhf", "dsf"];

const within =
  ([lo, hi]: readonly [number, number]) =>
  (x: number) =>
    x >= lo && x <= hi;

/** The keys among `keys` whose value fails `ok`. */
function failing<K extends SystemKey>(
  values: Readonly<Record<K, number>>,
  keys: readonly K[],
  ok: (x: number) => boolean,
): K[] {
  return keys.filter((k) => !ok(values[k]));
}

/**
 * The limits on the parameters alone: numbers, positive melting points below `T_LIMIT`,
 * positive entropies, α in range, and the compound's limits that need no window. `autoWindow`
 * needs them to hold before it can scan.
 */
export function checkParams(params: Params): ValidityIssue[] {
  const issues: ValidityIssue[] = [];
  const fail = (check: ValidityCheck, message: string, fields: SystemKey[]) =>
    issues.push({ check, message, fields });
  const c = params.compound ?? null;
  const nonFinite: SystemKey[] = [
    ...failing(params, PARAM_KEYS, Number.isFinite),
    ...(c ? failing(c, compoundKeys(c), Number.isFinite) : []),
  ];
  if (nonFinite.length > 0) {
    fail("finite", "Every parameter must be a number.", nonFinite);
    return issues;
  }
  const Tm = ["TmA", "TmB"] as const;
  const positive = (x: number) => x > 0;
  const notPositive = failing(params, Tm, positive);
  if (notPositive.length > 0)
    fail("meltingPoint", "T_m,A and T_m,B must be positive.", notPositive);
  const below = failing(params, Tm, (x) => x < T_LIMIT);
  if (below.length > 0) fail("maxT", T_LIMIT_MESSAGE, below);
  const ds = failing(params, ["dsA", "dsB"], positive);
  if (ds.length > 0) fail("entropy", "Δs_A and Δs_B must be positive.", ds);
  const alpha = failing(params, ["alphaL", "alphaS"], (x) => Math.abs(x) <= ALPHA_LIMIT);
  if (alpha.length > 0) {
    fail(
      "alpha",
      `α_l and α_s must lie between −${ALPHA_LIMIT} and +${ALPHA_LIMIT} kJ/mol.`,
      alpha,
    );
  }
  if (c) checkCompound(params, c, fail);
  return issues;
}

/** The compound's limits that need no window (plan §2.2). */
function checkCompound(
  params: Params,
  c: Compound,
  fail: (check: ValidityCheck, message: string, fields: SystemKey[]) => void,
): void {
  if (!within(XC_LIMITS)(c.Xc)) {
    fail("compoundX", `X_c must lie between ${XC_LIMITS[0]} and ${XC_LIMITS[1]}.`, ["Xc"]);
  }
  const formation: SystemKey[] = [
    ...(within(DHF_LIMITS)(c.dhf) ? [] : (["dhf"] as const)),
    ...(within(DSF_LIMITS)(c.dsf) ? [] : (["dsf"] as const)),
  ];
  if (formation.length > 0) {
    fail(
      "formation",
      `Δh_f must lie between −${-DHF_LIMITS[0]} and +${DHF_LIMITS[1]} kJ/mol, and Δs_f between ` +
        `−${-DSF_LIMITS[0]} and +${DSF_LIMITS[1]} J/(mol·K).`,
      formation,
    );
  }
  if (c.width === "range" && !(c.alphaG >= ALPHA_G_MIN && c.alphaG < 0)) {
    fail("alphaG", `α_γ must lie between −${-ALPHA_G_MIN} and 0 kJ/mol, below 0.`, ["alphaG"]);
  }
  // Above this the liquid at X_c loses energy against γ as T rises, so a line compound melts.
  const melts = (1 - c.Xc) * params.dsA + c.Xc * params.dsB;
  if (!(c.dsf < melts)) {
    fail("compoundMelts", "Δs_f must lie below (1 − X_c) Δs_A + X_c Δs_B, so that γ melts.", [
      "dsf",
    ]);
  }
}

/**
 * Every validity limit that the parameters and window break, or, when they break none, the scan
 * of the window, which the diagram is then computed from (`computeDiagram`). The calculation
 * over the window only runs once the numbers and ranges are right. `scanned`, when it is the scan
 * of these parameters and this window (`fitWindow` hands one on), is used instead of scanning
 * again.
 */
export function checkSystem(params: Params, window: PlotWindow, scanned?: Scan | null): Checked {
  const issues = checkParams(params);
  const failed = (): Checked => ({ ok: false, issues });
  if (issues.some((i) => i.check === "finite")) return failed();
  const fail = (check: ValidityCheck, message: string, fields: SystemKey[]) =>
    issues.push({ check, message, fields });
  const edges = failing(window, ["Tmin", "Tmax"], Number.isFinite);
  if (edges.length > 0) {
    fail("finite", "Every parameter must be a number.", edges);
    return failed();
  }
  if (!(window.Tmin > 0)) fail("Tmin", "T_min must be positive.", ["Tmin"]);
  if (!(window.Tmax > window.Tmin)) fail("window", "T_max must lie above T_min.", ["Tmax"]);
  if (!(window.Tmax <= T_LIMIT)) {
    // One issue for both limits: T_max joins the melting points' if they broke it too.
    const melting = issues.find((i) => i.check === "maxT");
    if (melting) melting.fields.push("Tmax");
    else fail("maxT", T_LIMIT_MESSAGE, ["Tmax"]);
  }
  const inside = (T: number) => T > window.Tmin && T < window.Tmax;
  if (!(inside(params.TmA) && inside(params.TmB))) {
    fail("meltingInWindow", "Both melting points must lie inside the window.", ["Tmin", "Tmax"]);
  }
  // a(T) and b(T) are linear in T, so positive at both edges means positive across the window:
  // pure γ then never undercuts a pure solid.
  const c = params.compound;
  if (c?.width === "range" && issues.length === 0) {
    const ends = [window.Tmin, window.Tmax].map((T) => compoundEnds(c, T));
    if (!ends.every(({ a, b }) => a > 0 && b > 0)) {
      fail(
        "compoundEnds",
        "Pure γ must lie above the pure solids across the window: make α_γ more negative or " +
          "Δh_f less negative.",
        ["alphaG", "dhf"],
      );
    }
  }
  if (issues.length > 0) return failed();

  try {
    const s = scanned && scanIsFor(scanned, params, window) ? scanned : scan(params, window);
    boundaries(params, window, s);
    return { ok: true, scan: s };
  } catch (err) {
    if (!(err instanceof HullError || err instanceof EventError)) throw err;
    fail("computed", "The phase diagram could not be computed for these parameters.", []);
    return failed();
  }
}

/** Every validity limit that the parameters and window break; empty when they are valid. */
export function validate(params: Params, window: PlotWindow): ValidityIssue[] {
  const checked = checkSystem(params, window);
  return checked.ok ? [] : checked.issues;
}
