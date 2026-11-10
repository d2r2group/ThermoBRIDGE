// Text that may hold a line compound's formula (plan §9 phases 12–13). Integer subscripts are
// Unicode digits, so such a name is one string anywhere; a formula with decimal subscripts
// (A₀.₅₇B₀.₄₃) has no Unicode subscript point, so it is drawn with real subscripts: `<tspan>`s in
// SVG, `<sub>` in HTML, and read as "A 0.57 B 0.43" by screen readers.

import type { CompoundName, NamePart } from "../physics/fields";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Whether the compound's formula needs real subscripts: a decimal one. */
function needsSubscripts(compound: CompoundName | null): compound is CompoundName {
  return compound !== null && compound.parts.some((p) => p.sub && p.text.includes("."));
}

/**
 * `text` in parts, with each occurrence of the compound's name in its own parts where it needs
 * real subscripts; otherwise one plain part.
 */
export function nameParts(text: string, compound: CompoundName | null): NamePart[] {
  if (!needsSubscripts(compound)) return [{ text, sub: false }];
  const out: NamePart[] = [];
  text.split(compound.name).forEach((piece, k) => {
    if (k > 0) out.push(...compound.parts);
    if (piece) out.push({ text: piece, sub: false });
  });
  return out;
}

/** `text` for screen readers: a formula with decimal subscripts as "A 0.57 B 0.43". */
export function spokenName(text: string, compound: CompoundName | null): string {
  return needsSubscripts(compound) ? text.split(compound.name).join(compound.spoken) : text;
}

/**
 * Appends `text` to an SVG text or tspan element, subscripts as lowered tspans of class `sub`; returns
 * whether it ends lowered, so that the next tspan can restore the baseline.
 */
export function appendSvgName(
  el: SVGTextElement | SVGTSpanElement,
  text: string,
  compound: CompoundName | null,
): boolean {
  const parts = nameParts(text, compound);
  if (parts.length === 1) {
    el.append(text);
    return false;
  }
  let lowered = false;
  for (const part of parts) {
    const span = document.createElementNS(SVG_NS, "tspan");
    span.textContent = part.text;
    if (part.sub) {
      span.classList.add("sub");
      if (!lowered) span.setAttribute("dy", "0.25em");
    } else if (lowered) {
      span.setAttribute("dy", "-0.25em");
    }
    lowered = part.sub;
    el.append(span);
  }
  return lowered;
}

/**
 * Fills an SVG text element with `text`, subscripts as lowered tspans of class `sub`, as the axis
 * labels do (axisLabels.ts).
 */
export function setSvgName(el: SVGTextElement, text: string, compound: CompoundName | null): void {
  el.replaceChildren();
  appendSvgName(el, text, compound);
}

/** Appends `text` to an HTML element, subscripts as `<sub>`. */
export function appendHtmlName(
  parent: HTMLElement,
  text: string,
  compound: CompoundName | null,
): void {
  for (const part of nameParts(text, compound)) {
    if (!part.sub) {
      parent.append(part.text);
      continue;
    }
    const sub = document.createElement("sub");
    sub.textContent = part.text;
    parent.append(sub);
  }
}
