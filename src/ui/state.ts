// App state (plan §1, §9 phases 3–9 and 16–18): the mode, the system (its name, parameters, window,
// component names and whether its window was fitted automatically), the cut temperature T*,
// whether the metastable lines are shown, whether the lever rule is shown with its X₀, and the α
// mode's *Stay on the axes* box, with the diagram that the physics core computes from the system
// once per change and the fields and metastable tie lines along the cut. Adapted from pTerrain's ui/state.ts.

import { boundaries, type Boundary } from "../physics/boundaries";
import { fieldsAt } from "../physics/cut";
import {
  invariantsOf,
  scan,
  scanIsFor,
  STEP,
  type DiagramEvent,
  type Scan,
} from "../physics/events";
import { fields, type Naming } from "../physics/fields";
import { sameParams, type Params } from "../physics/gibbs";
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
import { alphaName, alphaPointOf, alphaSystem } from "./alphaPoint";

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

/**
 * The page's two modes (plan §9 phase 16): the Δg^M mode moves a cut through one system, the α
 * mode moves through the systems on an α_s–α_l pad.
 */
export type Mode = "dg" | "alpha";

export interface State {
  mode: Mode;
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
  /** Whether the diagram names its fields (and a line compound), set by the Labels button. */
  showFieldLabels: boolean;
  /** Whether the diagram names each marked point ("Eutectic, 634 K"), set by the Labels button. */
  showPointLabels: boolean;
  /** Whether the lever rule is shown (plan §4 item 7), set by the Lever toggle. */
  showLever: boolean;
  /** The lever rule's overall composition X₀ in [0, 1]; kept when the cut or the system changes. */
  X0: number;
  /** The α mode's *Stay on the axes* box (plan §9 phase 17), unticked each time the mode opens. */
  alphaLock: boolean;
  /**
   * Whether the α mode's knob or slider is moving (plan §9 phase 15): set by each move and cleared
   * once it rests or is released, so that a full diagram from the cache drawn mid-drag hides its
   * field labels and points' names as a preview does, rather than flash them.
   */
  alphaMoving: boolean;
}

export type Listener = (state: Readonly<State>, prev: Readonly<State>) => void;

/**
 * The diagram of a system; throws for a system that does not pass `validate` (plan §2.2). The
 * scan `given` (from `checkSystem`) is used when it is this system's, so that Apply scans once.
 * The component names name a line compound. A `step` coarser than STEP gives the α mode's
 * preview (plan §9 phase 15).
 */
export function computeDiagram(
  params: Params,
  window: PlotWindow,
  given?: Scan,
  components: Components = DEFAULT_COMPONENTS,
  step = STEP,
): Diagram {
  const scanned =
    given && scanIsFor(given, params, window, step) ? given : scan(params, window, step);
  return {
    scan: scanned,
    boundaries: boundaries(params, window, scanned),
    naming: fields(params, window, scanned, components),
    metastable: metastable(params, window, scanned),
    spinodals: spinodal(params, window, scanned),
  };
}

/** Whether `diagram` is a preview, scanned coarser than STEP (plan §9 phase 15). */
export const isPreview = (diagram: Diagram) => diagram.scan.step !== STEP;

/**
 * Whether the field labels and points' names wait: for a preview, and for any diagram
 * while the α mode's knob is moving, so that they do not flash on cached full diagrams.
 */
export const labelsWait = (state: Readonly<State>) => isPreview(state.diagram) || state.alphaMoving;

/** What the store derives from the system and the cut. */
function alongCut(params: Params, diagram: Diagram, cut: number) {
  return {
    atCut: fieldsAt(params, cut, diagram.scan.events),
    metastableAtCut: metastableTiesAt(params, diagram.metastable, cut),
  };
}

/**
 * `state` with the cut at T, clamped into the window, and what the cut derives; for a figure
 * series (plan §9 phase 20), which draws the plots at cuts the store never takes.
 */
export function stateAtCut(state: Readonly<State>, T: number): Readonly<State> {
  const cut = clampCut(T, state.window);
  return { ...state, cut, ...alongCut(state.params, state.diagram, cut) };
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

/**
 * A minimal observable store. Every change replaces the state object, so listeners can diff. In
 * the α mode it keeps the Δg^M mode's state, to come back to.
 */
export class Store {
  #state: State;
  #listeners = new Set<Listener>();
  /** While the α mode is on: the Δg^M mode's state, and the parameters the α mode started at. */
  #kept: { state: State; entry: Params } | null = null;

  constructor(system: System, components: Components = DEFAULT_COMPONENTS, name = labelOf(system)) {
    const diagram = computeDiagram(system.params, system.window, undefined, components);
    const cut = defaultCut(system.window);
    this.#state = {
      mode: "dg",
      name,
      params: system.params,
      window: system.window,
      components,
      auto: false,
      diagram,
      cut,
      ...alongCut(system.params, diagram, cut),
      showMetastable: true,
      showFieldLabels: true,
      showPointLabels: false,
      showLever: false,
      X0: DEFAULT_X0,
      alphaLock: false,
      alphaMoving: false,
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
   * it again; `diagram`, the system's diagram from the α mode's cache, saves computing it. In the
   * α mode the name follows the system's values (`alphaName`) unless one is given; `alphaMoving`
   * sets the flag of that name, which is otherwise kept.
   */
  setSystem(
    system: System,
    {
      name = this.#state.mode === "alpha" ? alphaName(system.params) : this.#state.name,
      components = this.#state.components,
      auto = this.#state.auto,
      resetCut = false,
      scan,
      diagram: given,
      alphaMoving = this.#state.alphaMoving,
    }: {
      name?: string;
      components?: Components;
      auto?: boolean;
      resetCut?: boolean;
      scan?: Scan;
      diagram?: Diagram;
      alphaMoving?: boolean;
    } = {},
  ): void {
    const { params, window } = system;
    const diagram = given ?? computeDiagram(params, window, scan, components);
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
      alphaMoving,
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

  /**
   * Moves the cut to `nextInvariant`; does nothing in a system without an invariant, or in the α
   * mode, which has no cut.
   */
  snapToInvariant(): void {
    const { diagram, cut, mode } = this.#state;
    const target = nextInvariant(diagram.scan.events, cut);
    if (target && mode === "dg") this.setCut(target.T);
  }

  setShowMetastable(show: boolean): void {
    if (show !== this.#state.showMetastable) this.#update({ showMetastable: show });
  }

  /**
   * Steps the Labels button on, one half at a time: field names alone, then with the marked
   * points' names, then the points' names alone, then neither, then field names alone again.
   */
  cycleLabels(): void {
    const { showFieldLabels: fields, showPointLabels: points } = this.#state;
    if (fields && !points) this.#update({ showPointLabels: true });
    else if (fields) this.#update({ showFieldLabels: false });
    else if (points) this.#update({ showPointLabels: false });
    else this.#update({ showFieldLabels: true });
  }

  /** Shows or hides the lever rule; the α mode has none. */
  setShowLever(show: boolean): void {
    if (show !== this.#state.showLever && this.#state.mode === "dg") {
      this.#update({ showLever: show });
    }
  }

  /**
   * Switches the mode (plan §9 phases 16 and 19). Entering the α mode keeps the Δg^M mode's state
   * and starts from its α_s, α_l, T_m,B and line compound (`alphaPointOf`; a compound with a
   * range is dropped), with the fixed components, the α mode's window, no lever rule and *Stay on
   * the axes* unticked. Leaving it brings that state
   * back if the α mode's system is still the one it started at; otherwise the Δg^M mode takes
   * that system (a preset, with its name and window, where it has a preset's parameters; else
   * named from its values, in the α mode's window), with *auto* unticked and the cut in the
   * window's middle, and keeps X₀ and the lever rule. The Metastable toggle and the Labels button
   * are the same in both modes.
   */
  setMode(mode: Mode): void {
    if (mode === this.#state.mode) return;
    if (mode === "alpha") this.#enterAlpha();
    else this.#leaveAlpha();
  }

  #enterAlpha(): void {
    const { params, window } = alphaSystem(alphaPointOf(this.#state.params));
    this.#kept = { state: this.#state, entry: params };
    const diagram = computeDiagram(params, window);
    const cut = defaultCut(window);
    this.#update({
      mode: "alpha",
      name: alphaName(params),
      params,
      window,
      components: DEFAULT_COMPONENTS,
      auto: false,
      diagram,
      cut,
      ...alongCut(params, diagram, cut),
      showLever: false,
      alphaLock: false,
      alphaMoving: false,
    });
  }

  /**
   * The state that leaving the α mode would give (`setMode("dg")`), without leaving it; in the
   * Δg^M mode, the state itself. A TDB or figure export (plan §9 phase 20) writes this.
   */
  dgState(): Readonly<State> {
    const kept = this.#kept;
    if (this.#state.mode === "dg" || !kept) return this.#state;
    const {
      params,
      window,
      diagram: shown,
      showMetastable,
      showFieldLabels,
      showPointLabels,
    } = this.#state;
    if (sameParams(params, kept.entry)) {
      return { ...kept.state, showMetastable, showFieldLabels, showPointLabels };
    }
    // At a preset's parameters the Δg^M mode takes the preset, in its own window.
    const match = PRESETS.find((p) => sameParams(params, p.params));
    const target = match ? match.window : window;
    // A drag can leave a preview on screen; the Δg^M mode draws the full diagram.
    const diagram = match || isPreview(shown) ? computeDiagram(params, target) : shown;
    const cut = defaultCut(target);
    return {
      ...this.#state,
      mode: "dg",
      name: match ? match.label : alphaName(params),
      window: target,
      auto: false,
      diagram,
      cut,
      ...alongCut(params, diagram, cut),
      showLever: kept.state.showLever,
      X0: kept.state.X0,
      alphaMoving: false,
    };
  }

  #leaveAlpha(): void {
    const next = this.dgState();
    this.#kept = null;
    this.#update(next);
  }

  /** Ticks or unticks the α mode's *Stay on the axes* box. */
  setAlphaLock(locked: boolean): void {
    if (locked !== this.#state.alphaLock) this.#update({ alphaLock: locked });
  }

  /** Sets whether the α mode's knob or slider is moving (`State.alphaMoving`). */
  setAlphaMoving(moving: boolean): void {
    if (moving !== this.#state.alphaMoving) this.#update({ alphaMoving: moving });
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
