// The lever rule's controls (plan §4 items 5–7): the Lever toggle in the main row and the readout
// in the side column with X₀'s slider and number field. The diagram's lever layer
// (diagram/leverLayer.ts) draws the knob and the tie line, and the slice panel the mixture's point.

import { appendHtmlName } from "./compoundText";
import { BALANCE, icon } from "./icons";
import { leverOf, leverRows } from "./leverText";
import type { Store } from "./state";

/** The Lever toggle button of the main row (plan §4 item 5), with a balance and "Lever". */
export function createLeverToggle(container: HTMLElement, store: Store): void {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "lever-toggle btn";
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = "Lever";
  button.innerHTML = icon(BALANCE);
  button.append(label);
  // The label is hidden on a phone, where the icon alone fits, so the name is set on the button.
  button.setAttribute("aria-label", "Lever rule");
  button.title = "Show or hide the lever rule at an overall composition on the cut";
  button.addEventListener("click", () => store.setShowLever(!store.state.showLever));
  container.append(button);

  const sync = () => button.setAttribute("aria-pressed", String(store.state.showLever));
  sync();
  store.subscribe(sync);
}

/** Appends "X" with a subscript `sub` in italic to `parent`, as the axis labels write it. */
function appendX(parent: HTMLElement, sub: string): void {
  const x = document.createElement("i");
  x.textContent = "X";
  const s = document.createElement("sub");
  s.textContent = sub;
  parent.append(x, s);
}

let nextId = 0;

/**
 * The lever readout in the side column (plan §4 item 6), shown while the lever rule is on: X₀ with
 * a slider and number field as T* has (controls.ts), and the phases with their compositions and
 * shares.
 */
export function createLeverReadout(container: HTMLElement, store: Store): void {
  const root = document.createElement("section");
  root.className = "lever-readout";
  root.setAttribute("aria-label", "Lever rule");
  const input = document.createElement("div");
  input.className = "x0-input";
  const label = document.createElement("label");
  appendX(label, "0");
  const range = document.createElement("input");
  range.type = "range";
  range.min = "0";
  range.max = "1";
  range.step = "any";
  range.id = `x0-range-${++nextId}`;
  range.setAttribute("aria-label", "Overall composition X₀, mole fraction of B");
  label.htmlFor = range.id;
  const number = document.createElement("input");
  number.type = "number";
  number.className = "field-input";
  number.min = "0";
  number.max = "1";
  number.step = "0.001";
  number.inputMode = "decimal";
  number.setAttribute("aria-label", "Overall composition X₀, mole fraction of B, typed value");
  input.append(label, range, number);
  const list = document.createElement("ul");
  list.className = "lever-phases";
  const note = document.createElement("p");
  note.className = "lever-note";
  note.textContent = "At the invariant the fractions are not fixed.";
  root.append(input, list, note);
  container.append(root);

  range.addEventListener("input", () => store.setX0(range.valueAsNumber));
  // As the cut's field: a value that is not a number is shown back as X₀, one outside [0, 1] as
  // where it was clamped to.
  number.addEventListener("change", () => {
    const raw = number.value;
    const typed = number.valueAsNumber;
    store.setX0(typed);
    const { X0 } = store.state;
    number.value = X0 === typed ? raw : X0.toFixed(3);
  });

  const sync = () => {
    const state = store.state;
    root.hidden = !state.showLever;
    if (!state.showLever) return;
    range.value = String(state.X0);
    range.setAttribute("aria-valuetext", state.X0.toFixed(3));
    if (document.activeElement !== number) number.value = state.X0.toFixed(3);
    const l = leverOf(state);
    list.replaceChildren(
      ...leverRows(l).map((row) => {
        const item = document.createElement("li");
        const name = document.createElement("span");
        name.className = "lever-phase";
        appendHtmlName(name, row.name, state.diagram.naming.compound);
        item.append(name);
        if (l.kind !== "single") {
          item.append(", ");
          appendX(item, "B");
          item.append(` = ${row.X}`);
        }
        if (row.share !== null) item.append(`: ${row.share}`);
        return item;
      }),
    );
    note.hidden = l.kind !== "invariant";
  };
  sync();
  store.subscribe((state, prev) => {
    if (
      state.showLever !== prev.showLever ||
      state.X0 !== prev.X0 ||
      state.atCut !== prev.atCut ||
      state.diagram !== prev.diagram
    )
      sync();
  });
}
