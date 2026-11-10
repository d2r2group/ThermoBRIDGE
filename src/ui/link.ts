// Opening a share link (plan §8 row 19): its system is imported as Import would, and its view,
// the cut and the lever rule's X₀, is set once the system applies.

import type { Store } from "./state";
import { parseLink } from "./systemFile";
import type { SystemPanel } from "./systemPanel";

/** Imports the fragment's system through `panel` and sets its view, or warns about it. */
export function openLink(fragment: string, panel: SystemPanel, store: Store): void {
  const parsed = parseLink(fragment);
  if (!parsed.ok) {
    panel.warn(`Not a ThermoBRIDGE link: ${parsed.problem}.`);
    return;
  }
  const { system, view } = parsed.value;
  if (!panel.importSystem(system) || !view) return;
  // A cut outside the window is clamped, as a typed one would be. The lever rule is on exactly
  // when the link carries X₀.
  store.setCut(view.cut);
  if (view.X0 !== undefined) store.setX0(view.X0);
  store.setShowLever(view.X0 !== undefined);
}
