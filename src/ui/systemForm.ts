// The Parameters panel's form (plan §4 item 6): Apply, Import and Export, the Name field, and the
// Solutions, Components, Compound and Window fieldsets, with Δh beside each Δs, the *Add compound*
// box and the Width control (Line | Range) in Compound (§9 phase 13), and the *auto* box in the
// Window legend. systemPanel.ts fills it and reads it.

import type { Compound } from "../physics/gibbs";
import type { Components } from "./state";
import {
  COMPONENT_FIELDS,
  COMPONENT_NAME_MAX,
  COMPOUND_FIELDS,
  FIELD_KEYS,
  recordOf,
  SOLUTION_FIELDS,
  WINDOW_FIELDS,
  type FieldKey,
  type FieldSpec,
} from "./systemFields";
import { NAME_MAX } from "./systemFile";

/** The form's inputs, and the output of Δh beside each Δs. */
export interface SystemForm {
  nameInput: HTMLInputElement;
  inputs: Record<FieldKey, HTMLInputElement>;
  names: Record<keyof Components, HTMLInputElement>;
  auto: HTMLInputElement;
  enthalpies: { end: keyof Components; out: HTMLOutputElement }[];
  /** The *Add compound* box. */
  compound: HTMLInputElement;
  /** The Width control's two radio buttons. */
  widths: Record<Compound["width"], HTMLInputElement>;
  /** The Compound fieldset's legend, which names the Width's kind of compound. */
  compoundLegend: HTMLLegendElement;
}

/** The Compound fieldset's legend for a Width: a line compound is a daltonide. */
export function compoundLegendText(width: Compound["width"]): string {
  return `Intermediate Compound (${width === "line" ? "Daltonide" : "Berthollide"})`;
}

/** The Width control's choices, in order, with their labels. */
const WIDTHS: readonly { width: Compound["width"]; label: string; title: string }[] = [
  { width: "line", label: "Line", title: "A line compound, with no composition range" },
  { width: "range", label: "Range", title: "A compound with a composition range" },
];

let nextId = 0;

/** Fills `form` with `apply`, the file `actions`, the Name field and the four fieldsets. */
export function buildForm(
  form: HTMLFormElement,
  apply: HTMLButtonElement,
  actions: HTMLElement,
): SystemForm {
  // Apply, the two buttons and the name each take a row of their own above the Solutions
  // fieldset.
  const nameLabel = document.createElement("label");
  nameLabel.className = "name-row";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "field-input";
  nameInput.name = "name";
  nameInput.maxLength = NAME_MAX;
  nameInput.autocomplete = "off";
  nameInput.setAttribute("aria-label", "System name");
  const nameText = document.createElement("span");
  nameText.className = "field-name";
  nameText.textContent = "Name";
  nameLabel.append(nameText, nameInput);
  form.append(apply, actions, nameLabel);

  const inputs = recordOf(FIELD_KEYS, (key) => {
    const input = document.createElement("input");
    input.type = "number";
    input.className = "field-input";
    input.step = "any";
    input.inputMode = "decimal";
    input.name = key;
    return input;
  });
  const componentInput = (end: keyof Components) => {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "field-input";
    input.name = `name${end}`;
    input.maxLength = COMPONENT_NAME_MAX;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", `Components: name of component ${end}`);
    return input;
  };
  const names: Record<keyof Components, HTMLInputElement> = {
    A: componentInput("A"),
    B: componentInput("B"),
  };
  const enthalpies: SystemForm["enthalpies"] = [];
  const auto = document.createElement("input");
  auto.type = "checkbox";
  auto.setAttribute("aria-label", "Automatic window");

  const row = (nameHtml: string, input: HTMLElement, unit: string) => {
    const label = document.createElement("label");
    const name = document.createElement("span");
    name.className = "field-name";
    name.innerHTML = nameHtml;
    const units = document.createElement("span");
    units.className = "field-unit";
    units.textContent = unit;
    label.append(name, input, units);
    return label;
  };

  const numberRow = (legend: string, { key, html, unit, spoken }: FieldSpec) => {
    // The visible label runs the subscript into the name ("Tm,A"), so it is spelled out.
    inputs[key].setAttribute("aria-label", `${legend}: ${spoken}${unit ? ` (${unit})` : ""}`);
    return row(html, inputs[key], unit);
  };

  const fieldset = (legend: string, className = legend.toLowerCase()) => {
    const set = document.createElement("fieldset");
    set.className = className;
    const title = document.createElement("legend");
    title.textContent = legend;
    set.append(title);
    form.append(set);
    return { set, title };
  };

  const solutions = fieldset("Solutions");
  for (const spec of SOLUTION_FIELDS) solutions.set.append(numberRow("Solutions", spec));

  const components = fieldset("Components");
  for (const end of ["A", "B"] as const) components.set.append(row(`Name ${end}`, names[end], ""));
  for (const spec of COMPONENT_FIELDS) {
    components.set.append(numberRow("Components", spec));
    if (spec.key === "dsA" || spec.key === "dsB") {
      const end = spec.key === "dsA" ? "A" : "B";
      // Δh = T_m Δs, shown beside each Δs as it is typed.
      const derived = document.createElement("div");
      derived.className = "derived";
      const name = document.createElement("span");
      name.className = "field-name";
      name.innerHTML = `Δ<i>h</i><sub>${end}</sub>`;
      const out = document.createElement("output");
      out.setAttribute("aria-label", `Enthalpy of fusion of ${end}`);
      derived.append(name, out);
      components.set.append(derived);
      enthalpies.push({ end, out });
    }
  }

  // The compound (plan §9 phase 13): the box, X_c, Δh_f and Δs_f, the Width, then α_γ.
  // The legend follows the Width (systemPanel.ts sets it).
  const compoundSet = fieldset(compoundLegendText("line"), "compound");
  const compound = document.createElement("input");
  compound.type = "checkbox";
  compound.name = "compound";
  const compoundLabel = document.createElement("label");
  compoundLabel.className = "compound-box";
  compoundLabel.title = "Add an intermediate compound γ to the system";
  compoundLabel.append(compound, "Add compound");
  compoundSet.set.append(compoundLabel);
  const widthRow = document.createElement("div");
  widthRow.className = "width-row";
  const widthName = document.createElement("span");
  widthName.className = "field-name";
  widthName.id = `compound-width-${++nextId}`;
  widthName.textContent = "Width";
  const group = document.createElement("div");
  group.className = "segmented";
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-labelledby", widthName.id);
  const widths = {} as Record<Compound["width"], HTMLInputElement>;
  for (const { width, label, title } of WIDTHS) {
    const option = document.createElement("label");
    option.title = title;
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = `compoundWidth-${nextId}`;
    radio.value = width;
    radio.setAttribute("aria-label", `Compound width: ${label}`);
    const text = document.createElement("span");
    text.textContent = label;
    option.append(radio, text);
    group.append(option);
    widths[width] = radio;
  }
  widthRow.append(widthName, group);
  for (const spec of COMPOUND_FIELDS) {
    // The Width goes before α_γ, which only a range takes.
    if (spec.key === "alphaG") compoundSet.set.append(widthRow);
    compoundSet.set.append(numberRow("Compound", spec));
  }

  const windowSet = fieldset("Window");
  const autoLabel = document.createElement("label");
  autoLabel.className = "auto";
  autoLabel.title = "Fit the window to the system on Apply";
  autoLabel.append(auto, "auto");
  windowSet.title.append(" ", autoLabel);
  for (const spec of WINDOW_FIELDS) windowSet.set.append(numberRow("Window", spec));

  return {
    nameInput,
    inputs,
    names,
    auto,
    enthalpies,
    compound,
    widths,
    compoundLegend: compoundSet.title,
  };
}
