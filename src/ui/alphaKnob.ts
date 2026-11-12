// Where the α pad's knob goes (plan §9 phase 17): the map between the pad's square and (α_s, α_l),
// the lock that keeps the knob on the axes, the arrow keys, and the values typed in the side
// column. No DOM here, so that the rules can be tested in Node.

import {
  ALPHA_MAX,
  clampAlpha,
  clampDhf,
  clampDsf,
  clampTmB,
  clampXc,
  type AlphaCompound,
  type AlphaPoint,
} from "./alphaPoint";

/** The knob's position on the pad, kJ/mol. */
export type Alphas = Pick<AlphaPoint, "alphaS" | "alphaL">;

/** The knob's step for an arrow key, kJ/mol, and with Shift. */
export const KEY_STEP = 1;
export const SHIFT_KEY_STEP = 5;

/**
 * The (α_s, α_l) at (x, y) in a pad `side` px square, from its top-left corner: α_s across from
 * −ALPHA_MAX at the left edge, α_l up from −ALPHA_MAX at the bottom, clamped into the square and
 * rounded to the knob's step.
 */
export function alphasAt(x: number, y: number, side: number): Alphas {
  const span = 2 * ALPHA_MAX;
  return {
    alphaS: clampAlpha((x / side) * span - ALPHA_MAX),
    alphaL: clampAlpha(ALPHA_MAX - (y / side) * span),
  };
}

/** The (x, y) of `p` in a pad `side` px square, from its top-left corner. */
export function padXY({ alphaS, alphaL }: Alphas, side: number): { x: number; y: number } {
  const span = 2 * ALPHA_MAX;
  return { x: ((alphaS + ALPHA_MAX) / span) * side, y: ((ALPHA_MAX - alphaL) / span) * side };
}

/**
 * `p` pulled onto the nearest of `targets` within `radius` px of it on a pad `side` px square,
 * else `p` itself: the grid presets' slight magnet for a drag.
 */
export function snapAlphas(
  p: Alphas,
  targets: readonly Alphas[],
  side: number,
  radius: number,
): Alphas {
  const at = padXY(p, side);
  let best: Alphas = p;
  let bestD = radius;
  for (const t of targets) {
    const xy = padXY(t, side);
    const d = Math.hypot(xy.x - at.x, xy.y - at.y);
    if (d <= bestD) [best, bestD] = [{ alphaS: t.alphaS, alphaL: t.alphaL }, d];
  }
  return best;
}

/** Whether `p` lies on one of the pad's axes. */
export const onAxes = ({ alphaS, alphaL }: Alphas) => alphaS === 0 || alphaL === 0;

/**
 * `p` on the axis nearest it, both axes having one scale: α_l = 0 where |α_s| ≥ |α_l|, else
 * α_s = 0. A drag under the lock passes through the centre to change axis.
 */
export function toAxes({ alphaS, alphaL }: Alphas): Alphas {
  return Math.abs(alphaS) >= Math.abs(alphaL) ? { alphaS, alphaL: 0 } : { alphaS: 0, alphaL };
}

/**
 * Under the lock, the knob moved by `d` along α_s (`across`) or α_l: along its own axis as
 * usual; across it, towards the centre, and past the centre onto the other axis in the key's
 * direction, as a drag would. At the centre each key moves along its own axis.
 */
function lockedStep(p: Alphas, d: number, across: boolean): Alphas {
  const [own, other]: [keyof Alphas, keyof Alphas] = across
    ? ["alphaS", "alphaL"]
    : ["alphaL", "alphaS"];
  if (p[other] === 0) return { ...p, [own]: p[own] + d };
  const left = Math.abs(p[other]) - Math.abs(d);
  if (left >= 0) return { ...p, [other]: Math.sign(p[other]) * left + 0 };
  return { ...p, [other]: 0, [own]: Math.sign(d) * -left };
}

/**
 * The knob after pressing `key`, or null for a key that does not move it: the arrows step it by
 * KEY_STEP (SHIFT_KEY_STEP with Shift), Home moves it to the centre. Under the lock a knob off
 * the axes (where the mode opened) first goes to the nearest one.
 */
export function alphasAfterKey(
  key: string,
  shift: boolean,
  p: Alphas,
  locked: boolean,
): Alphas | null {
  if (key === "Home") return { alphaS: 0, alphaL: 0 };
  const d = shift ? SHIFT_KEY_STEP : KEY_STEP;
  const steps: Record<string, [number, boolean]> = {
    ArrowRight: [d, true],
    ArrowLeft: [-d, true],
    ArrowUp: [d, false],
    ArrowDown: [-d, false],
  };
  if (!Object.hasOwn(steps, key)) return null;
  const [step, across] = steps[key]!;
  const next = locked
    ? lockedStep(toAxes(p), step, across)
    : across
      ? { ...p, alphaS: p.alphaS + step }
      : { ...p, alphaL: p.alphaL + step };
  return { alphaS: clampAlpha(next.alphaS), alphaL: clampAlpha(next.alphaL) };
}

/** A field of the side column (plan §9 phases 17 and 19): α_s, α_l, T_m,B, and the compound's. */
export type AlphaField = "alphaS" | "alphaL" | "TmB" | keyof AlphaCompound;

/** Each compound field's clamp: X_c to the nearest stop, Δh_f and Δs_f into their ranges. */
const COMPOUND_CLAMP: Record<keyof AlphaCompound, (v: number) => number> = {
  Xc: clampXc,
  dhf: clampDhf,
  dsf: clampDsf,
};

/**
 * The position after typing `value` into `field` at `p`, or null for a value that is not a
 * number, or for a compound field at a position without a compound: clamped into the range and
 * rounded to the step, X_c moved to the nearest stop. Under the lock a nonzero α sets the other α
 * to 0, so the knob stays on the axes.
 */
export function typedPoint(
  field: AlphaField,
  value: number,
  p: AlphaPoint,
  locked: boolean,
): AlphaPoint | null {
  if (!Number.isFinite(value)) return null;
  if (field === "TmB") return { ...p, TmB: clampTmB(value) };
  if (field === "Xc" || field === "dhf" || field === "dsf") {
    if (!p.compound) return null;
    return { ...p, compound: { ...p.compound, [field]: COMPOUND_CLAMP[field](value) } };
  }
  const v = clampAlpha(value);
  const next = { ...p, [field]: v };
  if (locked && v !== 0) next[field === "alphaS" ? "alphaL" : "alphaS"] = 0;
  return next;
}
