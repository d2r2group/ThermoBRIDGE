// The axis labels of both plots (plan §4.4), adapted from pTerrain's ui/labels.ts: variables in
// italic, units upright, and subscripts and superscripts as in X_B and Δg^{M,r}.

/**
 * A piece of an axis label: plain text, or a variable set in italic with an optional subscript or
 * superscript.
 */
export type LabelPart = string | { symbol: string; sub?: string; sup?: string };

/**
 * The axis labels: T (K), X_B and Δg^{M,r} (kJ/mol), the slice panel's g − r: the Gibbs energy of
 * mixing from the reference line r through the stable pure components at T (Model Details).
 */
export const AXIS_LABELS = {
  T: [{ symbol: "T" }, " (K)"],
  X: [{ symbol: "X", sub: "B" }],
  G: ["Δ", { symbol: "g", sup: "M,r" }, " (kJ/mol)"],
} as const satisfies Record<string, readonly LabelPart[]>;

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Fills an SVG text element with `parts`. Variables get the class `symbol` (set in italic), a
 * subscript an upright, lowered tspan of class `sub`, and a superscript a raised tspan of class
 * `sup` (italic), after which the baseline is restored.
 */
export function setAxisLabel(text: SVGTextElement, parts: readonly LabelPart[]): void {
  const spans: SVGTSpanElement[] = [];
  // The `dy` that brings the next piece back to the baseline, if the last one left it.
  let restore: string | null = null;
  for (const part of parts) {
    const span = document.createElementNS(SVG_NS, "tspan");
    if (restore) span.setAttribute("dy", restore);
    restore = null;
    spans.push(span);
    if (typeof part === "string") {
      span.textContent = part;
      continue;
    }
    span.textContent = part.symbol;
    span.classList.add("symbol");
    if (part.sub) {
      const sub = document.createElementNS(SVG_NS, "tspan");
      sub.textContent = part.sub;
      sub.classList.add("sub");
      sub.setAttribute("dy", "0.25em");
      spans.push(sub);
      restore = "-0.25em";
    }
    if (part.sup) {
      const sup = document.createElementNS(SVG_NS, "tspan");
      sup.textContent = part.sup;
      sup.classList.add("sup");
      // In the superscript's own 0.8em: −0.5em is 0.4em of the label's size.
      sup.setAttribute("dy", "-0.5em");
      spans.push(sup);
      restore = "0.4em";
    }
  }
  text.replaceChildren(...spans);
}
