// The regular-solution model of plan §2: the molar Gibbs energies of the liquid, the solid and an
// optional intermediate compound γ (§9 phase 12: a point for a line compound, a third regular
// solution for one with a range) of a binary A-B system, relative to the pure liquids, and the
// slopes, curvatures and chemical potentials that the hull and the equilibrium solves need.
// Energies are in kJ/mol throughout.
//
// The equilibrium solves work in u = logit X = ln(X / (1 − X)), which resolves the tiny
// solubilities near the pure ends; `logitState`, which they use, stays exact there (no 1 − X
// computed from X near X = 1, no log of a rounded X). `g`, `dg` and `d2g` take X itself, for the
// slice and the metastable lines' checks, and do compute 1 − X.

/** Gas constant, kJ/(mol·K). */
export const R = 8.314462618e-3;

/**
 * The intermediate compound γ of plan §9 phase 12, measured from the line r_s through the pure
 * solids: at X_c it lies F(T) = Δh_f − T Δs_f below r_s. A line compound is a point phase; one
 * with a range is a third regular solution with α_γ < 0 (ignored for a line).
 */
export interface Compound {
  /** Mole fraction X_B of the compound. */
  Xc: number;
  /** Formation enthalpy from the pure solids, kJ/mol. */
  dhf: number;
  /** Formation entropy from the pure solids, J/(mol·K). */
  dsf: number;
  width: "line" | "range";
  /** α_γ, kJ/mol, for a range. */
  alphaG: number;
}

/**
 * The inputs of plan §2: melting points (K), entropies of fusion (J/(mol·K)), α (kJ/mol), and
 * the optional compound (absent or null for none).
 */
export interface Params {
  TmA: number;
  TmB: number;
  dsA: number;
  dsB: number;
  alphaL: number;
  alphaS: number;
  compound?: Compound | null;
}

/** The phases: the liquid, the solid and the compound γ. */
export type PhaseId = string;
export const LIQUID: PhaseId = "L";
export const SOLID: PhaseId = "S";
export const COMPOUND: PhaseId = "C";

/** Whether two compounds are the same, by value; null for none. */
export function sameCompound(a: Compound | null | undefined, b: Compound | null | undefined) {
  const p = a ?? null;
  const q = b ?? null;
  if (p === null || q === null) return p === q;
  return (
    p.Xc === q.Xc &&
    p.dhf === q.dhf &&
    p.dsf === q.dsf &&
    p.width === q.width &&
    (p.width === "line" || p.alphaG === q.alphaG)
  );
}

/** Whether two sets of parameters are the same, by value, the compound included. */
export function sameParams(p: Params, q: Params): boolean {
  return (
    p.TmA === q.TmA &&
    p.TmB === q.TmB &&
    p.dsA === q.dsA &&
    p.dsB === q.dsB &&
    p.alphaL === q.alphaL &&
    p.alphaS === q.alphaS &&
    sameCompound(p.compound, q.compound)
  );
}

/**
 * One solution phase at one temperature, g = (1 − X) gA + X gB + α X (1 − X) + g_id(X, T), with
 * the T derivatives of the pure-component terms for the solves that move T.
 */
export interface Curve {
  kind: "curve";
  id: PhaseId;
  T: number;
  alpha: number;
  gA: number;
  gB: number;
  /** dgA/dT and dgB/dT, kJ/(mol·K). */
  gAT: number;
  gBT: number;
}

/** A phase of fixed composition: the line compound. */
export interface PointPhase {
  kind: "point";
  id: PhaseId;
  X: number;
  g: number;
}

export type Phase = Curve | PointPhase;

/** Δg°_i(T) = g°_s,i − g°_l,i = Δs_i (T − T_m,i), kJ/mol. */
export function fusionGibbs(ds: number, Tm: number, T: number): number {
  return (ds / 1000) * (T - Tm);
}

/** The liquid at T: the reference, so gA = gB = 0. */
export function liquid(params: Params, T: number): Curve {
  return { kind: "curve", id: LIQUID, T, alpha: params.alphaL, gA: 0, gB: 0, gAT: 0, gBT: 0 };
}

/** The solid at T, with the pure solids at Δg°_A and Δg°_B. */
export function solid(params: Params, T: number): Curve {
  return {
    kind: "curve",
    id: SOLID,
    T,
    alpha: params.alphaS,
    gA: fusionGibbs(params.dsA, params.TmA, T),
    gB: fusionGibbs(params.dsB, params.TmB, T),
    gAT: params.dsA / 1000,
    gBT: params.dsB / 1000,
  };
}

/** The two solution phases at T, liquid first: every phase but the compound. */
export function curves(params: Params, T: number): Curve[] {
  return [liquid(params, T), solid(params, T)];
}

/** r_s(X, T) = (1 − X) Δg°_A + X Δg°_B, the line through the pure solids, kJ/mol. */
export function solidLine(params: Params, X: number, T: number): number {
  return (
    (1 - X) * fusionGibbs(params.dsA, params.TmA, T) + X * fusionGibbs(params.dsB, params.TmB, T)
  );
}

/** F(T) = Δh_f − T Δs_f, the compound's depth below r_s at X_c, kJ/mol. */
export function formationGibbs(c: Compound, T: number): number {
  return c.dhf - (T * c.dsf) / 1000;
}

/**
 * The end members of a compound with a range, a(T) and b(T) above the pure solids, which put the
 * minimum of g_γ − r_s at X_c with value F(T), kJ/mol; with their T derivatives, kJ/(mol·K).
 */
export function compoundEnds(
  c: Compound,
  T: number,
): { a: number; b: number; aT: number; bT: number } {
  const aT = -(c.dsf / 1000 + R * Math.log1p(-c.Xc));
  const bT = -(c.dsf / 1000 + R * Math.log(c.Xc));
  return {
    a: c.dhf - c.alphaG * c.Xc * c.Xc + T * aT,
    b: c.dhf - c.alphaG * (1 - c.Xc) * (1 - c.Xc) + T * bT,
    aT,
    bT,
  };
}

/** dg/dT of the line compound's point, kJ/(mol·K). */
export function pointGT(params: Params, c: Compound): number {
  return ((1 - c.Xc) * params.dsA + c.Xc * params.dsB - c.dsf) / 1000;
}

/** The compound γ at T: a point for a line compound, a curve for one with a range; else null. */
export function compoundPhase(params: Params, T: number): Phase | null {
  const c = params.compound;
  if (!c) return null;
  if (c.width === "line") {
    return {
      kind: "point",
      id: COMPOUND,
      X: c.Xc,
      g: solidLine(params, c.Xc, T) + formationGibbs(c, T),
    };
  }
  const { a, b, aT, bT } = compoundEnds(c, T);
  return {
    kind: "curve",
    id: COMPOUND,
    T,
    alpha: c.alphaG,
    gA: fusionGibbs(params.dsA, params.TmA, T) + a,
    gB: fusionGibbs(params.dsB, params.TmB, T) + b,
    gAT: params.dsA / 1000 + aT,
    gBT: params.dsB / 1000 + bT,
  };
}

/** Every phase of `params` at T: the liquid, the solid, and γ when there is a compound. */
export function phases(params: Params, T: number): Phase[] {
  const c = compoundPhase(params, T);
  return c ? [...curves(params, T), c] : curves(params, T);
}

/** The given phase of `params` at T. */
export function phaseAt(params: Params, id: PhaseId, T: number): Phase {
  const p = phases(params, T).find((ph) => ph.id === id);
  if (!p) throw new Error(`no phase ${id}`);
  return p;
}

/** The given phase of `params` at T, which must be a curve. */
export function curveAt(params: Params, id: PhaseId, T: number): Curve {
  const p = phaseAt(params, id, T);
  if (p.kind !== "curve") throw new Error(`phase ${id} is a point`);
  return p;
}

/** g of a phase at X, kJ/mol; a point's own g (X is then its composition). */
export function phaseG(p: Phase, X: number): number {
  return p.kind === "curve" ? g(p, X) : p.g;
}

/** X ln X + (1 − X) ln(1 − X), with its limit 0 at the ends. */
export function mixingEntropy(X: number): number {
  if (X <= 0 || X >= 1) return 0;
  return X * Math.log(X) + (1 - X) * Math.log1p(-X);
}

/** g(X), kJ/mol. */
export function g(c: Curve, X: number): number {
  return (1 - X) * c.gA + X * c.gB + c.alpha * X * (1 - X) + R * c.T * mixingEntropy(X);
}

/** g′(X) = α (1 − 2X) + RT ln(X / (1 − X)) + gB − gA. */
export function dg(c: Curve, X: number): number {
  return c.alpha * (1 - 2 * X) + R * c.T * Math.log(X / (1 - X)) + c.gB - c.gA;
}

/** g″(X) = −2α + RT / (X (1 − X)). */
export function d2g(c: Curve, X: number): number {
  return -2 * c.alpha + (R * c.T) / (X * (1 - X));
}

/** μ_A = g − X g′. */
export function muA(c: Curve, X: number): number {
  return c.gA + c.alpha * X * X + R * c.T * Math.log1p(-X);
}

/** μ_B = g + (1 − X) g′. */
export function muB(c: Curve, X: number): number {
  return c.gB + c.alpha * (1 - X) * (1 - X) + R * c.T * Math.log(X);
}

/** ln(1 + e^u), without overflow. */
export function softplus(u: number): number {
  return u > 0 ? u + Math.log1p(Math.exp(-u)) : Math.log1p(Math.exp(u));
}

/** X = 1 / (1 + e^−u). */
export function fromLogit(u: number): number {
  return 1 / (1 + Math.exp(-u));
}

/** ln(X / (1 − X)), with ±Infinity at the ends. */
export function logit(X: number): number {
  return Math.log(X / (1 - X));
}

/**
 * Everything the equilibrium solves need at u = logit X: X, 1 − X, the chemical potentials and
 * their derivatives in u and in T.
 */
export interface LogitState {
  x: number;
  y: number;
  muA: number;
  muB: number;
  muA_u: number;
  muB_u: number;
  muA_T: number;
  muB_T: number;
}

export function logitState(c: Curve, u: number): LogitState {
  const x = fromLogit(u);
  const y = fromLogit(-u);
  const RT = R * c.T;
  const spU = softplus(u); // −ln(1 − X)
  const spNegU = softplus(-u); // −ln X
  // ∂g′/∂u = g″ X (1 − X) = RT − 2α X (1 − X).
  const curv = RT - 2 * c.alpha * x * y;
  return {
    x,
    y,
    muA: c.gA + c.alpha * x * x - RT * spU,
    muB: c.gB + c.alpha * y * y - RT * spNegU,
    muA_u: -x * curv,
    muB_u: y * curv,
    muA_T: c.gAT - R * spU,
    muB_T: c.gBT - R * spNegU,
  };
}

/** The critical temperature α / (2R) of a phase's miscibility gap; ≤ 0, so no gap, for α ≤ 0. */
export function criticalT(alpha: number): number {
  return alpha / (2 * R);
}
