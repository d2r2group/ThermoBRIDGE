// Adapted from pTerrain's ui/about.ts, with ThermoBRIDGE's controls.
//
// The info button right of the logo, and the About overlay it opens: what the app does, then each
// control as it looks on the page, beside what it does. The controls are copied from the page
// each time the overlay opens, so they show its current state, and removed when it closes. The
// copies are inert, so they can be neither clicked nor focused, and screen readers get their
// names instead.

import { HANDLE_GRIP, icon, INFO, MOON, SUN } from "./icons";
import { BRIDGE_MEANING } from "./logo";
import { createOverlay } from "./overlay";

/**
 * A control to explain: where it is on the page, and the class it needs around it to be styled
 * as there.
 */
interface Key {
  selector: string;
  context: string;
  name: string;
  text: string;
}

const SECTIONS: readonly { heading: string; keys: readonly Key[] }[] = [
  {
    heading: "Above the plots",
    keys: [
      {
        selector: "header .logo button",
        context: "logo",
        name: "Logo",
        text:
          "Snaps the cut to the next stable invariant above it (a eutectic, peritectic, " +
          "monotectic or syntectic, and with a compound a eutectoid, peritectoid, monotectoid " +
          "or metatectic), wrapping round to the lowest.",
      },
      {
        selector: "header .mode-toggle",
        context: "",
        name: "Mode",
        text:
          "Switches between the Δ<i>g</i><sup><i>M</i></sup> mode, a cut through one system " +
          "with its Gibbs energy curves below, and the <i>α</i> mode, which moves through the " +
          "systems by their interaction parameters on a pad below the diagram. The System menu, " +
          "Lever and the Parameters panel's fields are greyed out in the <i>α</i> mode.",
      },
      {
        selector: ".main-row .system-menu",
        context: "main-row",
        name: "System menu",
        text:
          "Chooses a preset system, grouped by how the liquid and solid mix or by an " +
          "intermediate compound, or Custom, to edit in Parameters.",
      },
      {
        selector: ".main-row .lever-toggle",
        context: "main-row",
        name: "Lever",
        text:
          "Shows or hides a knob at the overall composition <i>X</i>₀ on the cut, with the tie " +
          "line through it and the share of each phase.",
      },
      {
        selector: ".main-row .metastable-toggle",
        context: "main-row",
        name: "Metastable",
        text:
          "Shows or hides the dashed metastable extensions, the dotted spinodals and, in the " +
          "slice, the curves off the envelope.",
      },
      {
        selector: ".main-row .labels-toggle",
        context: "main-row",
        name: "Labels",
        text:
          "Steps through the diagram's labels: the field names (the top half, filled), then " +
          "also each marker's name and temperature, such as “Eutectic, 634 K” (the bottom " +
          "half), then those names alone, then none. It opens on the field names alone.",
      },
      {
        selector: ".main-row .share",
        context: "main-row",
        name: "Share",
        text:
          "Copies a link (on a phone, opens the share menu) that restores the system, the cut " +
          "and, with the lever rule on, <i>X</i>₀; in the <i>α</i> mode, the system and " +
          "<i>Stay on the axes</i>, opening in the <i>α</i> mode.",
      },
      {
        selector: "header .theme-toggle",
        context: "",
        name: "Theme",
        text: "Switches between the light and dark theme.",
      },
    ],
  },
  {
    heading: "Below the diagram, in the α mode",
    keys: [
      {
        selector: ".alpha-pad",
        context: "",
        name: "α pad",
        text:
          "Drag the knob, or press anywhere on the pad, to choose <i>α</i><sub>s</sub> " +
          "(across) and <i>α</i><sub>l</sub> (up), from −30 to +30 kJ/mol; the diagram " +
          "follows. The open dots are the grid presets. The arrow keys move the knob by 1 " +
          "kJ/mol, by 5 with Shift, and Home moves it to the centre.",
      },
      {
        selector: ".alpha-lock",
        context: "",
        name: "Stay on the axes",
        text:
          "Keeps the knob on the two axes, so that one <i>α</i> changes at a time; it passes " +
          "through the centre to change axis. Unticked, as it opens, the knob changes both at once.",
      },
      {
        selector: ".tmb-input",
        context: "",
        name: "T_m,B slider",
        text:
          "Sets the melting point of B, from 805 to 2400 K; A's stays at 800 K. Far above " +
          "A's, it turns eutectics into peritectics. The " +
          "values are also in number fields: right of the slider, where they fit, until a compound " +
          "is added, else beside the plots, or below them on a phone.",
      },
      {
        selector: ".alpha-add-compound",
        context: "",
        name: "Line Compound",
        text:
          "Adds a line compound, which brings its reactions into the diagram. A compound with " +
          "a range is not used in the <i>α</i> mode.",
      },
      {
        selector: ".alpha-compound",
        context: "",
        name: "Compound sliders",
        text:
          "With <i>Line Compound</i> ticked, set the compound's <i>X</i><sub>c</sub>, on " +
          "eleven stops from A₉B to AB₉, Δ<i>h</i><sub>f</sub> and Δ<i>s</i><sub>f</sub>; " +
          "they lie flat in a narrow window, and on a phone stand in the pad's place. " +
          "Δ<i>h</i><sub>f</sub> gives congruent and incongruent " +
          "melting, Δ<i>s</i><sub>f</sub> adds the eutectoid and peritectoid, and " +
          "<i>X</i><sub>c</sub> away from AB the metatectic and monotectoid.",
      },
      {
        selector: ".alpha-view",
        context: "",
        name: "Pad or sliders",
        text:
          "On a phone, with <i>Line Compound</i> ticked, shows the <i>α</i> pad or the " +
          "compound's sliders, named by its formula, in the pad's place. Ticking " +
          "<i>Line Compound</i> shows the sliders.",
      },
    ],
  },
  {
    heading: "Beside the plots, or below them on a phone",
    keys: [
      {
        selector: ".export-row",
        context: "",
        name: "TDB and Figure",
        text:
          "Save a ZIP with the system's JSON file and, from TDB, the system as a CALPHAD " +
          "database or, from Figure, the plots as SVG or PNG images: both plots together and " +
          "each on its own, in the light theme. In the <i>α</i> mode they export the system as " +
          "the Δ<i>g</i><sup>M</sup> mode would show it. With <i>Series of cuts</i> ticked in " +
          "Figure's menu, the images are saved at each distinct cut, from high to low " +
          "<i>T</i>: one in each band of the same phases, at its middle, and one at each invariant.",
      },
      {
        selector: ".parameters summary",
        context: "parameters",
        name: "Parameters",
        text: "Shows or hides the system's parameters and the plot window, to edit them.",
      },
      {
        selector: ".parameters .compound-box",
        context: "parameters",
        name: "Add compound",
        text:
          "In the Intermediate Compound fieldset, adds a compound at <i>X</i><sub>c</sub>, " +
          "formed from the pure solids with Δ<i>h</i><sub>f</sub> and Δ<i>s</i><sub>f</sub>: " +
          "a line compound or daltonide (Width Line) or a berthollide with a composition " +
          "range (Range), whose <i>α</i><sub>γ</sub> &lt; 0 sets how narrow it is. It takes " +
          "effect with Apply.",
      },
      {
        selector: ".parameters .apply",
        context: "parameters",
        name: "Apply",
        text:
          "Checks the edited parameters and redraws the plots (or press Enter); a failed check " +
          "is listed and nothing changes. With <i>auto</i> ticked, the window is fitted.",
      },
      {
        selector: ".parameters .file-actions",
        context: "parameters",
        name: "Import and Export",
        text: "Loads a system from a JSON file, or saves the applied one as one.",
      },
    ],
  },
  {
    heading: "At the bottom",
    keys: [
      {
        selector: ".model-details-button",
        context: "",
        name: "Model Details",
        text: "Opens how the model works: its equations, the preset data and its limits.",
      },
    ],
  },
];

/** The overlay's body: the summary, then one list of controls for each part of the page. */
export function aboutHtml(): string {
  const sections = SECTIONS.map(
    ({ heading, keys }) =>
      `<section><h3>${heading}</h3><dl>` +
      keys
        .map(
          ({ selector, context, name, text }) =>
            `<dt><span class="visually-hidden">${name}</span>` +
            `<div class="about-key" data-selector="${selector}" data-context="${context}"` +
            ' inert aria-hidden="true"></div></dt>' +
            `<dd>${text}</dd>`,
        )
        .join("") +
      "</dl></section>",
  ).join("");
  // The capitals that spell "BRIDGE" in bold.
  const meaning = BRIDGE_MEANING.replace(/\b[A-Z]/g, "<b>$&</b>");
  return `
<p>ThermoBRIDGE (${meaning}) draws the temperature–composition phase diagram of a
binary system A–B from the molar Gibbs free energies <i>g</i><sub>l</sub>(<i>X</i>, <i>T</i>) and
<i>g</i><sub>s</sub>(<i>X</i>, <i>T</i>) of two regular solutions, a liquid and a solid, and
optionally of an intermediate compound. Below it,
the slice plots both curves at the cut's temperature <i>T</i>*, with the common tangents of their
lower envelope: each two-phase field the cut crosses is a tangent there, touching the curves at
the compositions of its two phases.</p>
<ul>
  <li>Drag the <svg class="about-handle" viewBox="-12 -12 24 24" aria-hidden="true"><circle
    r="11"/><path d="${HANDLE_GRIP}"/></svg><span class="visually-hidden">circle with up and down
    arrows</span> in the upper plot to change the cut shown in the lower plot.</li>
  <li>Use one of the preset systems, or edit your own.</li>
  <li>Read the phases' shares with the lever rule, or show the metastable lines.</li>
  <li>Find the invariants by their markers, ▼ and ▲ coloured by kind; hover one for its name,
    and see Model Details for the key.</li>
  <li>Switch to the <i>α</i> mode to move through the systems on a pad of
    <i>α</i><sub>s</sub> and <i>α</i><sub>l</sub>.</li>
  <li>Save a system as a file, or share a link to it.</li>
</ul>
${sections}`;
}

/**
 * Fills each key with a copy of its control on the page, without the ids, tooltips and disabled
 * states of the original, so that it looks as the control does in use.
 */
function fillKeys(body: HTMLElement): void {
  for (const key of body.querySelectorAll<HTMLElement>(".about-key")) {
    const control = document.querySelector(key.dataset.selector!);
    if (!control)
      throw new Error(`ThermoBRIDGE: the About overlay found no ${key.dataset.selector}`);
    const copy = control.cloneNode(true) as Element;
    const originals = [control, ...control.querySelectorAll("*")];
    [copy, ...copy.querySelectorAll("*")].forEach((el, k) => {
      // Without its name, a radio's copy would join the page's group and uncheck the original.
      for (const attribute of ["id", "for", "name", "title", "disabled"]) {
        el.removeAttribute(attribute);
      }
      // A clone keeps the markup's choice, not the one made since.
      const original = originals[k];
      if (el instanceof HTMLSelectElement) el.value = (original as HTMLSelectElement).value;
      if (el instanceof HTMLInputElement) el.checked = (original as HTMLInputElement).checked;
    });
    copy.querySelectorAll('input[type="file"]').forEach((el) => el.remove());
    // The compound's sliders are hidden until *Line Compound* is ticked; their copy is shown.
    if (copy instanceof HTMLElement) copy.hidden = false;
    // The pad's copy is drawn at the key's size: a viewBox of the pad's own.
    const padSvg = copy.matches(".alpha-pad") ? copy.querySelector("svg") : null;
    if (padSvg) {
      const side = padSvg.getAttribute("width") ?? "0";
      padSvg.setAttribute("viewBox", `0 0 ${side} ${side}`);
      for (const attribute of ["width", "height"]) padSvg.removeAttribute(attribute);
    }
    key.replaceChildren(copy);
    // The theme button shows one symbol at a time; its key shows both, moon / sun.
    if (copy.classList.contains("theme-toggle")) {
      const other = copy.cloneNode() as Element;
      copy.innerHTML = icon(MOON);
      other.innerHTML = icon(SUN);
      const slash = document.createElement("span");
      slash.className = "about-slash";
      slash.textContent = "/";
      key.append(slash, other);
    }
    if (key.dataset.context) key.classList.add(key.dataset.context);
  }
}

/** Empties the keys again, so that the page holds each control and its classes only once. */
function emptyKeys(body: HTMLElement): void {
  for (const key of body.querySelectorAll<HTMLElement>(".about-key")) {
    key.replaceChildren();
    key.className = "about-key";
  }
}

/** The info button, appended to `header`, and the About overlay, appended to `container`. */
export function createAbout(header: HTMLElement, container: HTMLElement): void {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "info-button icon-button";
  button.innerHTML = icon(INFO, 22);
  button.setAttribute("aria-label", "About");
  button.title = "What ThermoBRIDGE does, and what each of its buttons is for";
  header.append(button);
  const dialog = createOverlay(
    container,
    button,
    "about",
    "About ThermoBRIDGE",
    aboutHtml(),
    fillKeys,
  );
  dialog.addEventListener("close", () => emptyKeys(dialog));
}
