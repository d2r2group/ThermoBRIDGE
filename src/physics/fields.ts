// The names of the fields and phases (plan §4 item 1, §9 phase 12), in one place, so that the
// readout, the lever rule and the labels agree.
//
// Solid: S while the solid has no stable miscibility gap in the window. With a gap whose
// critical point is stable (the solid field wraps over the dome, as in (j) and (k)), there is
// one solid α and the gap is α₁ + α₂. With a gap cut off by an invariant (as in (h)), the solid
// is α on A's side and β on B's side. Liquid: L, and L₁ + L₂ for a liquid gap.
//
// Compound: a line compound is named by its formula (AB, AB₂, A₃B₂), one with a range γ. When γ
// is stable anywhere in the window and the solid has a miscibility gap in it (α_s > 0 with its
// critical point above T_min, stable or not), the solid is α left of X_c and β right of it, and
// an S + S tie line is α + β across X_c, α₁ + α₂ or β₁ + β₂ on one side; a solid field reaching
// across X_c, above a congruent transformation of γ into S, is α. Without a gap the solid on both
// sides of γ is one solution, α (§9 phase 13, as in c7).

import { COMPOUND, criticalT, LIQUID, SOLID, type Compound, type Params } from "./gibbs";
import type { PlotWindow } from "./plotWindow";
import { scan as scanWindow, type Scan } from "./events";
import type { Field, Hull, TieEnd } from "./hull";

export type SolidNaming = "S" | "alphaBeta" | "alpha12";

/** A piece of a compound's name: plain text, or a subscript. */
export interface NamePart {
  text: string;
  sub: boolean;
}

/** The compound's name: as one string, in parts for drawing subscripts, and spoken. */
export interface CompoundName {
  Xc: number;
  /** One string, with Unicode subscripts: "AB₂", "A₀.₅₇B₀.₄₃", "γ". */
  name: string;
  parts: NamePart[];
  /** For screen readers: "A 0.57 B 0.43". */
  spoken: string;
}

/** What naming needs: how the solid is named, and the compound when it is stable. */
export interface NameRules {
  solid: SolidNaming;
  /** The compound, when it is stable somewhere in the window; else null. */
  compound: CompoundName | null;
}

export interface NamedPhase {
  name: string;
  X: number;
}

export type NamedField =
  | { kind: "single"; name: string; X: [number, number] }
  | { kind: "tie"; name: string; ends: [NamedPhase, NamedPhase] };

export interface Naming extends NameRules {
  /** The named fields of a hull of this system, left to right. */
  name(hull: Hull): NamedField[];
}

/** The two components' names, A and B by default. */
export interface ComponentNames {
  A: string;
  B: string;
}

/** The largest x + y of a formula A_xB_y. */
const FORMULA_MAX = 12;
/** A formula's X_B = y / (x + y) must lie this close to X_c. */
const FORMULA_TOL = 5e-4;
const SUBSCRIPT_DIGITS = "₀₁₂₃₄₅₆₇₈₉";

/** Digits as Unicode subscripts; anything else, such as the decimal point, unchanged. */
function subscript(text: string): string {
  return text.replace(/\d/g, (d) => SUBSCRIPT_DIGITS[Number(d)]!);
}

/**
 * The formula A_xB_y of a line compound at X_c: the smallest x + y ≤ 12 with y / (x + y) within
 * 5·10⁻⁴ of X_c, a subscript of 1 left out (0.5 gives AB, 2/3 AB₂, 0.4 A₃B₂); failing that,
 * two-decimal subscripts (0.43 gives A₀.₅₇B₀.₄₃).
 */
export function compoundFormula(Xc: number, { A, B }: ComponentNames): CompoundName {
  let subs: [string, string] | null = null;
  for (let n = 2; n <= FORMULA_MAX && !subs; n++) {
    for (let y = 1; y < n; y++) {
      if (Math.abs(y / n - Xc) <= FORMULA_TOL) {
        subs = [n - y === 1 ? "" : String(n - y), y === 1 ? "" : String(y)];
        break;
      }
    }
  }
  if (!subs) {
    const y = Math.round(Xc * 100);
    subs = [((100 - y) / 100).toFixed(2), (y / 100).toFixed(2)];
  }
  const parts: NamePart[] = [];
  for (const [text, sub] of [
    [A, ""],
    ["", subs[0]],
    [B, ""],
    ["", subs[1]],
  ] as const) {
    if (text) parts.push({ text, sub: false });
    if (sub) parts.push({ text: sub, sub: true });
  }
  return {
    Xc,
    name: parts.map((p) => (p.sub ? subscript(p.text) : p.text)).join(""),
    parts,
    spoken: parts.map((p) => p.text).join(" "),
  };
}

/** The compound's name: its formula for a line compound, γ for one with a range. */
export function compoundName(c: Compound, components: ComponentNames): CompoundName {
  if (c.width === "line") return compoundFormula(c.Xc, components);
  return { Xc: c.Xc, name: "γ", parts: [{ text: "γ", sub: false }], spoken: "gamma" };
}

/** Whether the field signature (hull.ts) has the phase in it. */
const sigHas = (sig: string, phase: string) => sig.split(/[ |]/).includes(phase);

/** Whether the compound is stable somewhere in the scan's window. */
export function compoundStable(scanned: Scan): boolean {
  return (
    scanned.steps.some((s) => sigHas(s.sig, COMPOUND)) ||
    scanned.events.some((e) => sigHas(e.sigBelow, COMPOUND) || sigHas(e.sigAbove, COMPOUND))
  );
}

/** How the solid is named in this system, from its events and stepped fields. */
export function solidNaming(scanned: Scan): SolidNaming {
  const gap = (sig: string) => sig.includes(`${SOLID}|${SOLID}`);
  const hasGap =
    scanned.steps.some((s) => gap(s.sig)) ||
    scanned.events.some((e) => gap(e.sigBelow) || gap(e.sigAbove));
  // With a compound, a solid with a gap in the window, stable or hidden by the compound, is α and
  // β on either side of it; one without is one solution, α, on both.
  if (compoundStable(scanned)) {
    return criticalT(scanned.params.alphaS) > scanned.window.Tmin ? "alphaBeta" : "alpha12";
  }
  if (!hasGap) return "S";
  const stableTop = scanned.events.some(
    (e) => e.kind === "critical" && e.points[0]?.phase === SOLID,
  );
  return stableTop ? "alpha12" : "alphaBeta";
}

/** Where α turns into β: X_c with a stable compound, else the middle of the symmetric gap. */
const splitOf = (rules: NameRules) => rules.compound?.Xc ?? 0.5;

/** The name of a solid at composition X, outside an S + S tie line. */
function solidName(rules: NameRules, X: number): string {
  if (rules.solid === "S") return "S";
  if (rules.solid === "alpha12") return "α";
  return X < splitOf(rules) ? "α" : "β";
}

/** The name of a phase that is not part of a same-phase tie line. */
function phaseName(rules: NameRules, phase: string, X: number): string {
  if (phase === LIQUID) return "L";
  if (phase === SOLID) return solidName(rules, X);
  if (phase === COMPOUND) return rules.compound?.name ?? "γ";
  return phase;
}

/** The two ends of a tie line, named. */
function tieNames(rules: NameRules, [p, q]: [TieEnd, TieEnd]): [string, string] {
  if (p.phase === q.phase) {
    if (p.phase === LIQUID) return ["L₁", "L₂"];
    if (p.phase === SOLID) {
      if (rules.solid === "alpha12") return ["α₁", "α₂"];
      const split = splitOf(rules);
      if (q.X < split) return ["α₁", "α₂"];
      if (p.X > split) return ["β₁", "β₂"];
      return ["α", "β"];
    }
    return [p.phase, q.phase];
  }
  return [phaseName(rules, p.phase, p.X), phaseName(rules, q.phase, q.X)];
}

/** A tie line's field name: the liquid first, otherwise left to right ("L + α", "α + β"). */
function tieFieldName([a, b]: [string, string], [p, q]: [TieEnd, TieEnd]): string {
  return q.phase === LIQUID && p.phase !== LIQUID ? `${b} + ${a}` : `${a} + ${b}`;
}

export function nameField(rules: NameRules, f: Field): NamedField {
  if (f.kind === "single") {
    // A solid field reaching across the split (above a congruent transformation of γ into S)
    // is one solid, α.
    const split = splitOf(rules);
    const across = f.phase === SOLID && f.X[0] < split && f.X[1] > split;
    const name =
      across && rules.solid === "alphaBeta"
        ? "α"
        : phaseName(rules, f.phase, 0.5 * (f.X[0] + f.X[1]));
    return { kind: "single", name, X: f.X };
  }
  const names = tieNames(rules, f.ends);
  return {
    kind: "tie",
    name: tieFieldName(names, f.ends),
    ends: [
      { name: names[0], X: f.ends[0].X },
      { name: names[1], X: f.ends[1].X },
    ],
  };
}

/** The naming of a system over its window, with the component names for a line compound. */
export function fields(
  params: Params,
  window: PlotWindow,
  scanned: Scan = scanWindow(params, window),
  components: ComponentNames = { A: "A", B: "B" },
): Naming {
  const rules: NameRules = {
    solid: solidNaming(scanned),
    compound:
      params.compound && compoundStable(scanned) ? compoundName(params.compound, components) : null,
  };
  return named(rules);
}

/**
 * The naming of `rules`: they are plain data, which a Web Worker can post (plan §9 phase 15),
 * while the naming's `name` is a function, rebuilt here on the other side.
 */
export function named({ solid, compound }: NameRules): Naming {
  const rules: NameRules = { solid, compound };
  return { ...rules, name: (hull) => hull.fields.map((f) => nameField(rules, f)) };
}
