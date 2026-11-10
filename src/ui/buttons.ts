// The labelled icon buttons of the Parameters panel and the main row (Import, Export, Share).

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
