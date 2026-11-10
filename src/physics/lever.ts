// The lever rule at the cut (plan §3 `lever`, §4 item 7): the field that holds the overall
// composition X₀ at T*, and in a two-phase field the fractions f₁ = (X₂ − X₀)/(X₂ − X₁) and
// f₂ = (X₀ − X₁)/(X₂ − X₁) of the phases at its ends. At an invariant temperature, where three
// phases coexist, the fractions are not fixed, so the three phases are listed without them.

import { nameField, type NameRules } from "./fields";
import type { PhaseId } from "./gibbs";
import type { Field, SingleField, TieField } from "./hull";

/** A phase of the mixture: its name, its composition and its fraction (null at an invariant). */
export interface LeverPhase {
  name: string;
  phase: PhaseId;
  X: number;
  fraction: number | null;
}

export type Lever =
  | { kind: "single"; X0: number; name: string; phases: [LeverPhase] }
  | { kind: "tie"; X0: number; name: string; phases: [LeverPhase, LeverPhase] }
  | { kind: "invariant"; X0: number; phases: [LeverPhase, LeverPhase, LeverPhase] };

/**
 * The lever rule at X₀ (clamped into [0, 1]) on `fields`, the fields along the cut from
 * `fieldsAt`, named with `naming`. Within an invariant's span (the two tie lines that `fieldsAt`
 * joins through the middle phase it marks) it is the invariant; at a line compound's own X, the
 * compound alone; otherwise the tie line that holds X₀, ends included, or else the one-phase
 * field.
 */
export function lever(X0: number, fields: readonly Field[], naming: NameRules): Lever {
  const X = Math.min(1, Math.max(0, X0));
  for (let k = 1; k + 1 < fields.length; k++) {
    const [left, mid, right] = [fields[k - 1]!, fields[k]!, fields[k + 1]!];
    if (mid.kind !== "single" || !mid.invariant) continue;
    if (left.kind !== "tie" || right.kind !== "tie") continue;
    if (X < left.ends[0].X || X > right.ends[1].X) continue;
    const [a, b] = named(naming, left);
    const [, c] = named(naming, right);
    return {
      kind: "invariant",
      X0: X,
      phases: [a, b, c].map((p) => ({ ...p, fraction: null })) as [
        LeverPhase,
        LeverPhase,
        LeverPhase,
      ],
    };
  }

  const point = fields.find(
    (f): f is SingleField => f.kind === "single" && f.X[0] === X && f.X[1] === X,
  );
  if (point) return singleAt(naming, point, X);

  const tie = fields.find(
    (f): f is TieField => f.kind === "tie" && f.ends[0].X <= X && X <= f.ends[1].X,
  );
  if (tie) {
    const [p, q] = named(naming, tie);
    const span = q.X - p.X;
    return {
      kind: "tie",
      X0: X,
      name: nameField(naming, tie).name,
      phases: [
        { ...p, fraction: (q.X - X) / span },
        { ...q, fraction: (X - p.X) / span },
      ],
    };
  }

  const single = fields.find(
    (f): f is SingleField => f.kind === "single" && f.X[0] <= X && X <= f.X[1],
  );
  if (!single) throw new RangeError(`no field along the cut holds X = ${X}`);
  return singleAt(naming, single, X);
}

/** The lever rule in a one-phase field. */
function singleAt(naming: NameRules, single: SingleField, X: number): Lever {
  const name = nameField(naming, single).name;
  return { kind: "single", X0: X, name, phases: [{ name, phase: single.phase, X, fraction: 1 }] };
}

/** The two ends of a tie line, named as on the diagram, without fractions yet. */
function named(
  naming: NameRules,
  tie: TieField,
): [Omit<LeverPhase, "fraction">, Omit<LeverPhase, "fraction">] {
  const n = nameField(naming, tie);
  if (n.kind !== "tie") throw new Error("a tie line is named as a tie line");
  return [
    { name: n.ends[0].name, phase: tie.ends[0].phase, X: tie.ends[0].X },
    { name: n.ends[1].name, phase: tie.ends[1].phase, X: tie.ends[1].X },
  ];
}
