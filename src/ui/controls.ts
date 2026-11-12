// The controls (plan §4 items 4–6), adapted from pTerrain's ui/controls.ts. The main row's
// Metastable and Labels buttons; in the side column the slider and number field for T*, as a
// fallback for dragging and for keyboard users, and the readout for screen readers, with the lever
// rule's line while it is on. The System menu is in systemMenu.ts, the Parameters panel in
// systemPanel.ts, Share in share.ts, the Lever toggle and readout in leverControls.ts, and the
// logo's snap to the next invariant in logo.ts. In the α mode (§9 phase 16) the readout lists the
// system's invariants instead of the fields along the cut.

import { invariantsOf } from "../physics/events";
import { nameField, type NamedField } from "../physics/fields";
import { spokenName } from "./compoundText";
import { formatComposition, formatTemperature } from "./format";
import { EYE, EYE_OFF, icon } from "./icons";
import { leverOf, leverSentence } from "./leverText";
import { invariantText } from "./logo";
import { labelsWait, type State, type Store } from "./state";

/** The slider and number field that set T*. */
export function createCutInput(container: HTMLElement, store: Store): void {
  const root = document.createElement("div");
  root.className = "cut-input";
  const label = document.createElement("label");
  const symbol = document.createElement("i");
  symbol.textContent = "T";
  label.append(symbol, "* (K)");
  const range = document.createElement("input");
  range.type = "range";
  range.step = "any";
  range.id = uniqueId("cut-range");
  range.setAttribute("aria-label", "Cut temperature T* (K)");
  label.htmlFor = range.id;
  const number = document.createElement("input");
  number.type = "number";
  number.className = "field-input";
  number.step = "any";
  number.inputMode = "decimal";
  number.setAttribute("aria-label", "Cut temperature T* (K), typed value");
  root.append(label, range, number);
  container.append(root);

  range.addEventListener("input", () => store.setCut(range.valueAsNumber));
  // A value that is not a number leaves the cut where it was and shows it again; one outside the
  // window shows where it was clamped to. Otherwise the field keeps what was typed.
  number.addEventListener("change", () => {
    const raw = number.value;
    const typed = number.valueAsNumber;
    store.setCut(typed);
    const { cut } = store.state;
    number.value = cut === typed ? raw : cut.toFixed(1);
  });

  const sync = () => {
    const { window, cut } = store.state;
    range.min = String(window.Tmin);
    range.max = String(window.Tmax);
    range.value = String(cut);
    range.setAttribute("aria-valuetext", formatTemperature(cut));
    number.min = String(window.Tmin);
    number.max = String(window.Tmax);
    if (document.activeElement !== number) number.value = cut.toFixed(1);
  };
  sync();
  store.subscribe(sync);
}

/** The readout's heading: where the cut is, and that the positions are mole fractions of B. */
export function readoutHeading(state: Readonly<State>): string {
  return `Fields along the cut at ${formatTemperature(state.cut)}, by mole fraction of ${state.components.B}`;
}

/**
 * The Metastable toggle button (plan §4 item 5), which shows or hides the metastable lines, with
 * an open eye while they are shown and a closed one while they are hidden.
 */
export function createMetastableToggle(container: HTMLElement, store: Store): void {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "metastable-toggle btn";
  const eye = document.createElement("span");
  eye.className = "eye";
  // The label is hidden on a phone, where the eye alone fits, so the name is set on the button too.
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = "Metastable";
  button.append(eye, label);
  button.setAttribute("aria-label", label.textContent);
  button.title = "Show or hide the metastable extensions, the spinodals and the unstable curves";
  button.addEventListener("click", () => store.setShowMetastable(!store.state.showMetastable));
  container.append(button);

  const sync = () => {
    const shown = store.state.showMetastable;
    button.setAttribute("aria-pressed", String(shown));
    eye.innerHTML = icon(shown ? EYE : EYE_OFF);
  };
  sync();
  store.subscribe(sync);
}

/** The Labels button's name for what it shows: "field names", "…and point names", "none". */
export function labelsShown({ showFieldLabels, showPointLabels }: Readonly<State>): string {
  const shown = [
    ...(showFieldLabels ? ["field names"] : []),
    ...(showPointLabels ? ["point names"] : []),
  ];
  return shown.length ? shown.join(" and ") : "none";
}

/**
 * The Labels button, which cycles through the diagram's labels (`Store.cycleLabels`): its top
 * half, "L+β", stands for the field names and its bottom half, a triangle, for the marked points'
 * names ("Eutectic, 634 K"); each half is filled while its labels are shown.
 */
export function createLabelsToggle(container: HTMLElement, store: Store): void {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "labels-toggle btn";
  const fields = document.createElement("span");
  fields.className = "half fields";
  // "L+β" is drawn by CSS (header.css) as an icon, so that the button's name, which says what it
  // shows, is its only text.
  const points = document.createElement("span");
  points.className = "half points";
  points.innerHTML =
    '<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">' +
    '<path d="M5 1.5 9 8.5H1Z" fill="currentColor"/></svg>';
  button.append(fields, points);
  button.addEventListener("click", () => store.cycleLabels());
  container.append(button);

  const sync = () => {
    const state = store.state;
    button.dataset.fields = String(state.showFieldLabels);
    button.dataset.points = String(state.showPointLabels);
    const shown = labelsShown(state);
    button.setAttribute("aria-label", `Labels: ${shown}`);
    button.title =
      `Labels on the diagram: ${shown}. Click for field names, then also the points' names ` +
      "and temperatures, then none";
  };
  sync();
  store.subscribe(sync);
}

/** One row of the readout: a field along the cut, from X_B `from` to `to`. */
export interface ReadoutRow {
  name: string;
  kind: NamedField["kind"];
  from: number;
  to: number;
  /** "0 to 0.081: α". */
  text: string;
}

/** The fields along the cut, left to right, named as on the diagram (plan §4 item 4). */
export function readoutRows(state: Readonly<State>): ReadoutRow[] {
  const naming = state.diagram.naming;
  return state.atCut.map((f) => {
    const named = nameField(naming, f);
    const [from, to] = named.kind === "single" ? named.X : [named.ends[0].X, named.ends[1].X];
    // A line compound's field has no width.
    const where =
      from === to
        ? `at ${formatComposition(from)}`
        : `${formatComposition(from)} to ${formatComposition(to)}`;
    return {
      name: named.name,
      kind: named.kind,
      from,
      to,
      text: `${where}: ${spokenName(named.name, naming.compound)}`,
    };
  });
}

/**
 * What the α mode's readout says (plan §9 phase 16): the system's invariants, by the names the
 * logo's tooltip uses ("eutectic, 634 K"), or that it has none.
 */
export function invariantsReadout(state: Readonly<State>): string {
  const invariants = invariantsOf(state.diagram.scan.events);
  if (invariants.length === 0) return "This system has no invariant.";
  return `Invariants: ${invariants.map(invariantText).join("; ")}.`;
}

/**
 * The fields along the cut, for screen readers only (plan §4 item 4): on screen the bold values
 * under the diagram's X axis show them, and those are `aria-hidden`. In the α mode, the system's
 * invariants in its place, in a polite live region, once each full diagram is on screen (a
 * preview, §9 phase 15, is skipped).
 */
export function createReadout(container: HTMLElement, store: Store): void {
  const root = document.createElement("section");
  root.className = "readout visually-hidden";
  root.setAttribute("aria-label", "Readout");
  const heading = document.createElement("p");
  heading.className = "readout-heading";
  const list = document.createElement("ul");
  list.className = "fields";
  // The lever rule's line (plan §4 item 7), while it is on.
  const leverLine = document.createElement("p");
  leverLine.className = "readout-lever";
  // Always in the page, so that a change of its text is announced.
  const invariants = document.createElement("p");
  invariants.className = "readout-invariants";
  invariants.setAttribute("aria-live", "polite");
  root.append(heading, list, leverLine, invariants);
  container.append(root);

  const syncInvariants = () => {
    const state = store.state;
    if (state.mode === "dg") invariants.textContent = "";
    else if (!labelsWait(state)) invariants.textContent = invariantsReadout(state);
  };

  const sync = () => {
    const state = store.state;
    const alpha = state.mode === "alpha";
    heading.hidden = alpha;
    list.hidden = alpha;
    heading.textContent = readoutHeading(state);
    list.replaceChildren(
      ...readoutRows(state).map((row) => {
        const item = document.createElement("li");
        item.dataset.kind = row.kind;
        item.textContent = row.text;
        return item;
      }),
    );
    leverLine.hidden = !state.showLever;
    leverLine.textContent = state.showLever
      ? spokenName(leverSentence(leverOf(state)), state.diagram.naming.compound)
      : "";
  };
  sync();
  syncInvariants();
  store.subscribe((state, prev) => {
    if (
      state.atCut !== prev.atCut ||
      state.cut !== prev.cut ||
      state.components !== prev.components ||
      state.showLever !== prev.showLever ||
      state.X0 !== prev.X0 ||
      state.mode !== prev.mode
    )
      sync();
    if (
      state.diagram !== prev.diagram ||
      state.mode !== prev.mode ||
      state.alphaMoving !== prev.alphaMoving
    )
      syncInvariants();
  });
}

let nextId = 0;
function uniqueId(prefix: string): string {
  return `${prefix}-${++nextId}`;
}
