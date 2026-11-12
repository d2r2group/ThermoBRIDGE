// The Parameters panel in the side column (plan §2.2, §4 item 6, §8 row 16), adapted from
// pTerrain's ui/substancePanel.ts: the fields grouped as Solutions, Components, Compound and
// Window, the *Add compound* box and Width control, the *auto* box, Apply, the Name field, and the
// warning that lists the failed validity checks. The
// form is built in systemForm.ts; Import and Export (systemIO.ts) sit under Apply; Share is in
// share.ts and opening a link in link.ts. In the α mode (§9 phase 16) the panel shows the α mode's
// system, with every control but Export disabled.

import type { ValidityIssue } from "../physics/validity";
import { formatEnthalpy } from "./format";
import type { Components, State, Store } from "./state";
import {
  cleanComponent,
  compoundChoice,
  COMPOUND_FIELDS,
  FIELD_KEYS,
  prepareSystem,
  recordOf,
  systemFrom,
  systemValues,
  WINDOW_FIELDS,
  type CompoundChoice,
  type FieldKey,
} from "./systemFields";
import { cleanName, type SystemSpec } from "./systemFile";
import { buildForm, compoundLegendText } from "./systemForm";
import { createFileActions } from "./systemIO";

const WINDOW_KEYS: ReadonlySet<FieldKey> = new Set(WINDOW_FIELDS.map((f) => f.key));
const COMPOUND_KEYS: readonly FieldKey[] = COMPOUND_FIELDS.map((f) => f.key);

/** The compound's fields that a choice leaves unused: all without a compound, α_γ for a line. */
function unusedCompoundKeys({ on, width }: CompoundChoice): FieldKey[] {
  if (!on) return [...COMPOUND_KEYS];
  return width === "line" ? ["alphaG"] : [];
}

/** A field value for display, without rounding noise. */
function fieldText(x: number): string {
  return String(Number(x.toPrecision(12)));
}

/**
 * What the panel offers the System menu (opening it for edits, as Custom does) and a share link
 * (link.ts).
 */
export interface SystemPanel {
  /**
   * Opens the panel and focuses the α_l field without scrolling to it; with `intoView` (the panel
   * is under the plots, out of sight) the page scrolls the panel's top into view, smoothly unless
   * reduced motion is asked for.
   */
  open(intoView: boolean): void;
  /**
   * Fills the names, every field and the box with `system` and applies them with the cut reset;
   * returns whether they passed `validate`, and otherwise lists the issues.
   */
  importSystem(system: SystemSpec): boolean;
  /** A one-line warning, for a file or link that cannot be read; it changes nothing else. */
  warn(text: string): void;
}

/**
 * The Parameters panel (closed at first). The fields apply only through Apply (or Enter in a
 * field), which is enabled while they or the *auto* box differ from the applied system. Apply runs
 * `prepareSystem`, which checks the system (plan §2.2): if it fails, the fields keep what was
 * typed, a warning lists the failed checks and the plots keep the last valid system. While *auto*
 * is ticked the window fields are disabled and show the applied window, and Apply fits the window
 * with `fitWindow`. The compound's fields are disabled while *Add compound* is unticked, and α_γ
 * while the Width is Line. Every applied system, a preset included, refills the fields and so discards
 * edits not yet applied. The *Name* field is an edit like the others. Import, or a link, fills the
 * fields and applies them as Apply would, with the cut reset.
 */
export function createSystemPanel(container: HTMLElement, store: Store): SystemPanel {
  const root = document.createElement("section");
  root.className = "system";
  root.setAttribute("aria-label", "System parameters");

  const details = document.createElement("details");
  details.className = "parameters";
  const summary = document.createElement("summary");
  summary.textContent = "Parameters";
  summary.title = "Show or hide the system's parameters and the plot window, to edit them";
  const form = document.createElement("form");
  form.noValidate = true;
  const apply = document.createElement("button");
  apply.type = "submit";
  apply.className = "apply btn";
  apply.textContent = "Apply";
  apply.title = "Redraw the plots with the edited parameters";
  apply.disabled = true;
  // Import and Export side by side under Apply, together as wide as it.
  const actions = createFileActions(
    store,
    (system) => importSystem(system),
    (text) => warn(text),
  );

  const { nameInput, inputs, names, auto, enthalpies, compound, widths, compoundLegend } =
    buildForm(form, apply, actions);

  details.append(summary, form);
  const warning = document.createElement("div");
  warning.className = "validation";
  warning.setAttribute("role", "alert");
  root.append(details, warning);
  container.append(root);

  /** What each field was last filled with, and the exact value that text stands for. */
  const filled = new Map<FieldKey, { text: string; value: number }>();
  const show = (key: FieldKey, value: number) => {
    const text = fieldText(value);
    inputs[key].value = text;
    filled.set(key, { text, value });
  };
  /** A field's value: the exact filled value while it is not edited, else what was typed. */
  const valueOf = (key: FieldKey) => {
    const last = filled.get(key);
    if (last && inputs[key].value === last.text) return last.value;
    return inputs[key].valueAsNumber;
  };
  const read = () => recordOf(FIELD_KEYS, valueOf);
  const readChoice = (): CompoundChoice => ({
    on: compound.checked,
    width: widths.range.checked ? "range" : "line",
  });
  /** The fields that are never blamed: the window's under *auto*, and the unused compound's. */
  const exempt = (): ReadonlySet<FieldKey> =>
    new Set([...(auto.checked ? WINDOW_KEYS : []), ...unusedCompoundKeys(readChoice())]);
  const readNames = (): Components => ({
    A: cleanComponent(names.A.value, "A"),
    B: cleanComponent(names.B.value, "B"),
  });

  const showEnthalpies = () => {
    const v = read();
    for (const { end, out } of enthalpies) {
      out.value = end === "A" ? formatEnthalpy(v.TmA, v.dsA) : formatEnthalpy(v.TmB, v.dsB);
    }
  };

  /** Marks the fields to blame and lists the issues; the `exempt()` fields are never blamed. */
  const showIssues = (issues: readonly ValidityIssue[], values: Record<FieldKey, number>) => {
    const bad = new Set(issues.flatMap((issue) => issue.fields));
    const spared = exempt();
    for (const key of FIELD_KEYS) {
      const invalid = !spared.has(key) && (bad.has(key) || !Number.isFinite(values[key]));
      inputs[key].toggleAttribute("aria-invalid", invalid && issues.length > 0);
    }
    if (issues.length === 0) {
      warning.replaceChildren();
      return;
    }
    const intro = document.createElement("p");
    intro.textContent = "These parameters are not applied, so the plots show the last valid ones:";
    const list = document.createElement("ul");
    list.append(
      ...issues.map(({ check, message }) => {
        const item = document.createElement("li");
        item.dataset.check = check;
        item.textContent = message;
        return item;
      }),
    );
    warning.replaceChildren(intro, list);
  };

  /** Ticks or unticks *auto*: the window fields are disabled while it is ticked. */
  const setAuto = (on: boolean) => {
    auto.checked = on;
    const values = systemValues(store.state.params, store.state.window);
    for (const key of WINDOW_KEYS) {
      inputs[key].disabled = on;
      inputs[key].removeAttribute("aria-invalid");
      if (on) show(key, values[key]);
    }
  };

  /**
   * Ticks or unticks *Add compound* and sets the Width: the compound's fields are disabled while
   * the box is unticked, and α_γ while the Width is Line. The legend names the Width's kind.
   */
  const setChoice = (choice: CompoundChoice) => {
    compound.checked = choice.on;
    widths[choice.width].checked = true;
    compoundLegend.textContent = compoundLegendText(choice.width);
    for (const radio of Object.values(widths)) radio.disabled = !choice.on;
    const unused = new Set(unusedCompoundKeys(choice));
    for (const key of COMPOUND_KEYS) {
      inputs[key].disabled = unused.has(key);
      if (unused.has(key)) inputs[key].removeAttribute("aria-invalid");
    }
  };

  /** Fills every field and the boxes with the applied system, discarding unapplied edits. */
  const fill = (state: Readonly<State>) => {
    const values = systemValues(state.params, state.window);
    for (const key of FIELD_KEYS) show(key, values[key]);
    nameInput.value = state.name;
    names.A.value = state.components.A;
    names.B.value = state.components.B;
    setAuto(state.auto);
    setChoice(compoundChoice(state.params));
    showIssues([], values);
    showEnthalpies();
    apply.disabled = true;
  };

  /**
   * Enables Apply while the fields, the names or the box differ from the applied system. Once
   * they match it again, the warning of a failed Apply no longer holds.
   */
  const syncApply = () => {
    const values = read();
    const { name, params, window, components, auto: appliedAuto } = store.state;
    const now = systemValues(params, window);
    const typed = readNames();
    const choice = readChoice();
    const applied = compoundChoice(params);
    const unused = new Set(unusedCompoundKeys(choice));
    apply.disabled =
      auto.checked === appliedAuto &&
      choice.on === applied.on &&
      choice.width === applied.width &&
      nameInput.value === name &&
      typed.A === components.A &&
      typed.B === components.B &&
      // A field the compound does not use is not an edit.
      FIELD_KEYS.every((key) => values[key] === now[key] || unused.has(key));
    if (apply.disabled) showIssues([], values);
  };

  form.addEventListener("input", () => {
    showEnthalpies();
    syncApply();
  });
  auto.addEventListener("change", () => {
    setAuto(auto.checked);
    syncApply();
  });
  for (const control of [compound, ...Object.values(widths)]) {
    control.addEventListener("change", () => {
      setChoice(readChoice());
      syncApply();
    });
  }

  /**
   * Applies the fields, the names and the box, as Apply does; with `resetCut` (an import) the cut
   * goes to the middle of the window, as for a menu choice. Returns whether they passed `validate`.
   */
  const applyFields = (resetCut: boolean) => {
    const values = read();
    const { params, window: typed } = systemFrom(values, readChoice());
    const prepared = prepareSystem(params, typed, auto.checked);
    const { window } = prepared;
    if (prepared.ok) {
      const components = readNames();
      const name = cleanName(nameInput.value, { params, window, components });
      const options = { name, components, auto: auto.checked, resetCut, scan: prepared.scan };
      store.setSystem({ params, window }, options);
      return true;
    }
    // A fitted window that fails is the rule's doing, not a window field's; the disabled window
    // fields show it, so that the warning is about what they show.
    if (prepared.fitted) for (const key of ["Tmin", "Tmax"] as const) show(key, window[key]);
    showIssues(prepared.issues, values);
    return false;
  };

  // Apply, or Enter in a field, applies the fields instead of reloading the page.
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    applyFields(false);
  });

  /** Fills the names, every field and the box with `system`, and applies them with the cut reset. */
  const importSystem = ({ name, components, params, window, auto: on }: SystemSpec) => {
    nameInput.value = name;
    names.A.value = components.A;
    names.B.value = components.B;
    const values = systemValues(params, window);
    for (const key of FIELD_KEYS) show(key, values[key]);
    auto.checked = on;
    for (const key of WINDOW_KEYS) inputs[key].disabled = on;
    setChoice(compoundChoice(params));
    showEnthalpies();
    const ok = applyFields(true);
    if (!ok) apply.disabled = false;
    return ok;
  };

  /** A one-line warning, for a file or link that cannot be read; it changes nothing else. */
  const warn = (text: string) => {
    const line = document.createElement("p");
    line.textContent = text;
    warning.replaceChildren(line);
  };

  /**
   * In the α mode, disables every control of the form but Export, which writes the current
   * system. `fill` sets the controls' own disabled states again afterwards.
   */
  const lock = (alpha: boolean) => {
    for (const control of form.elements) {
      if (!(control instanceof HTMLInputElement || control instanceof HTMLButtonElement)) continue;
      if (!control.classList.contains("export")) control.disabled = alpha;
    }
  };
  const refill = (state: Readonly<State>) => {
    lock(state.mode === "alpha");
    fill(state);
    if (state.mode === "alpha") lock(true);
  };

  refill(store.state);
  store.subscribe((state, prev) => {
    if (
      state.diagram !== prev.diagram ||
      state.components !== prev.components ||
      state.mode !== prev.mode
    )
      refill(state);
  });

  return {
    open(intoView) {
      details.open = true;
      if (intoView) {
        const smooth = !matchMedia("(prefers-reduced-motion: reduce)").matches;
        details.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
      }
      inputs.alphaL.focus({ preventScroll: true });
    },
    importSystem,
    warn,
  };
}
