// App state (plan §1, §9 phases 3–9): the system (its name, parameters, window, component names
// and whether its window was fitted automatically), the cut temperature T*, whether the metastable
// lines are shown, and whether the lever rule is shown with its X₀, with the diagram that the
// physics core computes from the system once per change and the fields and metastable tie lines
// along the cut. Adapted from pTerrain's ui/state.ts.

import { boundaries, type Boundary } from "../physics/boundaries";
import { fieldsAt } from "../physics/cut";
import { invariantsOf, scan, scanIsFor, type DiagramEvent, type Scan } from "../physics/events";
import { fields, type Naming } from "../physics/fields";
import type { Params } from "../physics/gibbs";
import type { PlotWindow } from "../physics/plotWindow";
import {
  metastable,
  metastableTiesAt,
  type MetastableAtCut,
  type MetastableTie,
} from "../physics/metastable";
import type { Field } from "../physics/hull";
import { preset, PRESETS, type PresetId, type System } from "../physics/presets";
import { spinodal, type SpinodalRun } from "../physics/spinodal";

/** The names of the two components, under the ends of the X axis ("A" and "B" by default). */
export interface Components {
  A: string;
  B: string;
}

export const DEFAULT_COMPONENTS: Components = { A: "A", B: "B" };

/**
 * What the plots draw of one system: the scan of its window, its boundaries, its names, the
 * metastable extensions of its tie lines with liquid at one end and the visible runs of its
 * spinodals.
 */
export interface Diagram {
  scan: Scan;
  boundaries: Boundary[];
  naming: Naming;
  metastable: MetastableTie[];
  spinodals: SpinodalRun[];
}

export interface State {
  /**
   * The system's name (plan §8 row 17): the preset's label after a menu choice, otherwise what was
   * last applied (*Custom* by default). It changes nothing in the physics.
   */
  name: string;
  params: Params;
  window: PlotWindow;
  components: Components;
  /** Whether `window` came from `autoWindow` (the Parameters panel's *auto* box) when applied. */
  auto: boolean;
  /** Derived from `params` and `window`. */
  diagram: Diagram;
  /** The cut temperature T*, K, inside the window. */
  cut: number;
  /**
   * The fields along the cut, from the hull at T* (`fieldsAt`): what the slice panel, the guide
   * lines and the bold values draw. Derived from the system and `cut`.
   */
  atCut: Field[];
  /** The metastable extensions that reach the cut, each with its tie line there. */
  metastableAtCut: MetastableAtCut[];
  /** Whether the metastable lines are drawn (plan §1), set by the Metastable toggle. */
  showMetastable: boolean;
  /** Whether the lever rule is shown (plan §4 item 7), set by the Lever toggle. */
  showLever: boolean;
  /** The lever rule's overall composition X₀ in [0, 1]; kept when the cut or the system changes. */
  X0: number;
}

export type Listener = (state: Readonly<State>, prev: Readonly<State>) => void;

/**
 * The diagram of a system; throws for a system that does not pass `validate` (plan §2.2). The
 * scan `given` (from `checkSystem`) is used when it is this system's, so that Apply scans once.
 * The component names name a line compound.
 */
export function computeDiagram(
  params: Params,
  window: PlotWindow,
  given?: Scan,
  components: Components = DEFAULT_COMPONENTS,
): Diagram {
  const scanned = given && scanIsFor(given, params, window) ? given : scan(params, window);
  return {
    scan: scanned,
    boundaries: boundaries(params, window, scanned),
    naming: fields(params, window, scanned, components),
    metastable: metastable(params, window, scanned),
    spinodals: spinodal(params, window, scanned),
  };
}

/** What the store derives from the system and the cut. */
function alongCut(params: Params, diagram: Diagram, cut: number) {
  return {
    atCut: fieldsAt(params, cut, diagram.scan.events),
    metastableAtCut: metastableTiesAt(params, diagram.metastable, cut),
  };
}

/** Where the lever rule's X₀ starts (plan §4 item 7). */
export const DEFAULT_X0 = 0.5;

/** Where the cut starts, on first load and after a preset: the middle of the window (§4 item 5). */
export function defaultCut(window: PlotWindow): number {
  return 0.5 * (window.Tmin + window.Tmax);
}

/**
 * The invariant that the logo moves the cut to (plan §4.3): the lowest one above
 * `cut`, or past the highest the lowest of all; null for a system without one.
 */
export function nextInvariant(events: readonly DiagramEvent[], cut: number): DiagramEvent | null {
  const invariants = invariantsOf(events);
  return invariants.find((e) => e.T > cut) ?? invariants[0] ?? null;
}

export function clampCut(T: number, window: PlotWindow): number {
  return Math.min(window.Tmax, Math.max(window.Tmin, T));
}

/** The label of the preset that `system` is (the same objects), else *Custom*. */
function labelOf(system: System): string {
  return (
    PRESETS.find((p) => p.params === system.params && p.window === system.window)?.label ?? "Custom"
  );
}

/** A minimal observable store. Every change replaces the state object, so listeners can diff. */
export class Store {
  #state: State;
  #listeners = new Set<Listener>();

  constructor(system: System, components: Components = DEFAULT_COMPONENTS, name = labelOf(system)) {
    const diagram = computeDiagram(system.params, system.window, undefined, components);
    const cut = defaultCut(system.window);
    this.#state = {
      name,
      params: system.params,
      window: system.window,
      components,
      auto: false,
      diagram,
      cut,
      ...alongCut(system.params, diagram, cut),
      showMetastable: true,
      showLever: false,
      X0: DEFAULT_X0,
    };
  }

  get state(): Readonly<State> {
    return this.#state;
  }

  /** Calls `listener` after every change; returns a function that unsubscribes it. */
  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Moves the cut to T, clamped into the window; a value that is not a number is ignored. */
  setCut(T: number): void {
    if (!Number.isFinite(T)) return;
    const next = clampCut(T, this.#state.window);
    if (next === this.#state.cut) return;
    const { params, diagram } = this.#state;
    this.#update({ cut: next, ...alongCut(params, diagram, next) });
  }

  /**
   * Replaces the system, which must pass `validate`, and recomputes its diagram, even when it is
   * the same system, so that listeners can tell an applied system from other changes. With
   * `resetCut` the cut goes to the middle of the new window (a preset); otherwise it keeps its
   * value, clamped into the window. `scan`, the system's scan from `checkSystem`, saves scanning
   * it again.
   */
  setSystem(
    system: System,
    {
      name = this.#state.name,
      components = this.#state.components,
      auto = this.#state.auto,
      resetCut = false,
      scan,
    }: {
      name?: string;
      components?: Components;
      auto?: boolean;
      resetCut?: boolean;
      scan?: Scan;
    } = {},
  ): void {
    const { params, window } = system;
    const diagram = computeDiagram(params, window, scan, components);
    const cut = resetCut ? defaultCut(window) : clampCut(this.#state.cut, window);
    this.#update({
      name,
      params,
      window,
      components,
      auto,
      diagram,
      cut,
      ...alongCut(params, diagram, cut),
    });
  }

  /**
   * Applies a preset (plan §4 item 5): its label as the name, its parameters and window, the
   * default component names, the *auto* box unticked, and the cut in the middle of its window.
   */
  applyPreset(id: PresetId): void {
    const p = preset(id);
    this.setSystem(p, {
      name: p.label,
      components: DEFAULT_COMPONENTS,
      auto: false,
      resetCut: true,
    });
  }

  /** Moves the cut to `nextInvariant`; does nothing in a system without an invariant. */
  snapToInvariant(): void {
    const { diagram, cut } = this.#state;
    const target = nextInvariant(diagram.scan.events, cut);
    if (target) this.setCut(target.T);
  }

  setShowMetastable(show: boolean): void {
    if (show !== this.#state.showMetastable) this.#update({ showMetastable: show });
  }

  setShowLever(show: boolean): void {
    if (show !== this.#state.showLever) this.#update({ showLever: show });
  }

  /** Moves the lever rule's X₀ to X, clamped into [0, 1]; a value that is not a number is ignored. */
  setX0(X: number): void {
    if (!Number.isFinite(X)) return;
    const next = Math.min(1, Math.max(0, X));
    if (next !== this.#state.X0) this.#update({ X0: next });
  }

  #update(patch: Partial<State>): void {
    const prev = this.#state;
    this.#state = { ...prev, ...patch };
    for (const listener of this.#listeners) listener(this.#state, prev);
  }
}
