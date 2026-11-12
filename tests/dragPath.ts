// The systems an α-mode drag passes through (plan §9 phase 15), shared by the bench and the
// Playwright timing: a circle on the α_s–α_l pad.

import type { Params } from "../src/physics/gibbs";
import { alphaSystem, type AlphaCompound } from "../src/ui/alphaPoint";

/**
 * `n` systems around a circle of radius 25 kJ/mol about the pad's centre, starting at
 * (α_s, α_l) = (+25, 0), each α rounded to the pad's 0.5 kJ/mol: eutectics, peritectics, lenses,
 * liquid domes and melting peaks; with `compound`, each with that line compound (plan §9 phase 19).
 */
export function dragPath(n = 100, TmB = 1200, compound: AlphaCompound | null = null): Params[] {
  const half = (v: number) => Math.round(2 * v) / 2;
  return Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n;
    return alphaSystem({
      alphaS: half(25 * Math.cos(t)),
      alphaL: half(25 * Math.sin(t)),
      TmB,
      compound,
    }).params;
  });
}
