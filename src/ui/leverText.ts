// The lever rule as text (plan §4 items 4 and 7): the lever at the cut for a state, the side
// column's rows, the screen-reader line and the arm labels on the diagram. No DOM here.

import { lever, type Lever } from "../physics/lever";
import { formatComposition, pct } from "./format";
import type { State } from "./state";

/** The lever rule at the cut for this state. */
export function leverOf(state: Readonly<State>): Lever {
  return lever(state.X0, state.atCut, state.diagram.naming);
}

/**
 * The two phases' fractions as whole percentages that add up to 100, so that the two arms never
 * read 37 % and 64 %.
 */
export function percents(f1: number): [number, number] {
  const p1 = Math.round(100 * f1);
  return [p1, 100 - p1];
}

/** One phase of the mixture with its composition and, unless at an invariant, its share. */
export interface LeverRow {
  name: string;
  X: string;
  /** "37 %", or null at an invariant. */
  share: string | null;
}

/** The side column's rows (plan §4 item 7): "L, X_B = 0.412: 37 %", "α: 100 %", or no shares. */
export function leverRows(l: Lever): LeverRow[] {
  if (l.kind === "single") return [{ name: l.name, X: formatComposition(l.X0), share: pct(100) }];
  if (l.kind === "invariant") {
    return l.phases.map((p) => ({ name: p.name, X: formatComposition(p.X), share: null }));
  }
  const shares = percents(l.phases[0].fraction!);
  return l.phases.map((p, k) => ({
    name: p.name,
    X: formatComposition(p.X),
    share: pct(shares[k]!),
  }));
}

/** A row as plain text, the form the screen-reader line uses. */
export function leverRowText(row: LeverRow, single: boolean): string {
  if (single) return `${row.name}: ${row.share}`;
  const at = `${row.name}, X_B = ${row.X}`;
  return row.share === null ? at : `${at}: ${row.share}`;
}

/** The screen-reader line (plan §4 item 4): X₀ and the phases, as the side column shows them. */
export function leverSentence(l: Lever): string {
  const rows = leverRows(l).map((r) => leverRowText(r, l.kind === "single"));
  const note = l.kind === "invariant" ? " (at the invariant the fractions are not fixed)" : "";
  return `Lever rule at X₀ = ${formatComposition(l.X0)}: ${rows.join("; ")}${note}`;
}

/** An arm of the bold tie line, from X₀ to one end, labelled with the opposite end's share. */
export interface LeverArm {
  from: number;
  to: number;
  /** "L 37 %": the phase at the other end, as the lever rule reads. */
  text: string;
}

/** The two arms of a two-phase lever, left then right; none otherwise. */
export function leverArms(l: Lever): LeverArm[] {
  if (l.kind !== "tie") return [];
  const [p, q] = l.phases;
  const [sp, sq] = percents(p.fraction!);
  return [
    { from: l.X0, to: p.X, text: `${q.name} ${pct(sq)}` },
    { from: l.X0, to: q.X, text: `${p.name} ${pct(sp)}` },
  ];
}
