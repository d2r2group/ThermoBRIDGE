// The systems of plan §2.1: a grid of 18 α pairs for one pair of components, used by the tests
// and the cross-check, and the 20 presets of the menu: seven from the grid, five with other T_m,B,
// and the eight with an intermediate compound, c1–c8 (§9 phases 12–13). Every system uses
// Δs_A = Δs_B = 10 J/(mol·K) and T_m,A = 800 K.

import type { Compound, Params } from "./gibbs";
import type { PlotWindow } from "./plotWindow";

export interface System {
  params: Params;
  window: PlotWindow;
}

export type PanelId =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r";

/** The grid's components: T_m,A = 800 K, T_m,B = 1200 K, Δs_m = 10 J/(mol·K) for both. */
const COMPONENTS = { TmA: 800, TmB: 1200, dsA: 10, dsB: 10 } as const;
/** The window the grid's systems share. */
const GRID_WINDOW: PlotWindow = { Tmin: 300, Tmax: 1500 };

const panel = (alphaL: number, alphaS: number, window = GRID_WINDOW): System => ({
  params: { ...COMPONENTS, alphaL, alphaS },
  window,
});

/**
 * The 18 grid systems, α_l (kJ/mol) across from −20 to +30 and α_s down from +30 to −15. (k) has
 * the taller window for its liquid dome, which closes at 1804 K.
 */
export const PANELS: Record<PanelId, System> = {
  a: panel(-20, 30),
  b: panel(-10, 30),
  c: panel(0, 30),
  d: panel(10, 30),
  e: panel(20, 30),
  f: panel(-20, 15),
  g: panel(-10, 15),
  h: panel(0, 15),
  i: panel(10, 15),
  j: panel(20, 15),
  k: panel(30, 15, { Tmin: 300, Tmax: 1900 }),
  l: panel(-20, 0),
  m: panel(-10, 0),
  n: panel(0, 0),
  o: panel(10, 0),
  p: panel(-20, -15),
  q: panel(-10, -15),
  r: panel(0, -15),
};

export type CompoundPresetId = "c1" | "c2" | "c3" | "c4" | "c5" | "c6" | "c7" | "c8";

export type PresetId =
  "n" | "m" | "o" | "m1" | "h" | "c" | "p1" | "p2" | "p3" | "e" | "p4" | "k" | CompoundPresetId;

/**
 * The menu's groups, by what the solutions do: ideal, solid mixing fully, solid or liquid gap,
 * and an intermediate compound.
 */
export type PresetGroup = "ideal" | "solid-solution" | "solid-gap" | "liquid-gap" | "compound";

export interface Preset extends System {
  id: PresetId;
  group: PresetGroup;
  /** The closed menu's label, e.g. "Eutectic". */
  label: string;
}

const system = (TmB: number, alphaL: number, alphaS: number, window: PlotWindow): System => ({
  params: { ...COMPONENTS, TmB, alphaL, alphaS },
  window,
});

const fromGrid = (id: PanelId & PresetId, group: PresetGroup, label: string): Preset => ({
  id,
  group,
  label,
  ...PANELS[id],
});

/** A preset with an intermediate compound (plan §9 phases 12–13), in the menu's fifth group. */
export interface CompoundPreset extends Preset {
  id: CompoundPresetId;
  group: "compound";
}

/** A system, a grid one's ((h)'s by default), with a compound at X_c = 0.5 unless given. */
const withCompound = (
  id: CompoundPresetId,
  label: string,
  compound: Omit<Compound, "Xc"> & { Xc?: number },
  base: PanelId | System = "h",
): CompoundPreset => {
  const { params, window } = typeof base === "string" ? PANELS[base] : base;
  return {
    id,
    group: "compound",
    label,
    params: { ...params, compound: { Xc: 0.5, ...compound } },
    window,
  };
};

const line = (dhf: number, dsf: number) => ({ dhf, dsf, width: "line" as const, alphaG: 0 });

/**
 * The eight compound presets, c1–c8, with (h)'s components and X_c = 0.5: c6 with (k)'s α, c7
 * with (n)'s, where the compound dissolves into the solid with no liquid (§2.1), and c8 with
 * T_m,B = 1800 K and X_c = 0.75, where the solid melts on cooling, into the liquid and AB₃.
 */
export const COMPOUND_PRESETS: CompoundPreset[] = [
  withCompound("c1", "Congruent compound", line(-6, 0)),
  withCompound("c2", "Incongruent compound", line(-1.5, 0)),
  withCompound("c3", "Berthollide compound", { dhf: -6, dsf: 0, width: "range", alphaG: -150 }),
  withCompound("c4", "Eutectoid", line(2, 5)),
  withCompound("c5", "Peritectoid", line(-3, -6)),
  withCompound("c6", "Syntectic with a compound", line(-6, 0), "k"),
  withCompound("c7", "Compound that dissolves in the solid", line(-6, -3), "n"),
  withCompound(
    "c8",
    "Metatectic",
    { ...line(-13, -3), Xc: 0.75 },
    system(1800, 19, 0, { Tmin: 300, Tmax: 2000 }),
  ),
];

/** The 20 presets in menu order, group by group, the compound presets last. */
export const PRESETS: Preset[] = [
  fromGrid("n", "ideal", "Ideal lens"),
  fromGrid("m", "solid-solution", "Lens with a melting dip"),
  fromGrid("o", "solid-solution", "Lens with a melting peak"),
  // The Au–Ni type: a solid dome wholly below a congruent minimum.
  {
    id: "m1",
    group: "solid-gap",
    label: "Melting dip over a solid gap",
    ...system(1200, -15, 6, { Tmin: 200, Tmax: 1400 }),
  },
  fromGrid("h", "solid-gap", "Eutectic"),
  fromGrid("c", "solid-gap", "Eutectic, wider gap"),
  // The default eutectic's α with the melting points 1600 K apart: it has turned peritectic.
  {
    id: "p1",
    group: "solid-gap",
    label: "Peritectic",
    ...system(2400, 0, 15, { Tmin: 300, Tmax: 2500 }),
  },
  // α_l = +10, α_s = +15 kJ/mol with T_m,B = 1600 K: a wide α field and a broad L + β field.
  {
    id: "p2",
    group: "solid-gap",
    label: "Peritectic, broad L + β",
    ...system(1600, 10, 15, { Tmin: 300, Tmax: 1700 }),
  },
  // A liquid close to unmixing gives a flat liquidus.
  {
    id: "p3",
    group: "solid-gap",
    label: "Peritectic, flat liquidus",
    ...system(2000, 20, 17.5, { Tmin: 300, Tmax: 2100 }),
  },
  fromGrid("e", "liquid-gap", "Eutectic and monotectic"),
  // A small liquid dome on the L + S field above a peritectic.
  {
    id: "p4",
    group: "liquid-gap",
    label: "Peritectic and monotectic",
    ...system(1200, 20, 20, GRID_WINDOW),
  },
  fromGrid("k", "liquid-gap", "Syntectic"),
  ...COMPOUND_PRESETS,
];

export function compoundPreset(id: CompoundPresetId): CompoundPreset {
  const p = COMPOUND_PRESETS.find((q) => q.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
}

/** The preset the app starts with: the eutectic most students meet first. */
export const DEFAULT_PRESET: PresetId = "h";

export function preset(id: PresetId): Preset {
  const p = PRESETS.find((q) => q.id === id);
  if (!p) throw new Error(`no preset ${id}`);
  return p;
}
