// The path each move of the α mode takes to the plots (plan §9 phase 15): at each position the
// knob or the slider reaches, the page draws its preview (or its full diagram, when that is
// cached) and asks the Web Worker for the full one (fullDiagrams.ts). Once the knob has rested
// SETTLE_MS, or is released, the full diagram replaces the preview as soon as it is there. The
// field labels and points' names wait for that rest even on a cached full diagram
// (`State.alphaMoving`), so that they do not flash on and off. A position that cannot be computed
// keeps the last diagram on screen. The pad (alphaPad.ts, §9 phase 17) passes pointer moves to
// `move` at most once per frame (schedule.ts `perFrame`), so that a slow preview drops positions
// rather than queuing them. The timer and the worker are parameters, so that the logic can be
// tested in Node.

import { AlphaCache, type Cached } from "./alphaCache";
import { alphaSystem, quantise, samePoint, type AlphaPoint } from "./alphaPoint";
import { createFullDiagrams, type Channel } from "./fullDiagrams";
import type { Store } from "./state";

/** How long the knob must rest before the full diagram replaces the preview, ms. */
export const SETTLE_MS = 150;

/** The timeout calls `createAlphaDrag` uses; the browser's by default. */
export interface Timeouts {
  set(run: () => void, ms: number): unknown;
  clear(id: unknown): void;
}

const BROWSER_TIMEOUTS: Timeouts = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export interface AlphaDrag {
  /** Shows the preview of `p` (rounded to the steps) and asks for the full one. */
  move(p: AlphaPoint): void;
  /** Shows the full diagram of the last position as soon as it is there, without waiting. */
  release(): void;
}

export interface AlphaDragOptions {
  cache?: AlphaCache;
  timeouts?: Timeouts;
  /** Where the full diagrams are computed: the Web Worker by default. */
  channel?: Channel;
  /**
   * Called with whether each diagram drawn or tried could be computed, so that the pad can mark
   * the knob (§9 phase 17).
   */
  onComputed?: (ok: boolean, p: AlphaPoint) => void;
  /**
   * Whether the drag may still change the store: the pad's is not once the α mode is left, when a
   * full diagram or a rest may still be on its way.
   */
  active?: () => boolean;
}

/** Moves `store` through the α mode's systems. */
export function createAlphaDrag(
  store: Store,
  {
    cache = new AlphaCache(),
    timeouts = BROWSER_TIMEOUTS,
    channel,
    onComputed,
    active = () => true,
  }: AlphaDragOptions = {},
): AlphaDrag {
  let last: AlphaPoint | null = null;
  /** Whether the knob has rested SETTLE_MS at `last`, or been released there. */
  let settled = false;
  let timer: unknown = null;

  /** Draws `diagram` of `p`, or keeps the last one where it is null, with `moving` set. */
  const show = (p: AlphaPoint, diagram: Cached, moving: boolean) => {
    if (!active()) return;
    onComputed?.(diagram !== null, p);
    if (diagram === null || diagram === store.state.diagram) store.setAlphaMoving(moving);
    else store.setSystem(alphaSystem(p), { diagram, alphaMoving: moving });
  };

  const full = createFullDiagrams((p, diagram) => {
    cache.set(p, false, diagram);
    if (settled && last && samePoint(p, last)) show(p, diagram, false);
  }, channel);

  const settle = () => {
    if (timer !== null) timeouts.clear(timer);
    timer = null;
    settled = true;
    if (last && cache.has(last, false)) show(last, cache.get(last, false), false);
    else if (active()) store.setAlphaMoving(false);
  };

  return {
    move(p) {
      last = quantise(p);
      if (timer !== null) timeouts.clear(timer);
      settled = false;
      // The rest is counted from the move, not from when its preview is drawn. A cached full
      // diagram waits for it too, for its labels: drawn at once, they would flash on and off
      // between previews.
      timer = timeouts.set(settle, SETTLE_MS);
      if (cache.has(last, false)) {
        show(last, cache.get(last, false), true);
        return;
      }
      full.request(last);
      show(last, cache.get(last, true), true);
    },
    release: settle,
  };
}
