// The fields along a cut at T (plan §3, §4 item 2): the hull's, with an invariant's own two tie
// lines in place of the hull's within a hair of the invariant. The slice panel, the lever rule,
// the diagram's guides and the spinodals' visibility all read them, so they live apart from any
// one of those.

import { INVARIANT_KINDS, MATCH_X, type DiagramEvent } from "./events";
import { phaseG, phases as phasesOf, type Params } from "./gibbs";
import { HullError, sliceHull, type Field, type Hull, type TieEnd } from "./hull";

/** A cut this close to an invariant's T draws its three-phase tangent, K (events' bracket). */
export const AT_INVARIANT = 1e-3;
/** Offsets tried, K, when the hull cannot be computed at the cut itself. */
const NUDGES = [1e-4, -1e-4, 1e-3, -1e-3, 1e-2, -1e-2];

/**
 * The fields across [0, 1] at T: the hull's, except within a cut AT_INVARIANT from an invariant,
 * where the hull may merge the invariant's two tie lines into one; there they are replaced by
 * the invariant's own: its two tie lines and the middle phase between them, at zero width and
 * marked `invariant` (a line compound's own field has zero width too). When
 * the hull cannot be computed at T (a rare temperature between the scan's steps), the nearest
 * of a few nudged temperatures is used.
 */
export function fieldsAt(params: Params, T: number, events: readonly DiagramEvent[]): Field[] {
  let hull: Hull | null = null;
  for (const dT of [0, ...NUDGES]) {
    try {
      hull = sliceHull(params, T + dT);
      break;
    } catch (err) {
      if (!(err instanceof HullError)) throw err;
    }
  }
  if (!hull) throw new HullError(`the hull cannot be computed near ${T} K`);
  const inv = events.find(
    (e) => INVARIANT_KINDS.includes(e.kind) && Math.abs(e.T - T) <= AT_INVARIANT,
  );
  return inv ? withInvariant(hull.fields, inv, T, params) : hull.fields;
}

/** `fields` with the tie lines across the invariant's span replaced by its own two. */
function withInvariant(
  fields: readonly Field[],
  inv: DiagramEvent,
  T: number,
  params: Params,
): Field[] {
  const [p1, p2, p3] = inv.points as [TieEnd, TieEnd, TieEnd];
  const inside = (f: Field) =>
    f.kind === "tie" && f.ends[0].X > p1.X - MATCH_X && f.ends[1].X < p3.X + MATCH_X;
  const first = fields.findIndex(inside);
  if (first < 0) return [...fields];
  let last = first;
  while (last + 2 < fields.length && inside(fields[last + 2]!)) last += 2;
  const before = fields[first - 1]!;
  const after = fields[last + 1]!;
  if (before.kind !== "single" || after.kind !== "single") return [...fields];

  const phases = new Map(phasesOf(params, T).map((c) => [c.id, c]));
  const gOf = (e: TieEnd) => phaseG(phases.get(e.phase)!, e.X);
  const tie = (a: TieEnd, b: TieEnd): Field => {
    const slope = (gOf(b) - gOf(a)) / (b.X - a.X);
    return { kind: "tie", ends: [a, b], slope, intercept: gOf(a) - slope * a.X };
  };
  return [
    ...fields.slice(0, first - 1),
    { ...before, X: [before.X[0], p1.X] },
    tie(p1, p2),
    { kind: "single", phase: p2.phase, X: [p2.X, p2.X], invariant: true },
    tie(p2, p3),
    { ...after, X: [p3.X, after.X[1]] },
    ...fields.slice(last + 2),
  ];
}
