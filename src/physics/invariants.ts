// The exact solves behind the events of plan §3: three phases on one tangent (an invariant), and
// two phases touching at one composition (a congruent point). Either may include the line
// compound, a point phase, whose g moves with T but whose composition does not.

import {
  curveAt,
  formationGibbs,
  g,
  logitState,
  mixingEntropy,
  phaseAt,
  pointGT,
  R,
  solidLine,
  type Compound,
  type LogitState,
  type Params,
  type PhaseId,
} from "./gibbs";
import { clampU } from "./grid";
import { newton } from "./roots";

/**
 * Three phases a, b, c at X1 < X2 < X3 on one tangent: μ_A and μ_B equal at all three, or, when
 * one is the line compound, equal at the other two with their tangent through the point. Solved
 * for the compositions and T from the given guesses; null when Newton does not converge.
 */
export function threePhase(
  params: Params,
  phases: [PhaseId, PhaseId, PhaseId],
  X: [number, number, number],
  T: number,
): { X: [number, number, number]; T: number } | null {
  const pointAt = phases.findIndex((id) => phaseAt(params, id, T).kind === "point");
  if (pointAt >= 0) return threeWithPoint(params, phases, X, T, pointAt);
  const v = newton(
    ([u1, u2, u3, t]) => {
      const [a, b, c] = phases.map((id, k) =>
        logitState(curveAt(params, id, t!), [u1, u2, u3][k]!),
      ) as [LogitState, LogitState, LogitState];
      return {
        f: [a.muA - b.muA, a.muB - b.muB, b.muA - c.muA, b.muB - c.muB],
        J: [
          [a.muA_u, -b.muA_u, 0, a.muA_T - b.muA_T],
          [a.muB_u, -b.muB_u, 0, a.muB_T - b.muB_T],
          [0, b.muA_u, -c.muA_u, b.muA_T - c.muA_T],
          [0, b.muB_u, -c.muB_u, b.muB_T - c.muB_T],
        ],
      };
    },
    [clampU(X[0]), clampU(X[1]), clampU(X[2]), T],
    { maxStep: 2 },
  );
  if (!v) return null;
  const t = v[3]!;
  const Xs = phases.map((id, k) => logitState(curveAt(params, id, t), v[k]!).x);
  return { X: Xs as [number, number, number], T: t };
}

/** A Newton system: residuals and Jacobian at v. */
export type System = (v: number[]) => { f: number[]; J: number[][] };

/** g of the line compound's point at T, kJ/mol. */
const pointG = (params: Params, c: Compound, T: number) =>
  solidLine(params, c.Xc, T) + formationGibbs(c, T);

/**
 * The system of `threePhase` with the line compound c between or beside curves p and q, in
 * v = [u_p, u_q, T]: equal μ_A and μ_B on the two curves, and their tangent through the point,
 * μ_A (1 − X_c) + μ_B X_c = r_s(X_c, T) + F(T).
 */
export function pointInvariantSystem(params: Params, c: Compound, p: PhaseId, q: PhaseId): System {
  const Xc = c.Xc;
  const gT = pointGT(params, c);
  return ([u1, u2, t]) => {
    const a = logitState(curveAt(params, p, t!), u1!);
    const b = logitState(curveAt(params, q, t!), u2!);
    return {
      f: [a.muA - b.muA, a.muB - b.muB, a.muA * (1 - Xc) + a.muB * Xc - pointG(params, c, t!)],
      J: [
        [a.muA_u, -b.muA_u, a.muA_T - b.muA_T],
        [a.muB_u, -b.muB_u, a.muB_T - b.muB_T],
        [a.muA_u * (1 - Xc) + a.muB_u * Xc, 0, a.muA_T * (1 - Xc) + a.muB_T * Xc - gT],
      ],
    };
  };
}

/** `threePhase` with the line compound at index `pointAt`. */
function threeWithPoint(
  params: Params,
  phases: [PhaseId, PhaseId, PhaseId],
  X: [number, number, number],
  T: number,
  pointAt: number,
): { X: [number, number, number]; T: number } | null {
  const c = params.compound!;
  const [i, j] = [0, 1, 2].filter((k) => k !== pointAt) as [number, number];
  const v = newton(
    pointInvariantSystem(params, c, phases[i]!, phases[j]!),
    [clampU(X[i]!), clampU(X[j]!), T],
    { maxStep: 2 },
  );
  if (!v) return null;
  const t = v[2]!;
  const Xs: [number, number, number] = [c.Xc, c.Xc, c.Xc];
  Xs[i] = logitState(curveAt(params, phases[i]!, t), v[0]!).x;
  Xs[j] = logitState(curveAt(params, phases[j]!, t), v[1]!).x;
  return { X: Xs, T: t };
}

/**
 * The system of a congruent point of curve p and the line compound c, in v = [T]: the curve's g
 * at X_c equal to the point's.
 */
export function pointCongruentSystem(params: Params, c: Compound, p: PhaseId): System {
  const Xc = c.Xc;
  const gT = pointGT(params, c);
  const ent = mixingEntropy(Xc);
  return ([t]) => {
    const cv = curveAt(params, p, t!);
    const dCurve = (1 - Xc) * cv.gAT + Xc * cv.gBT + R * ent;
    return { f: [g(cv, Xc) - pointG(params, c, t!)], J: [[dCurve - gT]] };
  };
}

/**
 * A congruent point of phases p and q: equal in g and g′ at one composition, so a tie line
 * between them has shrunk to zero length inside (0, 1). For two curves both are solved for; with
 * the line compound it is one equation in T, the curve's g at X_c equal to the point's.
 */
export function congruent(
  params: Params,
  [p, q]: [PhaseId, PhaseId],
  X: number,
  T: number,
): { X: number; T: number } | null {
  const pointId = [p, q].find((id) => phaseAt(params, id, T).kind === "point");
  if (pointId !== undefined) {
    const c = params.compound!;
    const v = newton(pointCongruentSystem(params, c, pointId === p ? q : p), [T], { maxStep: 2 });
    return v ? { X: c.Xc, T: v[0]! } : null;
  }
  const v = newton(
    ([u, t]) => {
      const a = logitState(curveAt(params, p, t!), u!);
      const b = logitState(curveAt(params, q, t!), u!);
      return {
        f: [a.muA - b.muA, a.muB - b.muB],
        J: [
          [a.muA_u - b.muA_u, a.muA_T - b.muA_T],
          [a.muB_u - b.muB_u, a.muB_T - b.muB_T],
        ],
      };
    },
    [clampU(X), T],
    { maxStep: 2 },
  );
  if (!v) return null;
  return { X: logitState(curveAt(params, p, v[1]!), v[0]!).x, T: v[1]! };
}
