// The figure export (plan §9 phase 20): the two plots as SVG or PNG images in the light theme,
// built from the page's own SVGs. Three images: both plots as on screen, and each plot on its own,
// redrawn to stand alone; for a series, three at each of its cuts. In the α mode, or for a series,
// the plots are first drawn as the export shows them (`Store.dgState`, `stateAtCut`), and drawn
// back afterwards. Everything that touches the page runs in one synchronous task, so no frame
// shows the light theme, the other mode or another cut.

import { axisBottom, scaleLinear, select } from "d3";
import type { Params } from "../physics/gibbs";
import { paintRegions, regionRaster, rowHulls } from "./regions";
import type { PlotHandle } from "./diagram/phaseDiagram";
import { frameTopRight, MARGIN, SLICE_MARGIN, xTicks, type PlotSize } from "./geometry";
import type { SliceHandle } from "./slicePanel";
import type { State } from "./state";

export type FigureFormat = "svg" | "png";

/** The plots and the page element whose `data-mode` the α mode sets (modeToggle.ts). */
export interface FigurePlots {
  app: HTMLElement;
  diagram: PlotHandle;
  slice: SliceHandle;
}

/** One image of the figure: its name's suffix ("", "-diagram" or "-slice") and its SVG. */
export interface FigureImage {
  suffix: string;
  svg: SVGSVGElement;
}

/** The region raster's pixels per CSS px: finer for PNG, which is drawn at 3× (§10.2 item 5). */
const REGION_SCALE: Record<FigureFormat, number> = { svg: 2, png: 3 };
/** A PNG's pixels per CSS px. */
const PNG_SCALE = 3;
/** Room around what an image holds, CSS px. */
const PAD = 8;
/** The one font the images name, with a fallback (§10.2 item 4). */
const FONT = "Lato, sans-serif";

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

/**
 * The properties inlined from the computed style. All are inherited, so an element writes only
 * those that differ from its parent's; `opacity` is not, so it is written when it is not 1.
 */
const INHERITED = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "paint-order",
  "font-size",
  "font-weight",
  "font-style",
  "font-variant-numeric",
  "text-anchor",
  "dominant-baseline",
  "white-space",
  "visibility",
] as const;

/** Presentation attributes (d3's axes set some) that the inlined style replaces. */
const PRESENTATION = [...INHERITED, "opacity", "font-family"];

/** The controls and their hit areas, which an image leaves out. */
const INTERACTIVE = ".cut-handle, .cut-hit, .lever-knob";

/** A computed `url(...)` reference, which may carry the page's address, as `url(#id)`. */
function localUrl(value: string): string {
  return value.replace(/url\((["']?)[^)#]*#([^)"']+)\1\)/g, "url(#$2)");
}

/**
 * Inlines the computed style of every element under `root` (in the page, so the page's CSS
 * applies), drops the elements that are not displayed, and strips the classes, ids (but those of
 * what `<defs>` holds), roles, ARIA and data attributes, tab stops and `<title>` tooltips. An
 * element in `whole` (and `root`) writes every property, so that it can be moved under another
 * parent.
 */
function inlineStyles(root: SVGElement, whole: ReadonlySet<Element> = new Set()): void {
  const styles = new Map<Element, CSSStyleDeclaration>();
  const all = [root, ...root.querySelectorAll("*")];
  for (const el of all) styles.set(el, getComputedStyle(el));
  const written = new Map<Element, string>();
  for (const el of all) {
    const cs = styles.get(el)!;
    const inDefs = el.closest("defs") !== null;
    if (!inDefs && cs.display === "none") continue;
    const parent = el === root || whole.has(el) ? null : styles.get(el.parentElement!);
    const parts: string[] = [];
    for (const prop of INHERITED) {
      const value = localUrl(cs.getPropertyValue(prop));
      if (value && (!parent || parent.getPropertyValue(prop) !== cs.getPropertyValue(prop))) {
        parts.push(`${prop}:${value}`);
      }
    }
    if (cs.opacity !== "1") parts.push(`opacity:${cs.opacity}`);
    if (el === root || whole.has(el)) parts.push(`font-family:${FONT}`);
    written.set(el, parts.join(";"));
  }
  for (const el of all) {
    if (!el.isConnected || !root.contains(el)) continue;
    const style = written.get(el);
    if (style === undefined || el.tagName.toLowerCase() === "title") {
      el.remove();
      continue;
    }
    for (const name of [...el.getAttributeNames()]) {
      const keepId = name === "id" && el.closest("defs") !== null;
      if (
        (name === "id" && !keepId) ||
        name === "class" ||
        name === "role" ||
        name === "tabindex" ||
        name === "style" ||
        name.startsWith("aria-") ||
        name.startsWith("data-") ||
        PRESENTATION.includes(name)
      ) {
        el.removeAttribute(name);
      }
    }
    if (style) el.setAttribute("style", style);
  }
}

/** Where a clone waits in the page: out of sight, and out of the flow, so the page keeps its layout. */
const ASIDE = "position:absolute;left:-100000px;top:0";

/** A clone of `live` beside it in the page, out of sight, with the controls removed. */
function cloneBeside(live: SVGSVGElement): SVGSVGElement {
  const clone = live.cloneNode(true) as SVGSVGElement;
  for (const el of clone.querySelectorAll(INTERACTIVE)) el.remove();
  clone.style.cssText = ASIDE;
  clone.setAttribute("aria-hidden", "true");
  live.after(clone);
  return clone;
}

/** `inlineStyles` on a clone from `cloneBeside`, which stays out of the page's flow. */
function inlineClone(clone: SVGSVGElement, whole?: ReadonlySet<Element>): void {
  inlineStyles(clone, whole);
  clone.setAttribute("style", `${clone.getAttribute("style") ?? ""};${ASIDE}`);
}

/** The smallest box that holds both, or `b` alone where `a` is empty. */
function union(a: DOMRect | null, b: DOMRect): DOMRect {
  if (!a || a.width * a.height === 0) return b;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return new DOMRect(x, y, Math.max(a.right, b.right) - x, Math.max(a.bottom, b.bottom) - y);
}

/**
 * The box of what `svg` shows, in its own user units. `getBBox` ignores clipping, and the slice
 * panel's curves run far past its g axis under their clip, so a clipped element counts only as
 * far as its clip's box, mapped into the SVG's units.
 */
function shownBox(svg: SVGSVGElement): DOMRect {
  const clipped = [...svg.querySelectorAll<SVGGraphicsElement>("[clip-path]")];
  const styles = clipped.map((el) => el.getAttribute("style"));
  for (const el of clipped) el.style.display = "none";
  // `getBBox` gives an SVGRect, which has no right or bottom in every browser.
  const { x, y, width, height } = svg.getBBox();
  let box: DOMRect | null = new DOMRect(x, y, width, height);
  clipped.forEach((el, k) => {
    const style = styles[k];
    if (style === null || style === undefined) el.removeAttribute("style");
    else el.setAttribute("style", style);
  });
  const toSvg = svg.getScreenCTM()?.inverse();
  for (const el of clipped) {
    const id = /url\(["']?#([^"')]+)/.exec(el.getAttribute("clip-path") ?? "")?.[1];
    const shape = id && svg.querySelector<SVGGraphicsElement>(`[id="${CSS.escape(id)}"] > *`);
    const at = el.getScreenCTM();
    if (!shape || !at || !toSvg) continue;
    const own = el.getBBox();
    const clip = shape.getBBox();
    const x0 = Math.max(own.x, clip.x);
    const y0 = Math.max(own.y, clip.y);
    const x1 = Math.min(own.x + own.width, clip.x + clip.width);
    const y1 = Math.min(own.y + own.height, clip.y + clip.height);
    if (x1 <= x0 || y1 <= y0) continue;
    const m = toSvg.multiply(at);
    const corners = [
      new DOMPoint(x0, y0).matrixTransform(m),
      new DOMPoint(x1, y1).matrixTransform(m),
    ];
    const [a, b] = corners as [DOMPoint, DOMPoint];
    box = union(
      box,
      new DOMRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)),
    );
  }
  return box;
}

/** The box of what `svg` shows (`shownBox`), padded by PAD. */
function paddedBox(svg: SVGSVGElement): DOMRect {
  const b = shownBox(svg);
  return new DOMRect(b.x - PAD, b.y - PAD, b.width + 2 * PAD, b.height + 2 * PAD);
}

/** Sizes `svg` to `box`, its own user units being CSS px. */
function fitTo(svg: SVGSVGElement, box: DOMRect): void {
  svg.setAttribute("viewBox", `${box.x} ${box.y} ${box.width} ${box.height}`);
  svg.setAttribute("width", String(Math.ceil(box.width)));
  svg.setAttribute("height", String(Math.ceil(box.height)));
  svg.removeAttribute("style");
}

/** The region raster of `state`'s system at `scale` px per CSS px, as a PNG data URL. */
function regionImage(
  state: Readonly<State>,
  size: PlotSize,
  scale: number,
  style: CSSStyleDeclaration,
) {
  const cols = Math.max(1, Math.round(size.width * scale));
  const rows = Math.max(1, Math.round(size.height * scale));
  const { params, window } = state.diagram.scan;
  const kinds = regionRaster(rowHulls(params, window, rows), cols);
  const canvas = document.createElement("canvas");
  paintRegions(canvas, kinds, cols, rows, scale, style);
  return canvas.toDataURL("image/png");
}

/** An `<image>` of the region raster under the diagram's plot area. */
function regionElement(href: string, size: PlotSize): SVGImageElement {
  const image = document.createElementNS(SVG_NS, "image");
  image.setAttribute("x", String(MARGIN.left));
  image.setAttribute("y", String(MARGIN.top));
  image.setAttribute("width", String(size.width));
  image.setAttribute("height", String(size.height));
  image.setAttribute("preserveAspectRatio", "none");
  image.setAttribute("href", href);
  image.setAttributeNS(XLINK_NS, "xlink:href", href);
  return image;
}

/** The bottom of an element's box in its parent's units: its translate plus its box's bottom. */
function bottomOf(el: SVGGraphicsElement): number {
  const b = el.getBBox();
  const m = /translate\(\s*[-\d.e]+[ ,]+([-\d.e]+)\s*\)/.exec(el.getAttribute("transform") ?? "");
  return (m ? Number(m[1]) : 0) + b.y + b.height;
}

/** Draws the ticked X axis with its numbers into `axis` (d3's `axisBottom`) on the plot's scale. */
function drawXAxis(axis: SVGGElement, size: PlotSize, y: number, left: number): void {
  const x = scaleLinear().domain([0, 1]).range([0, size.width]);
  select(axis)
    .attr("transform", `translate(${left},${y})`)
    .call(axisBottom(x).tickValues(xTicks(size.width)).tickSizeOuter(0));
}

/** The X-axis label's and the component names' baseline gap under what is above them, CSS px. */
const LABEL_GAP = 15;

/**
 * The three images of what the plots now show: both plots as on screen (the diagram's top at y 0,
 * the slice panel's at `offset`), the diagram alone and the slice panel alone, with the region
 * raster `region` under the diagram. The clones wait in the page until `pieces` are removed.
 */
function capture(
  plots: FigurePlots,
  size: PlotSize,
  offset: number,
  region: string,
  pieces: SVGSVGElement[],
): FigureImage[] {
  const { diagram, slice } = plots;
  // Both plots, as on screen.
  const fullDiagram = cloneBeside(diagram.svg);
  const fullSlice = cloneBeside(slice.svg);
  pieces.push(fullDiagram, fullSlice);
  // What the slice panel alone takes from the diagram, styled to stand under any parent.
  const boldValues = fullDiagram.querySelector(".bold-values")!;
  const xLabels = [...fullDiagram.querySelectorAll(".x-label, .component-name")];
  inlineClone(fullDiagram, new Set([boldValues, ...xLabels]));
  inlineClone(fullSlice);
  fullDiagram.prepend(regionElement(region, size));

  // The diagram alone: no guide lines or bold values, and the X axis with its numbers.
  const lone = cloneBeside(diagram.svg);
  pieces.push(lone);
  for (const el of lone.querySelectorAll(".guides, .guide, .bold-values")) el.remove();
  const axisY = MARGIN.top + size.height;
  const loneAxis = lone.querySelector<SVGGElement>(".x-axis")!;
  drawXAxis(loneAxis, size, axisY, MARGIN.left);
  const lowest = bottomOf(loneAxis) + LABEL_GAP;
  for (const el of lone.querySelectorAll(".x-label, .component-name")) {
    if (Number(el.getAttribute("y")) < lowest) el.setAttribute("y", String(lowest));
  }
  inlineClone(lone);
  lone.prepend(regionElement(region, size));

  // The slice panel alone: no guide lines, and the X axis at the bottom with its numbers, the
  // bold values under them and the X-axis label under those.
  const loneSlice = cloneBeside(slice.svg);
  pieces.push(loneSlice);
  for (const el of loneSlice.querySelectorAll(".guides, .guide")) el.remove();
  const sliceAxisY = SLICE_MARGIN.top + size.height;
  const sliceAxis = loneSlice.querySelector<SVGGElement>(".x-axis")!;
  drawXAxis(sliceAxis, size, sliceAxisY, SLICE_MARGIN.left);
  loneSlice.querySelector(".frame")?.setAttribute("d", frameTopRight(size));
  inlineClone(loneSlice);
  const axes = loneSlice.querySelector<SVGGElement>(":scope > g:last-of-type") ?? loneSlice;
  let below = bottomOf(sliceAxis);
  // The values' ticks are left out: under the numbers they would point at nothing.
  const bold = boldValues.cloneNode(true) as SVGGElement;
  for (const tick of bold.querySelectorAll("line")) tick.remove();
  axes.append(bold);
  bold.setAttribute("transform", `translate(${SLICE_MARGIN.left},${below - 4})`);
  if (bold.getBBox().height > 0) below = bottomOf(bold);
  for (const el of xLabels) {
    const label = el.cloneNode(true) as SVGTextElement;
    axes.append(label);
    label.setAttribute("y", String(below + LABEL_GAP));
  }

  // The boxes are measured while the clones are in the page.
  const boxes = new Map([fullDiagram, fullSlice, lone, loneSlice].map((p) => [p, paddedBox(p)]));
  const whole = document.createElementNS(SVG_NS, "svg");
  const dBox = boxes.get(fullDiagram)!;
  const sBox = boxes.get(fullSlice)!;
  const top = Math.min(dBox.y, offset + sBox.y);
  const left = Math.min(dBox.x, sBox.x);
  const bottom = Math.max(dBox.bottom, offset + sBox.bottom);
  const right = Math.max(dBox.right, sBox.right);
  for (const [piece, y] of [
    [fullDiagram, 0],
    [fullSlice, offset],
  ] as const) {
    piece.removeAttribute("style");
    piece.setAttribute("x", "0");
    piece.setAttribute("y", String(y));
    piece.setAttribute("overflow", "visible");
    whole.append(piece);
  }
  fitTo(whole, new DOMRect(left, top, right - left, bottom - top));
  whole.setAttribute("style", `font-family:${FONT}`);
  fitTo(lone, boxes.get(lone)!);
  lone.setAttribute("style", `font-family:${FONT}`);
  fitTo(loneSlice, boxes.get(loneSlice)!);
  loneSlice.setAttribute("style", `font-family:${FONT}`);
  return [
    { suffix: "", svg: whole },
    { suffix: "-diagram", svg: lone },
    { suffix: "-slice", svg: loneSlice },
  ];
}

/**
 * The three images of the figure for each of `views`, in the light theme, with the region raster
 * at the format's scale. The views are states of one system in the Δg^M mode: the store's own,
 * the Δg^M mode's view of the α mode's system, or those at the cuts of a series. A view that is
 * not `current` is drawn into the plots for the export, and `current` is drawn back afterwards.
 */
export function buildFigures(
  plots: FigurePlots,
  views: readonly Readonly<State>[],
  current: Readonly<State>,
  format: FigureFormat,
): FigureImage[][] {
  const { app, diagram, slice } = plots;
  const html = document.documentElement;
  const theme = html.getAttribute("data-theme");
  const alpha = current.mode === "alpha";
  const redraws = views.some((view) => view !== current);
  const sliceWas = slice.drawn();
  const pieces: SVGSVGElement[] = [];
  try {
    if (alpha) app.dataset.mode = "dg";
    html.removeAttribute("data-theme");
    const size = diagram.size();
    // Measured before any clone is in the page.
    const offset = slice.svg.getBoundingClientRect().top - diagram.svg.getBoundingClientRect().top;
    // The views share one system, so they share its raster.
    const region = regionImage(
      views[0] ?? current,
      size,
      REGION_SCALE[format],
      getComputedStyle(diagram.svg.parentElement!),
    );
    return views.map((view) => {
      if (redraws) {
        diagram.draw(view);
        slice.draw(view);
      }
      return capture(plots, size, offset, region, pieces);
    });
  } finally {
    for (const p of pieces) if (p.isConnected) p.remove();
    if (theme === null) html.removeAttribute("data-theme");
    else html.setAttribute("data-theme", theme);
    if (alpha) app.dataset.mode = current.mode;
    // After the theme is back, so that the bitmap is painted in the page's colours.
    // The α mode leaves its hidden slice panel as it last drew it; the Δg^M mode shows `current`.
    if (redraws) {
      diagram.draw(current);
      slice.draw(alpha ? sliceWas : current);
    }
  }
}

/** A comment's text: XML comments may not hold `--`. */
const commentText = (text: string) => ` ${text.replace(/-{2,}/g, (m) => m.split("").join(" "))} `;

/** The system's numbers for an image's comment. */
function describeParams(p: Params): string {
  const parts = [
    `T_m,A = ${p.TmA} K`,
    `T_m,B = ${p.TmB} K`,
    `Δs_A = ${p.dsA} J/(mol K)`,
    `Δs_B = ${p.dsB} J/(mol K)`,
    `α_l = ${p.alphaL} kJ/mol`,
    `α_s = ${p.alphaS} kJ/mol`,
  ];
  const c = p.compound;
  if (c) {
    parts.push(
      `compound X_c = ${c.Xc}, Δh_f = ${c.dhf} kJ/mol, Δs_f = ${c.dsf} J/(mol K), ` +
        (c.width === "line" ? "line" : `α_γ = ${c.alphaG} kJ/mol`),
    );
  }
  return parts.join(", ");
}

/** Gives `svg` its `<title>` and a comment with the app, the system, the link and the date. */
export function addMetadata(
  svg: SVGSVGElement,
  name: string,
  params: Params,
  link: string,
  date = new Date(),
): void {
  const title = document.createElementNS(SVG_NS, "title");
  title.textContent = name;
  const note = document.createComment(
    commentText(
      `ThermoBRIDGE figure of ${name}. ${describeParams(params)}. Link: ${link}. ` +
        `Exported ${date.toISOString().slice(0, 10)}.`,
    ),
  );
  svg.prepend(title, note);
}

/** `svg` as an SVG file's text. */
export function svgText(svg: SVGSVGElement): string {
  svg.setAttribute("xmlns", SVG_NS);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}\n`;
}

/**
 * `svg` drawn at PNG_SCALE× over the light background, as PNG bytes. The SVG drawn embeds Lato; the
 * one passed in is left as it is.
 */
export async function pngOf(svg: SVGSVGElement, background = "#ffffff"): Promise<Uint8Array> {
  const { FONT_FACES } = await import("./figureFonts");
  const copy = svg.cloneNode(true) as SVGSVGElement;
  const style = document.createElementNS(SVG_NS, "style");
  style.textContent = FONT_FACES;
  copy.prepend(style);
  const width = Number(copy.getAttribute("width"));
  const height = Number(copy.getAttribute("height"));
  const url = URL.createObjectURL(new Blob([svgText(copy)], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * PNG_SCALE);
    canvas.height = Math.round(height * PNG_SCALE);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2D canvas for the PNG");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
    if (!blob) throw new Error("the PNG could not be encoded");
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}
