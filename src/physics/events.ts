// The events of plan §3: the temperatures where the sequence of fields changes. The window is
// stepped in about 1 K; where two steps' fields differ, the step is halved down to 1e-3 K, which
// separates events that fall within one step (in (i) the peritectic is 1.1 K below T_m,A). The
// kind of change then says which exact solve gives the event's position.

import {
  criticalT,
  curveAt,
  LIQUID,
  phaseAt,
  sameParams,
  type Params,
  type PhaseId,
} from "./gibbs";
import type { PlotWindow } from "./plotWindow";
import { HullError, refineTie, signature, sliceHull, type Hull, type TieEnd } from "./hull";
import { congruent, threePhase } from "./invariants";

export type InvariantKind =
  | "eutectic"
  | "monotectic"
  | "peritectic"
  | "syntectic"
  | "eutectoid"
  | "monotectoid"
  | "metatectic"
  | "peritectoid";
/**
 * The events. A congruent "minimum" or "maximum" involves the liquid; "congruent" is a solid
 * transformation, where S and the compound γ touch at one composition.
 */
export type EventKind =
  InvariantKind | "critical" | "minimum" | "maximum" | "congruent" | "melting";

/** The three-phase events, each drawn as a horizontal line through its three phases. */
export const INVARIANT_KINDS: readonly EventKind[] = [
  "eutectic",
  "monotectic",
  "peritectic",
  "syntectic",
  "eutectoid",
  "monotectoid",
  "metatectic",
  "peritectoid",
] satisfies InvariantKind[];

/** The invariants among `events`, in their order. */
export function invariantsOf(events: readonly DiagramEvent[]): DiagramEvent[] {
  return events.filter((e) => INVARIANT_KINDS.includes(e.kind));
}

/** A tie line's two ends at the event, X increasing. */
export type TieAt = [TieEnd, TieEnd];

export interface DiagramEvent {
  kind: EventKind;
  /** The event's temperature, K. */
  T: number;
  /**
   * The phases at the event, X increasing: the three of an invariant, the one phase whose gap
   * closes at a critical point, the two at a congruent point (the liquid first, else the outer
   * phase first) or at a melting point.
   */
  points: TieEnd[];
  /** The tie lines just below and just above the event, evaluated at the event's T. */
  below: TieAt[];
  above: TieAt[];
  /** The signatures (hull.ts) of the fields below and above. */
  sigBelow: string;
  sigAbove: string;
}

export interface Step {
  T: number;
  hull: Hull;
  sig: string;
}

/** Everything the scan of the window computes: the stepped hulls and the events, T increasing. */
export interface Scan {
  params: Params;
  window: PlotWindow;
  steps: Step[];
  events: DiagramEvent[];
}

/** The window's step, K. */
const STEP = 1;
/** Steps are halved down to this before a change is classified, K. */
const BRACKET = 1e-3;
/**
 * An exact solve must land this close to its bracket, K. The event lies in the bracket up to the
 * grid's lag in seeing it; a solve that lands farther has converged on another root.
 */
const SOLVE_SLACK = 0.05;
/**
 * Two tie lines are one when their ends lie this close together: away from the event, an end
 * moves much less across a bracket of 1e-3 K, while two tie lines of one pair of phases (L + α
 * and L + β) lie much farther apart.
 */
export const MATCH_X = 0.02;
/**
 * A critical or melting point must lie this close to its bracket, K. Its T is exact, but the
 * hull sees a gap or a tie line only once it is deeper or wider than its tolerances, which near
 * a critical point, where the gap's depth vanishes as (T_c − T)², can be a fraction of a K away.
 */
const CLOSED_FORM_SLACK = 0.5;

/** A system whose events cannot all be found and classified (plan §2.2). */
export class EventError extends Error {}

type Pair = [PhaseId, PhaseId];
const pairsOf = (h: Hull): Pair[] => h.ties.map((t) => [t.ends[0].phase, t.ends[1].phase]);
const samePair = (a: Pair, b: Pair) => a[0] === b[0] && a[1] === b[1];

/** How many steps the scan of `window` takes. */
const stepCount = ({ Tmin, Tmax }: PlotWindow) => Math.max(1, Math.ceil((Tmax - Tmin) / STEP));

/** The temperature of step j of the n steps of the scan of `window`. */
const stepT = ({ Tmin, Tmax }: PlotWindow, j: number, n: number) =>
  j === n ? Tmax : Tmin + ((Tmax - Tmin) * j) / n;

/** Whether `scanned` is the scan of these parameters and this window, by value. */
export function scanIsFor(scanned: Scan, params: Params, window: PlotWindow): boolean {
  return (
    sameParams(scanned.params, params) &&
    scanned.window.Tmin === window.Tmin &&
    scanned.window.Tmax === window.Tmax
  );
}

/**
 * The scan of `window` cut out of `scanned`, the scan of a wider window, or null when it would
 * differ from a fresh `scan(params, window)`. It is the same when the wider scan's steps include
 * the window's own steps, at the same temperatures: the events between them are then found from
 * the same pairs of hulls. The events kept are those inside the window; when their signatures do
 * not run from the first step's to the last's (an event solved just across an edge from its
 * bracket), null.
 */
export function subScan(scanned: Scan, window: PlotWindow): Scan | null {
  const { steps } = scanned;
  const lo = steps.findIndex((s) => s.T === window.Tmin);
  const n = stepCount(window);
  if (lo < 0 || lo + n >= steps.length) return null;
  for (let j = 0; j <= n; j++) if (steps[lo + j]!.T !== stepT(window, j, n)) return null;
  const inner = steps.slice(lo, lo + n + 1);
  const events = scanned.events.filter((e) => e.T > window.Tmin && e.T < window.Tmax);
  let sig = inner[0]!.sig;
  for (const e of events) {
    if (e.sigBelow !== sig) return null;
    sig = e.sigAbove;
  }
  if (sig !== inner.at(-1)!.sig) return null;
  return { params: scanned.params, window, steps: inner, events };
}

/** The stepped hulls and the events of the system over the window. */
export function scan(params: Params, window: PlotWindow): Scan {
  const n = stepCount(window);
  const at = (T: number): Step => {
    let hull: Hull;
    try {
      hull = sliceHull(params, T);
    } catch (err) {
      if (err instanceof HullError) throw new HullError(`${err.message} at ${T} K`);
      throw err;
    }
    return { T, hull, sig: signature(hull) };
  };
  const steps: Step[] = [];
  for (let j = 0; j <= n; j++) steps.push(at(stepT(window, j, n)));

  const found: DiagramEvent[] = [];
  const locate = (a: Step, b: Step) => {
    if (a.sig === b.sig) return;
    if (b.T - a.T <= BRACKET) {
      found.push(classify(params, a, b));
      return;
    }
    const mid = at(0.5 * (a.T + b.T));
    locate(a, mid);
    locate(mid, b);
  };
  for (let j = 0; j < n; j++) locate(steps[j]!, steps[j + 1]!);

  found.sort((p, q) => p.T - q.T);
  let sig = steps[0]!.sig;
  for (const e of found) {
    if (e.sigBelow !== sig) throw new EventError(`events out of order at ${e.T.toFixed(3)} K`);
    sig = e.sigAbove;
  }
  return { params, window, steps, events: found };
}

/** The events of the system over the window, T increasing. */
export function events(params: Params, window: PlotWindow) {
  return scan(params, window).events;
}

/**
 * The one event between two hulls less than BRACKET apart; throws an EventError when their
 * difference is not one recognised event.
 */
function classify(params: Params, a: Step, b: Step): DiagramEvent {
  // Tie lines the event does not touch have the same phases and nearly the same ends on both
  // sides; matching by position as well keeps L + α from being taken for L + β.
  const lo = pairsOf(a.hull);
  const hi = pairsOf(b.hull);
  const same = (k: number, l: number) => {
    const s = a.hull.ties[k]!.ends;
    const t = b.hull.ties[l]!.ends;
    return (
      samePair(lo[k]!, hi[l]!) &&
      Math.abs(s[0].X - t[0].X) < MATCH_X &&
      Math.abs(s[1].X - t[1].X) < MATCH_X
    );
  };
  let pre = 0;
  while (pre < lo.length && pre < hi.length && same(pre, pre)) pre++;
  let suf = 0;
  while (
    suf < lo.length - pre &&
    suf < hi.length - pre &&
    same(lo.length - 1 - suf, hi.length - 1 - suf)
  ) {
    suf++;
  }
  const midLo = lo.slice(pre, lo.length - suf);
  const midHi = hi.slice(pre, hi.length - suf);
  const Tg = 0.5 * (a.T + b.T);
  // A declaration, not an arrow, so that its `never` narrows the values it guards.
  function fail(why: string): never {
    throw new EventError(`unclassified change at ${Tg.toFixed(3)} K (${why}): ${a.sig} → ${b.sig}`);
  }

  // The tie lines on each side at T, the ones the event moves replaced by `involved`.
  const finish = (
    kind: EventKind,
    T: number,
    points: TieEnd[],
    involvedBelow: TieAt[],
    involvedAbove: TieAt[],
  ): DiagramEvent => {
    const side = (h: Hull, mid: number, involved: TieAt[]): TieAt[] => {
      const refined = (t: Hull["ties"][number]): TieAt => {
        const [p, q] = t.ends;
        const r = refineTie(phaseAt(params, p.phase, T), phaseAt(params, q.phase, T), p.X, q.X);
        if (!r) throw new EventError(`tie line ${p.phase}+${q.phase} lost at ${T.toFixed(3)} K`);
        return r.ends;
      };
      return [
        ...h.ties.slice(0, pre).map(refined),
        ...involved,
        ...h.ties.slice(pre + mid).map(refined),
      ];
    };
    return {
      kind,
      T,
      points,
      below: side(a.hull, midLo.length, involvedBelow),
      above: side(b.hull, midHi.length, involvedAbove),
      sigBelow: a.sig,
      sigAbove: b.sig,
    };
  };

  // An invariant: one tie line a+c on one side, a+b and b+c on the other.
  const split =
    midLo.length === 1 && midHi.length === 2
      ? b
      : midLo.length === 2 && midHi.length === 1
        ? a
        : null;
  if (split) {
    const two = split === a ? midLo : midHi;
    const one = split === a ? midHi : midLo;
    const [[pa, pb], [pb2, pc]] = two as [Pair, Pair];
    if (pb !== pb2 || !samePair(one[0]!, [pa, pc])) fail("tie lines do not merge");
    const t1 = split.hull.ties[pre]!;
    const t2 = split.hull.ties[pre + 1]!;
    const sol = threePhase(
      params,
      [pa, pb, pc],
      [t1.ends[0].X, 0.5 * (t1.ends[1].X + t2.ends[0].X), t2.ends[1].X],
      Tg,
    );
    if (
      !sol ||
      Math.abs(sol.T - Tg) > SOLVE_SLACK ||
      !(sol.X[0] < sol.X[1] && sol.X[1] < sol.X[2])
    ) {
      fail("three-phase solve");
    }
    const { X, T } = sol;
    const kind = invariantKind(pa, pb, pc, split === b);
    if (!kind) fail(`no invariant has ${pb} between ${pa} and ${pc}`);
    const points: TieEnd[] = [
      { phase: pa, X: X[0] },
      { phase: pb, X: X[1] },
      { phase: pc, X: X[2] },
    ];
    const splitTies: TieAt[] = [
      [points[0]!, points[1]!],
      [points[1]!, points[2]!],
    ];
    const merged: TieAt[] = [[points[0]!, points[2]!]];
    return split === a
      ? finish(kind, T, points, splitTies, merged)
      : finish(kind, T, points, merged, splitTies);
  }

  const extra = midLo.length === 0 ? midHi : midHi.length === 0 ? midLo : null;
  const extraBelow = midHi.length === 0;
  if (!extra) return fail("both sides change");
  const extraHull = extraBelow ? a.hull : b.hull;

  // A critical point: a gap within one phase closes.
  if (extra.length === 1 && extra[0]![0] === extra[0]![1]) {
    const phase = extra[0]![0];
    const Tc = criticalT(curveAt(params, phase, Tg).alpha);
    if (!extraBelow || Math.abs(Tc - Tg) > CLOSED_FORM_SLACK) fail("gap does not close upwards");
    const top: TieEnd = { phase, X: 0.5 };
    return extraBelow
      ? finish("critical", Tc, [top], [[top, top]], [])
      : finish("critical", Tc, [top], [], [[top, top]]);
  }

  // A pure component's melting point: an L + S tie line shrinks into X = 0 or 1.
  if (extra.length === 1) {
    const tie = extraHull.ties[pre]!;
    const atA = tie.ends[1].X < 0.5;
    const Tm = atA ? params.TmA : params.TmB;
    if (Math.abs(Tm - Tg) > CLOSED_FORM_SLACK) fail("melting point away from T_m");
    const X = atA ? 0 : 1;
    const ends: TieAt = [
      { phase: tie.ends[0].phase, X },
      { phase: tie.ends[1].phase, X },
    ];
    return extraBelow
      ? finish("melting", Tm, ends, [ends], [])
      : finish("melting", Tm, ends, [], [ends]);
  }

  // A congruent point: p + q and q + p shrink to one point. With liquid in the middle, a minimum
  // (the liquid appears on heating); with liquid outside, a maximum (the middle phase melts);
  // without liquid, a congruent transformation, where the middle phase forms out of the outer on
  // cooling or, with a positive formation entropy, on heating.
  if (extra.length === 2 && extra[0]![0] === extra[1]![1] && extra[0]![1] === extra[1]![0]) {
    const [outer, middle] = extra[0]!;
    const kind =
      middle === LIQUID
        ? extraBelow
          ? null
          : "minimum"
        : outer !== LIQUID
          ? "congruent"
          : extraBelow
            ? "maximum"
            : null;
    if (!kind) fail("congruent point of the wrong sense");
    const t1 = extraHull.ties[pre]!;
    const t2 = extraHull.ties[pre + 1]!;
    const sol = congruent(params, [outer, middle], 0.5 * (t1.ends[1].X + t2.ends[0].X), Tg);
    if (!sol || Math.abs(sol.T - Tg) > SOLVE_SLACK) fail("congruent solve");
    const { X, T } = sol;
    const [p, q]: [TieEnd, TieEnd] =
      middle === LIQUID
        ? [
            { phase: middle, X },
            { phase: outer, X },
          ]
        : [
            { phase: outer, X },
            { phase: middle, X },
          ];
    const ties: TieAt[] = [
      [
        { phase: extra[0]![0], X },
        { phase: middle, X },
      ],
      [
        { phase: middle, X },
        { phase: extra[0]![0], X },
      ],
    ];
    return extraBelow ? finish(kind, T, [p, q], ties, []) : finish(kind, T, [p, q], [], ties);
  }

  return fail("unknown pattern");
}

/**
 * The kind of an invariant with phase b between a and c. `middleAbove` when b's field lies above
 * the invariant, so b decomposes into a and c on cooling. A solid b is the solid S or the
 * compound γ.
 */
export function invariantKind(
  a: PhaseId,
  b: PhaseId,
  c: PhaseId,
  middleAbove: boolean,
): InvariantKind | null {
  const liquids = [a, c].filter((p) => p === LIQUID).length;
  if (b === LIQUID) {
    if (!middleAbove) return null;
    return liquids === 0 ? "eutectic" : "monotectic";
  }
  if (!middleAbove) {
    return liquids === 0 ? "peritectoid" : liquids === 1 ? "peritectic" : "syntectic";
  }
  if (liquids > 0) return "metatectic";
  // An S + S dome above the line: b and one neighbour are the same phase.
  return b === a || b === c ? "monotectoid" : "eutectoid";
}
