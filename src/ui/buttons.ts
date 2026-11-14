// The labelled icon buttons of the Parameters panel, the export row and the main row (Import,
// Export, TDB, Figure, Share), and the greying out of a control that the α mode does not use.

import { icon } from "./icons";

/** Gives `button` an icon and a text label; the label alone names it, the icon is hidden. */
export function setLabel(button: HTMLButtonElement, body: string, text: string): void {
  const label = document.createElement("span");
  label.textContent = text;
  button.innerHTML = icon(body, 16);
  button.append(label);
}

/** Logs a failure of an async listener, whose returned promise the browser drops. */
export function report(err: unknown): void {
  console.error("ThermoBRIDGE:", err);
}

/**
 * The tooltip of a control that the α mode greys out (plan §9 phase 16), on an element around it:
 * a disabled control gets no pointer events, so its own `title` does not show in every browser.
 */
export const NOT_IN_ALPHA = "Not used in the α mode";

/** Greys out `control` in the α mode, with NOT_IN_ALPHA on `wrapper` and `title` otherwise. */
export function greyInAlpha(
  control: HTMLButtonElement | HTMLSelectElement,
  wrapper: HTMLElement,
  title: string,
  alpha: boolean,
): void {
  control.disabled = alpha;
  control.title = alpha ? "" : title;
  wrapper.title = alpha ? NOT_IN_ALPHA : "";
}
