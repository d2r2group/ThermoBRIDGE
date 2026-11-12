// The mode toggle right of the info button (plan §9 phase 16): "Δg^M | α", two radio buttons drawn
// as one segmented control, as the Parameters panel's Width control is, the selected half filled
// with --selected. It also marks the page with the mode (`#app[data-mode]`), which the styles use
// to hide what the α mode does not use.

import type { Mode, Store } from "./state";

/** The two halves, in order: the visible label (HTML), the spoken name and the tooltip. */
const MODES: readonly { mode: Mode; html: string; name: string; title: string }[] = [
  {
    mode: "dg",
    html: "Δ<i>g</i><sup><i>M</i></sup>",
    name: "Delta g M",
    title: "Move a cut through one system, with its Gibbs energy curves below",
  },
  {
    mode: "alpha",
    html: "<i>α</i>",
    name: "Alpha",
    title: "Move through the systems by their interaction parameters α",
  },
];

let nextId = 0;

/** Appends the toggle to `header` and marks `app` with the mode. */
export function createModeToggle(header: HTMLElement, app: HTMLElement, store: Store): void {
  const group = document.createElement("div");
  group.className = "mode-toggle";
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", "Mode");
  const groupName = `mode-${++nextId}`;
  const radios = MODES.map(({ mode, html, name, title }) => {
    const option = document.createElement("label");
    option.title = title;
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = groupName;
    radio.value = mode;
    radio.setAttribute("aria-label", name);
    radio.addEventListener("change", () => {
      if (radio.checked) store.setMode(mode);
    });
    const text = document.createElement("span");
    text.innerHTML = html;
    text.setAttribute("aria-hidden", "true");
    option.append(radio, text);
    group.append(option);
    return radio;
  });
  header.append(group);

  const sync = () => {
    const { mode } = store.state;
    for (const radio of radios) radio.checked = radio.value === mode;
    app.dataset.mode = mode;
  };
  sync();
  store.subscribe((state, prev) => {
    if (state.mode !== prev.mode) sync();
  });
}
