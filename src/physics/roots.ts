// Small numerical helpers shared by the equilibrium solves.

/**
 * The solution of A x = b for a small dense system, by Gaussian elimination with partial
 * pivoting; null when A is singular to working precision. A and b are not modified.
 */
export function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i] as number]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r]![col]!) > Math.abs(M[pivot]![col]!)) pivot = r;
    }
    if (!(Math.abs(M[pivot]![col]!) > 1e-300)) return null;
    [M[col], M[pivot]] = [M[pivot]!, M[col]!];
    const rowC = M[col]!;
    for (let r = col + 1; r < n; r++) {
      const row = M[r]!;
      const f = row[col]! / rowC[col]!;
      for (let k = col; k <= n; k++) row[k]! -= f * rowC[k]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    const row = M[r]!;
    let s = row[n]!;
    for (let k = r + 1; k < n; k++) s -= row[k]! * x[k]!;
    x[r] = s / row[r]!;
  }
  return x.every(Number.isFinite) ? x : null;
}

/** |F| below this counts as rounding level (F in kJ/mol, of order 1–100). */
const RESIDUAL_FLOOR = 1e-12;

/**
 * Newton's method on F(v) = 0 with the Jacobian J(v), each step's components capped at
 * `maxStep` in size and the step halved (up to 30 times) until it reduces |F|, so that a
 * near-singular start does not throw the iterate onto another root. Returns v once every
 * component of a step is below `tol` relative (to max(1, |v_k|)), or below 1e-8 with |F| at
 * rounding level, or null if neither happens within `maxIter` steps or the Jacobian turns
 * singular.
 */
export function newton(
  F: (v: number[]) => { f: number[]; J: number[][] },
  v0: number[],
  {
    tol = 1e-13,
    maxStep = 4,
    maxIter = 80,
  }: { tol?: number; maxStep?: number; maxIter?: number } = {},
): number[] | null {
  const norm = (f: number[]) => f.reduce((acc, x) => acc + x * x, 0);
  let v = [...v0];
  let cur = F(v);
  for (let iter = 0; iter < maxIter; iter++) {
    const step = solveLinear(cur.J, cur.f);
    if (!step) return null;
    let size = 0;
    let relative = 0;
    for (let k = 0; k < v.length; k++) {
      const s = Math.abs(step[k]!);
      size = Math.max(size, s);
      relative = Math.max(relative, s / Math.max(1, Math.abs(v[k]!)));
    }
    let scale = size > maxStep ? maxStep / size : 1;
    const f0 = norm(cur.f);
    let next = v.map((x, k) => x - scale * step[k]!);
    let trial = next.every(Number.isFinite) ? F(next) : null;
    // Backtrack only while |F| is well above rounding; near the root a full step is taken.
    for (let h = 0; h < 30 && f0 > 1e-24; h++) {
      if (trial && trial.f.every(Number.isFinite) && norm(trial.f) < f0) break;
      scale *= 0.5;
      next = v.map((x, k) => x - scale * step[k]!);
      trial = F(next);
    }
    if (!trial || !next.every(Number.isFinite) || !trial.f.every(Number.isFinite)) return null;
    v = next;
    cur = trial;
    // Near a singular Jacobian rounding noise in F keeps the step from shrinking to `tol`; a
    // residual at rounding level with a small step is converged too.
    if (relative < tol || (relative < 1e-8 && norm(cur.f) < RESIDUAL_FLOOR ** 2)) return v;
  }
  return null;
}
