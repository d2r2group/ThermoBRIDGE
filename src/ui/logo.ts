// Adapted from pTerrain's ui/logo.ts, with ThermoBRIDGE's logo.
//
// The ThermoBRIDGE logo (plan §4.3): one SVG of outlines in `currentColor`, so it follows the
// theme (header.css sets its "ΔG", "Thermo" and M emblem in the d2r2 purple) and needs no web
// fonts. On a narrow phone, where the full logo would be squeezed, it gives way to its ΔG^M mark
// (logo-narrow.svg), which stays legible at the logo's height. It replaces the text heading and
// keeps "ThermoBRIDGE" as its name. It is also a button that snaps the cut to the next stable
// invariant above it, wrapping round to the lowest, as its tooltip says, where pTerrain's snaps to
// the triple point. The α mode has no cut, so there it does nothing (§9 phase 16).

import logoNarrow from "../assets/logo-narrow.svg?raw";
import logo from "../assets/logo.svg?raw";
import type { DiagramEvent } from "../physics/events";
import { formatInvariantT } from "./format";
import { nextInvariant, type Store } from "./state";

/** What the name's "BRIDGE" stands for, as the logo's tooltip and the About overlay spell it. */
export const BRIDGE_MEANING = "Binary Regular-solution Interactive Diagram Generator for Education";

/** An invariant by its kind and temperature, "eutectic, 634 K". */
export function invariantText(e: DiagramEvent): string {
  return `${e.kind}, ${formatInvariantT(e.T)}`;
}

/** What the logo says in the α mode, which has no cut to snap. */
export const NO_SNAP_IN_ALPHA = "The α mode has no cut to snap to an invariant";

/**
 * What clicking the logo does, under the name in its tooltip and as its description: the
 * invariant it snaps the cut to next, by kind ("Snap the cut to the
 * eutectoid, 409 K"), or that there is none.
 */
export function snapTitle(events: readonly DiagramEvent[], cut: number): string {
  const target = nextInvariant(events, cut);
  return target
    ? `Snap the cut to the ${invariantText(target)}`
    : "This system has no invariant to snap the cut to";
}

/**
 * The page heading: the logo, named "ThermoBRIDGE" for screen readers, and a button that snaps the
 * cut to the next invariant. In a system without one it does nothing, and says so.
 */
export function createLogo(container: HTMLElement, store: Store): void {
  const heading = document.createElement("h1");
  heading.className = "logo";
  const button = document.createElement("button");
  button.type = "button";
  button.innerHTML = logo + logoNarrow;
  const svgs = button.querySelectorAll("svg");
  if (svgs.length !== 2) throw new Error("ThermoBRIDGE: a logo asset holds no <svg>");
  // header.css shows one at a time, so the heading is named once.
  for (const [svg, cls] of [
    [svgs[0]!, "logo-full"],
    [svgs[1]!, "logo-narrow"],
  ] as const) {
    svg.classList.add(cls);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "ThermoBRIDGE");
  }
  button.addEventListener("click", () => store.snapToInvariant());
  heading.append(button);
  container.append(heading);

  // The tooltip spells out the name above what a click does; screen readers get only the latter,
  // as the button's description (the About overlay spells out the name for them).
  const sync = () => {
    const { diagram, cut, mode } = store.state;
    const target = mode === "dg" ? nextInvariant(diagram.scan.events, cut) : null;
    const snap = mode === "dg" ? snapTitle(diagram.scan.events, cut) : NO_SNAP_IN_ALPHA;
    button.title = `ThermoBRIDGE: ${BRIDGE_MEANING}\n${snap}`;
    button.setAttribute("aria-description", snap);
    // Not `disabled`, which would also dim the logo.
    if (target) button.removeAttribute("aria-disabled");
    else button.setAttribute("aria-disabled", "true");
  };
  sync();
  store.subscribe(sync);
}
