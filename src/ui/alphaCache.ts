// The α mode's diagrams (plan §9 phase 15): a least-recently-used cache of the diagrams of the
// positions a drag has passed, previews and full ones under separate keys, with the failures, so
// that a drag back and forth computes each system once. A diagram's row hulls stay with it
// (regions.ts `rowHullsOf`), so a cached one repaints without them too. The positions and their
// systems are in alphaPoint.ts.

import { COARSE_STEP, EventError } from "../physics/events";
import { HullError } from "../physics/hull";
import { checkSystem } from "../physics/validity";
import { alphaSystem, quantise, type AlphaPoint } from "./alphaPoint";
import { computeDiagram, DEFAULT_COMPONENTS, type Diagram } from "./state";

/** A map that keeps its `capacity` most recently used entries. */
export class Lru<K, V> {
  readonly #map = new Map<K, V>();

  constructor(readonly capacity: number) {}

  get size(): number {
    return this.#map.size;
  }

  has(key: K): boolean {
    return this.#map.has(key);
  }

  /** The entry for `key`, which becomes the most recently used. */
  get(key: K): V | undefined {
    if (!this.#map.has(key)) return undefined;
    const value = this.#map.get(key)!;
    this.#map.delete(key);
    this.#map.set(key, value);
    return value;
  }

  /** Stores `value` as the most recently used, dropping the least recently used past capacity. */
  set(key: K, value: V): void {
    this.#map.delete(key);
    this.#map.set(key, value);
    if (this.#map.size > this.capacity) this.#map.delete(this.#map.keys().next().value!);
  }
}

/**
 * How many diagrams the cache keeps. A full diagram of the α mode's window with its row hulls at
 * 2× device pixels (700 rows) held about 1.8 MB, a preview with half the rows about 0.6 MB
 * (heap measured over 40 systems with `--expose-gc`, November 2026), in the first 300–1500 K
 * window; the 100–1900 K window adds about 0.3 and 0.1 MB: 48 entries hold 35–100 MB. With c1's
 * line compound (plan §9 phase 19) a full diagram holds about 2.9 MB and a preview, with a quarter
 * of the rows, about 0.9 MB, against 2.25 and 0.74 MB without (measured again November 2026), so
 * 48 entries hold at most about 140 MB.
 */
export const ALPHA_CACHE_SIZE = 48;

/** The diagram of a position, or null for one that cannot be computed (plan §2.2). */
export type Cached = Diagram | null;

/** The diagrams of the α mode's positions, each computed once until it is evicted. */
export class AlphaCache {
  readonly #lru: Lru<string, Cached>;

  constructor(capacity = ALPHA_CACHE_SIZE) {
    this.#lru = new Lru(capacity);
  }

  /**
   * The cache key of `p` (rounded to the steps) as a preview or a full diagram: its α_s, α_l,
   * T_m,B and its compound's X_c, Δh_f and Δs_f, or `-` for none.
   */
  static key(p: AlphaPoint, preview: boolean): string {
    const q = quantise(p);
    const c = q.compound ? `${q.compound.Xc},${q.compound.dhf},${q.compound.dsf}` : "-";
    return `${q.alphaS},${q.alphaL},${q.TmB},${c},${preview ? "p" : "f"}`;
  }

  /** Whether the diagram of `p` is cached, a failure included. */
  has(p: AlphaPoint, preview: boolean): boolean {
    return this.#lru.has(AlphaCache.key(p, preview));
  }

  /** The diagram of `p` (`computeAlpha`), from the cache or computed and cached. */
  get(p: AlphaPoint, preview: boolean): Cached {
    const key = AlphaCache.key(p, preview);
    const kept = this.#lru.get(key);
    if (kept !== undefined) return kept;
    const value = computeAlpha(p, preview);
    this.#lru.set(key, value);
    return value;
  }

  /** Stores the diagram of `p` computed elsewhere (the Web Worker, fullDiagrams.ts). */
  set(p: AlphaPoint, preview: boolean, value: Cached): void {
    this.#lru.set(AlphaCache.key(p, preview), value);
  }
}

/**
 * The diagram of `p` (rounded to the steps): a preview scanned in COARSE_STEP, or the full
 * diagram of a system that passes `checkSystem`; null where the calculation fails.
 */
export function computeAlpha(p: AlphaPoint, preview: boolean): Cached {
  const { params, window } = alphaSystem(quantise(p));
  if (!preview) {
    const checked = checkSystem(params, window);
    return checked.ok ? computeDiagram(params, window, checked.scan) : null;
  }
  // The α mode's ranges pass the numeric limits, so only the calculation itself can fail.
  try {
    return computeDiagram(params, window, undefined, DEFAULT_COMPONENTS, COARSE_STEP);
  } catch (err) {
    if (err instanceof HullError || err instanceof EventError) return null;
    throw err;
  }
}
