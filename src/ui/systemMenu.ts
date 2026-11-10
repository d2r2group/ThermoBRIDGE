// The System menu in the header's main row (plan §4 item 5, §8 row 15), adapted from pTerrain's
// Substance menu: the presets grouped by what the solutions do (ideal, solid mixing fully, a solid
// gap, a liquid gap too, an intermediate compound), then Custom. Choosing a preset applies it at once; the menu names the
// applied preset, or on a custom system its applied name (plan §8 row 17).

import { compoundName } from "../physics/fields";
import { PANELS, PRESETS, type Preset, type PresetId } from "../physics/presets";
import { signed } from "./format";
import type { Store } from "./state";
import { matchPreset } from "./systemFields";
import { CUSTOM_NAME } from "./systemFile";

/** The menu's value for a system that is no preset. */
export const CUSTOM = "custom";

/**
 * The text of a preset in the open menu: its short label, then the α values and T_m,B, e.g.
 * "Eutectic: αₗ 0, αₛ +15 kJ/mol; B melts at 1200 K", or for a compound its name and formation
 * values in place of T_m,B, e.g. "Congruent compound: αₗ 0, αₛ +15 kJ/mol; AB, formation Δh −6 kJ/mol",
 * with T_m,B as well where it is not the grid's 1200 K. The closed menu shows the label alone.
 */
export function presetOptionText(p: Preset): string {
  const { alphaL, alphaS, TmB, compound: c } = p.params;
  const alphas = `${p.label}: αₗ ${signed(alphaL)}, αₛ ${signed(alphaS)} kJ/mol`;
  if (!c) return `${alphas}; B melts at ${TmB} K`;
  const parts = [compoundName(c, { A: "A", B: "B" }).name, `formation Δh ${signed(c.dhf)} kJ/mol`];
  if (TmB !== PANELS.h.params.TmB) parts.unshift(`B melts at ${TmB} K`);
  if (c.dsf !== 0) parts.push(`Δs ${signed(c.dsf)} J/(mol·K)`);
  if (c.width === "range") parts.push(`αᵧ ${signed(c.alphaG)} kJ/mol`);
  return `${alphas}; ${parts.join(", ")}`;
}

const GROUPS: readonly { group: Preset["group"]; label: string }[] = [
  { group: "ideal", label: "Ideal solutions" },
  { group: "solid-solution", label: "Complete solid solubility" },
  { group: "solid-gap", label: "Solid miscibility gap" },
  { group: "liquid-gap", label: "Liquid miscibility gap" },
  { group: "compound", label: "Intermediate compound" },
];

/**
 * Builds the menu in `container`. The open list shows each preset's α values and T_m,B; the closed
 * menu shows only its short label, drawn over the select, whose own text is transparent.
 * `onCustom` runs when Custom is chosen, which changes nothing in the system: it is where edits
 * start (the Parameters panel opens).
 */
export function createSystemMenu(container: HTMLElement, store: Store, onCustom: () => void): void {
  const root = document.createElement("div");
  root.className = "system-menu";
  const select = document.createElement("select");
  select.setAttribute("aria-label", "System");
  select.title = "Choose a preset system";
  for (const { group, label } of GROUPS) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = label;
    for (const p of PRESETS.filter((q) => q.group === group)) {
      optgroup.append(new Option(presetOptionText(p), p.id));
    }
    select.append(optgroup);
  }
  // While it is selected, the Custom option reads the applied name.
  const customOption = new Option(CUSTOM_NAME, CUSTOM);
  select.append(customOption);
  const shown = document.createElement("span");
  shown.className = "system-label";
  shown.setAttribute("aria-hidden", "true");
  root.append(select, shown);
  container.append(root);

  const showLabel = () => {
    const p = PRESETS.find((q) => q.id === select.value);
    shown.textContent = p ? p.label : customOption.text;
  };

  const sync = () => {
    const { name, params, window, components } = store.state;
    const id = matchPreset(params, window, components);
    customOption.text = id ? CUSTOM_NAME : name;
    select.value = id ?? CUSTOM;
    showLabel();
  };
  sync();

  // Custom changes nothing, so the menu goes back to naming the applied system.
  select.addEventListener("change", () => {
    if (select.value === CUSTOM) onCustom();
    else store.applyPreset(select.value as PresetId);
    sync();
  });
  // Every applied system, a preset or an edit, recomputes the diagram.
  store.subscribe((state, prev) => {
    if (
      state.diagram !== prev.diagram ||
      state.components !== prev.components ||
      state.name !== prev.name
    ) {
      sync();
    }
  });
}
