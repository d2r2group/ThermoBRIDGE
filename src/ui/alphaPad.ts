// The α mode's controls (plan §9 phase 17): in the slice panel's place, the α pad, a square with
// α_s across and α_l up crossing like a plus sign, its quadrants shaded as a checkerboard (the
// knob's more) with the signs of Δh^{M,L} and Δh^{M,S} in their outer corners, the seven grid
// presets as open dots, which pull a drag slightly onto them (hidden with a compound), and the
// knob, with the *Stay on the axes* box above it; the vertical T_m,B slider right of the pad, its
// value above it; *Line Compound* level with the lock, right of the slider; with *Line Compound* ticked
// (phase 19), three more sliders, for a line compound's X_c, Δh_f and Δs_f, in the rest of the
// box; and in the side column, where the cut's slider and field were, the values as number fields.
// While the knob or a slider is held, the plots carry the class `alpha-holding`, which hides the
// diagram's caption (diagram/alphaCaption.ts).
// Every move goes through the drag's path (alphaDrag.ts): a preview at once, the full diagram once
// the knob rests or is let go. A position that cannot be computed keeps the last diagram, outlines
// the knob in --warning and says so under the pad. The rules for where the knob goes are in
// alphaKnob.ts.

import { select } from "d3";
import { PANELS, PRESETS } from "../physics/presets";
import { createAlphaDrag, type AlphaDrag } from "./alphaDrag";
import type { AlphaCache } from "./alphaCache";
import {
  alphasAfterKey,
  alphasAt,
  onAxes,
  padXY,
  snapAlphas,
  toAxes,
  typedPoint,
  type AlphaField,
  type Alphas,
} from "./alphaKnob";
import {
  ALPHA_COMPOUND,
  ALPHA_MAX,
  ALPHA_STEP,
  alphaFormula,
  alphaPointOf,
  DHF_MAX,
  DHF_MIN,
  DHF_STEP,
  DSF_MAX,
  DSF_MIN,
  DSF_STEP,
  quantise,
  samePoint,
  TMB_MAX,
  TMB_MIN,
  TMB_STEP,
  XC_STOPS,
  xcStop,
  type AlphaCompound,
  type AlphaPoint,
} from "./alphaPoint";
import { AXIS_LABELS, setAxisLabel, type LabelPart } from "./axisLabels";
import { signed } from "./format";
import { CUT_KNOB_R, HIT_BAND, MARGIN, PRESET_MAGNET_PX, SLICE_MARGIN } from "./geometry";
import { ALPHA_GRIP } from "./icons";
import { attachPanel } from "./panel";
import { perFrame } from "./schedule";
import type { Params } from "../physics/gibbs";
import type { Store } from "./state";

/** The gap above the box's top row, under the diagram's X-axis label, CSS px. */
const PAD_TOP = 8;
/**
 * The row above the pad for the lock, *Line Compound* and the warning: a touch target's height
 * (§4.2), CSS px.
 */
const LOCK_ROW = 44;
/** The gap under the pad, for its −30 tick label, CSS px. */
const PAD_BOTTOM = 8;
/** The pad's ticks, kJ/mol: every 10, the 0 numbered once at the crossing. */
const TICKS = [-30, -20, -10, 10, 20, 30];
/** The least pad side that numbers every tick, CSS px; a smaller pad numbers ±30 and 0 only. */
const ALL_TICK_LABELS = 220;
/** The radius of a grid preset's open dot, CSS px. */
const PRESET_R = 4;
/** The pad's quadrants by the signs of α_s and α_l, (+,+) first, anticlockwise. */
const QUADRANTS = [
  { s: 1, l: 1 },
  { s: -1, l: 1 },
  { s: -1, l: -1 },
  { s: 1, l: -1 },
] as const;
type Quadrant = (typeof QUADRANTS)[number];
/**
 * Whether the knob at `p` is in quadrant `q`: on an axis, only in the (+,+) or (−,−) quadrant
 * beside it; at the crossing, in none.
 */
export const inQuadrant = (q: Quadrant, { alphaS, alphaL }: Alphas) =>
  (alphaS !== 0 || alphaL !== 0) &&
  (alphaS * alphaL !== 0 || q.s === q.l) &&
  alphaS * q.s >= 0 &&
  alphaL * q.l >= 0;
/**
 * A quadrant's corner text, a line each: the sign of Δh^{M,L} and of Δh^{M,S}, which are those of
 * α_l and α_s (Δh^M = α X(1 − X)).
 */
export const cornerLines = (q: Quadrant): LabelPart[][] => [
  ["Δ", { symbol: "h", sup: "M,L" }, q.l > 0 ? " > 0" : " < 0"],
  ["Δ", { symbol: "h", sup: "M,S" }, q.s > 0 ? " > 0" : " < 0"],
];
/**
 * The least pad side that shows the corner text, CSS px: below it, the (+,+) corner's runs into
 * the α_l label beside the axis.
 */
const CORNER_TEXT = 240;
/** The corner text's inset from the pad's edges, its top line's baseline and line gap, CSS px. */
const CORNER_INSET = 4;
const CORNER_TOP = 16;
const CORNER_LINE = 15;
/** The seven grid presets (plan §2.1), which the pad marks: the menu's presets from PANELS. */
export const GRID_PRESETS = PRESETS.filter((p) =>
  Object.values(PANELS).some((q) => q.params === p.params),
);
/** What the warning under the pad says. */
export const CANNOT_COMPUTE = "This system could not be computed";

/** The knob's spoken value: "αₛ +15, αₗ 0 kJ/mol". */
export const knobText = ({ alphaS, alphaL }: Alphas) =>
  `αₛ ${signed(alphaS)}, αₗ ${signed(alphaL)} kJ/mol`;

/** What *Line Compound* says on hover, and after entering at a compound with a range. */
export const COMPOUND_TITLE = "Add a line compound, with sliders for its X_c, Δh_f and Δs_f";
export const RANGE_DROPPED = "A compound with a range is not used in the α mode";

/** X_c's spoken and shown value: its formula and X_B, "AB₃, X_B = 0.750". */
export const xcText = (Xc: number) => `${alphaFormula(Xc)}, X_B = ${Xc.toFixed(3)}`;

/** The T_m,B slider's column, its value above the input: as wide as T_m,A's note, CSS px. */
const TMB_COLUMN = 75;
/** The gap between the box's columns, CSS px (styles/plots.css `.alpha-box`). */
const COLUMN_GAP = 12;
/**
 * The least width of the box's empty column that holds the three compound sliders upright, each
 * 44 px with 2.25 rem for its value, 8 px apart, CSS px; narrower (a phone), they lie flat,
 * stacked.
 */
const UPRIGHT_MIN = 3 * (44 + 36) + 2 * 8;
/**
 * The least pad side, and the least width of the empty column, that hold the three flat sliders,
 * 44 px high each, 4 px apart, with a label and a 100 px track, CSS px. Short of either (a window
 * under about 505 px, every phone: the column is 1–108 px wide from 320 to 440 px), the sliders
 * stand upright in the pad's place instead, and a switch in the empty column shows the one or the
 * other.
 */
const FLAT_MIN = 3 * 44 + 2 * 4;
const FLAT_WIDTH_MIN = 140;
/**
 * The least widths of the empty column, CSS px, that hold the α and T_m,B fields without a
 * compound: with their units (a 7 rem name, a 5 rem field), a name each left of its field (a
 * 2.25 rem name, 6 px apart from a 3.25 rem field), and a name over each field; narrower, they
 * stay in the side column (styles/plots.css `.alpha-box-fields`).
 */
const FIELDS_UNITS_MIN = 210;
const FIELDS_MIN = 36 + 6 + 52;
const FIELDS_STACKED_MIN = 56;
/**
 * The least width of the empty column on a narrow box, CSS px: the switch's 48 px, and the stacked
 * fields' (`FIELDS_STACKED_MIN`), so that neither leaves the box at any width.
 */
const COLUMN_LEAST = Math.max(48, FIELDS_STACKED_MIN);
/**
 * On the narrowest box (`compound-tight`), the gap between its columns and the T_m,B column,
 * without T_m,A's note, and the least pad side, the three sliders' 44 px each, CSS px.
 */
const GAP_TIGHT = 6;
const TMB_TIGHT = 52;
const SWAP_LEAST = 3 * 44;
/**
 * The least width of the empty column, CSS px, that holds *Line Compound* (124 px with its box);
 * narrower (a phone), it starts right of the pad instead, over the T_m,B slider.
 */
const ROW_LABEL_MIN = 130;
/**
 * The least width of the empty column, CSS px, that holds the warning beside *Line Compound* on
 * two lines; narrower, the warning lies over the pad's foot instead.
 */
const ROW_WARNING_MIN = 290;

/** A range input with its label and its value beside the thumb (above it, lying flat). */
interface Slider {
  cell: HTMLDivElement;
  /** Shows `value` on the input, `text` beside its thumb and `spoken` to screen readers. */
  show(value: number, text: string, spoken: string): void;
}

/**
 * An upright range input (styles/plots.css lays the compound's flat on a narrow box) from `min`
 * to `max` in `step`, labelled by `html` and spoken as `name`,
 * that calls `move` with each input at most once per frame and `release` when it is let go (its
 * `change`), and marks the plots as held (`hold`) while a pointer holds it.
 */
function createSlider(
  className: string,
  html: string,
  name: string,
  [min, max, step]: readonly [number, number, number],
  move: (v: number) => void,
  release: () => void,
  hold: (on: boolean) => void,
): Slider {
  const id = `${className}-range-${++nextId}`;
  const cell = document.createElement("div");
  cell.className = `alpha-slider ${className}`;
  const label = document.createElement("label");
  label.htmlFor = id;
  label.innerHTML = html;
  const track = document.createElement("div");
  track.className = "slider-track";
  const range = document.createElement("input");
  range.type = "range";
  range.id = id;
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.setAttribute("aria-label", name);
  const value = document.createElement("output");
  value.htmlFor.add(id);
  value.setAttribute("aria-hidden", "true");
  track.append(range, value);
  cell.append(label, track);

  const moves = perFrame(move);
  range.addEventListener("input", () => moves.push(range.valueAsNumber));
  // Let go anywhere: the pointer may leave the slider before it is released.
  range.addEventListener("pointerdown", () => {
    hold(true);
    const up = () => {
      hold(false);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  });
  range.addEventListener("change", () => {
    moves.flush();
    release();
  });
  return {
    cell,
    show(v, text, spoken) {
      range.value = String(v);
      range.setAttribute("aria-valuetext", spoken);
      value.textContent = text;
      track.style.setProperty("--f", String((v - min) / (max - min)));
    },
  };
}
export interface AlphaPadOptions {
  /** The drag's cache of diagrams; the `?timing` hook passes its own, which a test can stub. */
  cache?: AlphaCache;
}

let nextId = 0;

/**
 * Builds the pad, the sliders and the switch over the lower plot of `plots` (whose last child is
 * the slice panel) and the value fields in `column` (the α and T_m,B ones in the box, while there
 * is no compound and they fit), and keeps them in sync with `store`.
 */
export function createAlphaPad(
  plots: HTMLElement,
  column: HTMLElement,
  store: Store,
  { cache }: AlphaPadOptions = {},
): void {
  const box = document.createElement("div");
  box.className = "alpha-box";
  const padCell = document.createElement("div");
  padCell.className = "alpha-pad";
  const compoundCell = document.createElement("div");
  compoundCell.className = "alpha-compound";
  compoundCell.setAttribute("role", "group");
  compoundCell.setAttribute("aria-label", "Line compound sliders");
  const lockRow = document.createElement("div");
  lockRow.className = "alpha-lock-row";
  box.append(padCell);
  plots.append(box);
  /** Marks the plots while the knob or a slider is held, which hides the diagram's caption. */
  const hold = (on: boolean) => plots.classList.toggle("alpha-holding", on);

  /** The knob's and the slider's position, which is the store's unless it cannot be computed. */
  let point: AlphaPoint = alphaPointOf(store.state.params);
  const locked = () => store.state.alphaLock;
  /** The compound that *Line Compound* brings back, the last one of this visit to the α mode. */
  let shelved: AlphaCompound = point.compound ?? ALPHA_COMPOUND;
  let failed = false;
  let side = 0;
  /** Whether the box's empty column holds the α and T_m,B fields, while there is no compound. */
  let fieldsFit = false;
  /** What a narrow box (`compound-swap`) shows in the pad's place while there is a compound. */
  let view: "pad" | "compound" = "pad";

  // Made at the first move, so that the Δg^M mode starts no worker.
  let drag: AlphaDrag | null = null;
  const getDrag = () =>
    (drag ??= createAlphaDrag(store, {
      cache,
      active: () => store.state.mode === "alpha",
      onComputed: (ok, p) => {
        if (!samePoint(p, point)) return;
        failed = !ok;
        drawWarning();
      },
    }));

  /** Moves to `next`, and with `settle` shows its full diagram without waiting for a rest. */
  const go = (next: AlphaPoint, settle: boolean) => {
    point = quantise(next);
    draw();
    getDrag().move(point);
    if (settle) getDrag().release();
  };
  const goAlphas = (alphas: Alphas, settle: boolean) =>
    go({ ...point, ...(locked() ? toAxes(alphas) : alphas) }, settle);

  // ---- The pad.
  const svg = select(padCell)
    .append("svg")
    .attr("role", "group")
    .attr("aria-label", "α pad: the interaction parameters α_s and α_l");
  const svgNode = svg.node() as SVGSVGElement;
  const area = svg.append("rect").attr("class", "pad-area").attr("aria-hidden", "true");
  // The four quadrants, (+,+) and (−,−) shaded as a checkerboard, the knob's (`inQuadrant`)
  // shaded more.
  const quadrants = svg
    .append("g")
    .attr("class", "pad-quadrants")
    .attr("aria-hidden", "true")
    .selectAll("rect")
    .data(QUADRANTS)
    .join("rect")
    .attr("class", (q) => (q.s === q.l ? "pad-quadrant same-sign" : "pad-quadrant"))
    .attr("data-quadrant", (q) => `${q.s > 0 ? "+" : "-"}${q.l > 0 ? "+" : "-"}`);
  // In each quadrant's outer corner, the signs of Δh^{M,L} and Δh^{M,S}, under the presets.
  const corners = svg.append("g").attr("class", "pad-corners").attr("aria-hidden", "true");
  const cornerTexts = corners
    .selectAll<SVGTextElement, unknown>("text")
    .data(QUADRANTS.flatMap((q) => cornerLines(q).map((parts, row) => ({ q, row, parts }))))
    .join("text")
    // Coloured by the sign: Δh^{M,L} on the first line has α_l's, Δh^{M,S} on the second α_s's.
    .attr(
      "class",
      ({ q, row }) => `pad-corner ${(row === 0 ? q.l : q.s) > 0 ? "positive" : "negative"}`,
    )
    .attr("data-quadrant", ({ q }) => `${q.s > 0 ? "+" : "-"}${q.l > 0 ? "+" : "-"}`)
    .attr("text-anchor", ({ q }) => (q.s > 0 ? "end" : "start"))
    .each(function ({ parts }) {
      setAxisLabel(this, parts);
    });
  const axes = svg.append("g").attr("class", "pad-axes").attr("aria-hidden", "true");
  const presets = svg.append("g").attr("class", "pad-presets");
  const knob = svg
    .append("g")
    .attr("class", "alpha-knob")
    .attr("role", "slider")
    .attr("tabindex", 0)
    .attr("aria-label", "Interaction parameters α_s and α_l (kJ/mol)")
    .attr("aria-valuemin", -ALPHA_MAX)
    .attr("aria-valuemax", ALPHA_MAX);
  knob
    .append("circle")
    .attr("class", "alpha-knob-target")
    .attr("r", HIT_BAND / 2);
  const ping = knob.append("circle").attr("class", "alpha-knob-ping").attr("r", CUT_KNOB_R);
  knob.node()!.addEventListener("focus", () => ping.remove(), { once: true });
  // The cut handle's solid knob, with a grip of four chevrons: it moves both ways.
  const face = knob.append("g").attr("class", "alpha-knob-face");
  face.append("circle").attr("class", "alpha-knob-dot").attr("r", CUT_KNOB_R);
  face.append("path").attr("class", "alpha-knob-grip").attr("d", ALPHA_GRIP);

  const label = (parts: readonly LabelPart[]) => {
    const text = axes.append<SVGTextElement>("text").attr("class", "pad-label");
    setAxisLabel(text.node()!, parts);
    return text;
  };
  const sLabel = label(AXIS_LABELS.alphaS).attr("text-anchor", "end");
  const lLabel = label(AXIS_LABELS.alphaL).attr("text-anchor", "start");

  presets
    .selectAll("circle")
    .data(GRID_PRESETS)
    .join("circle")
    .attr("class", "pad-preset")
    .attr("data-preset", (p) => p.id)
    .attr("r", PRESET_R)
    .append("title")
    .text((p) => p.label);

  const drawPad = () => {
    svg.attr("width", side).attr("height", side);
    area.attr("width", side).attr("height", side);
    const mid = side / 2;
    quadrants
      .attr("x", (q) => (q.s > 0 ? mid : 0))
      .attr("y", (q) => (q.l > 0 ? 0 : mid))
      .attr("width", mid)
      .attr("height", mid);
    corners.attr("display", side >= CORNER_TEXT ? null : "none");
    cornerTexts
      .attr("x", ({ q }) => (q.s > 0 ? side - CORNER_INSET : CORNER_INSET))
      .attr("y", ({ q, row }) =>
        q.l > 0
          ? CORNER_TOP + row * CORNER_LINE
          : side - CORNER_INSET - 2 - (1 - row) * CORNER_LINE,
      );
    const at = (v: number) => padXY({ alphaS: v, alphaL: 0 }, side).x;
    axes
      .selectAll("line.pad-axis")
      .data([
        [0, mid, side, mid],
        [mid, 0, mid, side],
      ])
      .join("line")
      .attr("class", "pad-axis")
      .attr("x1", (d) => d[0]!)
      .attr("y1", (d) => d[1]!)
      .attr("x2", (d) => d[2]!)
      .attr("y2", (d) => d[3]!);
    // Across under the α_s axis and down left of the α_l axis, with one 0 at the crossing.
    const ticks = [
      ...TICKS.map((v) => ({ v, x: at(v), y: mid, across: true })),
      ...TICKS.map((v) => ({ v, x: mid, y: side - at(v), across: false })),
    ];
    axes
      .selectAll("line.pad-tick")
      .data(ticks)
      .join("line")
      .attr("class", "pad-tick")
      .attr("x1", (d) => (d.across ? d.x : d.x - 3))
      .attr("x2", (d) => (d.across ? d.x : d.x + 3))
      .attr("y1", (d) => (d.across ? d.y - 3 : d.y))
      .attr("y2", (d) => (d.across ? d.y + 3 : d.y));
    axes
      .selectAll("text.pad-tick-label")
      .data([
        ...ticks.filter((d) => side >= ALL_TICK_LABELS || Math.abs(d.v) === ALPHA_MAX),
        { v: 0, x: mid, y: mid, across: true },
      ])
      .join("text")
      .attr("class", "pad-tick-label")
      .attr("text-anchor", (d) => (d.across && d.v !== 0 ? "middle" : "end"))
      .attr("x", (d) => (d.across && d.v !== 0 ? d.x : d.x - 5))
      .attr("y", (d) => (d.across ? d.y + 5 : d.y))
      .attr("dy", (d) => (d.across ? "0.71em" : "0.32em"))
      .text((d) => signed(d.v));
    sLabel.attr("x", side - 2).attr("y", mid - 6);
    lLabel
      .attr("x", mid + 6)
      .attr("y", 4)
      .attr("dy", "0.71em");
    presets
      .selectAll<SVGCircleElement, (typeof GRID_PRESETS)[number]>("circle")
      .attr("cx", (p) => padXY(p.params, side).x)
      .attr("cy", (p) => padXY(p.params, side).y);
  };

  // ---- The T_m,B slider, with its value beside the thumb and T_m,A under it.
  const release = () => getDrag().release();
  const tmb = createSlider(
    "tmb-input",
    "<i>T</i><sub>m,B</sub> (K)",
    "Melting point of B, T_m,B (K)",
    [TMB_MIN, TMB_MAX, TMB_STEP],
    (TmB) => go({ ...point, TmB }, false),
    release,
    hold,
  );
  const note = document.createElement("p");
  note.className = "tmb-note";
  note.innerHTML = "<i>T</i><sub>m,A</sub> = 800 K";
  tmb.cell.append(note);

  // ---- The compound's sliders (§9 phase 19): X_c over its stops' indices, Δh_f and Δs_f.
  const moveCompound = (patch: Partial<AlphaCompound>) => {
    if (point.compound) go({ ...point, compound: { ...point.compound, ...patch } }, false);
  };
  const xc = createSlider(
    "xc",
    "<i>X</i><sub>c</sub>",
    "Composition of the compound, X_c",
    [0, XC_STOPS.length - 1, 1],
    (k) => moveCompound({ Xc: XC_STOPS[k]! }),
    release,
    hold,
  );
  const dhf = createSlider(
    "dhf",
    'Δ<i>h</i><sub>f</sub><span class="unit"><br>(kJ/mol)</span>',
    "Formation enthalpy of the compound, Δh_f (kJ/mol)",
    [DHF_MIN, DHF_MAX, DHF_STEP],
    (v) => moveCompound({ dhf: v }),
    release,
    hold,
  );
  const dsf = createSlider(
    "dsf",
    'Δ<i>s</i><sub>f</sub><span class="unit"><br>(J/(mol·K))</span>',
    "Formation entropy of the compound, Δs_f (J/(mol·K))",
    [DSF_MIN, DSF_MAX, DSF_STEP],
    (v) => moveCompound({ dsf: v }),
    release,
    hold,
  );
  compoundCell.append(xc.cell, dhf.cell, dsf.cell);

  // ---- On a narrow box, the switch between the pad and the compound's sliders in its place.
  const viewSwitch = document.createElement("div");
  viewSwitch.className = "alpha-view";
  viewSwitch.setAttribute("role", "radiogroup");
  viewSwitch.setAttribute("aria-label", "Show in the pad's place");
  const views = (["pad", "compound"] as const).map((v) => {
    const option = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = `alpha-view-${nextId}`;
    radio.value = v;
    const text = document.createElement("span");
    option.append(radio, text);
    viewSwitch.append(option);
    radio.addEventListener("change", () => {
      view = v;
      draw();
    });
    return { v, radio, text };
  });
  views[0]!.text.textContent = "α";
  views[0]!.radio.setAttribute("aria-label", "α pad");
  // Until there is a compound (and in About's copy), c1's.
  views[1]!.text.textContent = alphaFormula(ALPHA_COMPOUND.Xc);
  box.append(lockRow, tmb.cell, compoundCell, viewSwitch);

  // ---- The lock and the warning.
  const lockLabel = document.createElement("label");
  lockLabel.className = "alpha-lock";
  const lockBox = document.createElement("input");
  lockBox.type = "checkbox";
  lockLabel.append(lockBox, "Stay on the axes");
  lockLabel.title = "Keep the knob on the α_s and α_l axes, so that one α changes at a time";
  const compoundLabel = document.createElement("label");
  compoundLabel.className = "alpha-add-compound";
  const compoundBox = document.createElement("input");
  compoundBox.type = "checkbox";
  compoundLabel.append(compoundBox, "Line Compound");
  compoundLabel.title = COMPOUND_TITLE;
  const warning = document.createElement("p");
  warning.className = "alpha-warning";
  warning.setAttribute("aria-live", "polite");
  const rowRight = document.createElement("div");
  rowRight.className = "alpha-row-right";
  rowRight.append(compoundLabel, warning);
  lockRow.append(lockLabel, rowRight);
  // Unticking keeps the compound, which ticking again within this visit brings back. On a narrow
  // box, ticking shows its sliders in the pad's place.
  compoundBox.addEventListener("change", () => {
    if (point.compound) shelved = point.compound;
    view = compoundBox.checked ? "compound" : "pad";
    go({ ...point, compound: compoundBox.checked ? shelved : null }, true);
  });
  // Ticking it again moves the knob to the nearest axis.
  lockBox.addEventListener("change", () => {
    store.setAlphaLock(lockBox.checked);
    if (locked() && !onAxes(point)) goAlphas(point, true);
  });

  // ---- The value fields in the side column.
  const inputs = document.createElement("div");
  inputs.className = "alpha-inputs";
  inputs.setAttribute("role", "group");
  inputs.setAttribute("aria-label", "α mode values");
  const FIELDS: readonly {
    field: AlphaField;
    html: string;
    name: string;
    step: number | "any";
    range: readonly [number, number];
  }[] = [
    {
      field: "alphaS",
      html: '<i>α</i><sub>s</sub><span class="unit"> (kJ/mol)</span>',
      name: "α_s (kJ/mol)",
      step: ALPHA_STEP,
      range: [-ALPHA_MAX, ALPHA_MAX],
    },
    {
      field: "alphaL",
      html: '<i>α</i><sub>l</sub><span class="unit"> (kJ/mol)</span>',
      name: "α_l (kJ/mol)",
      step: ALPHA_STEP,
      range: [-ALPHA_MAX, ALPHA_MAX],
    },
    {
      field: "TmB",
      html: '<i>T</i><sub>m,B</sub><span class="unit"> (K)</span>',
      name: "T_m,B (K)",
      step: TMB_STEP,
      range: [TMB_MIN, TMB_MAX],
    },
    // The compound's, shown while it is there; X_c is typed as a number and goes to the nearest
    // stop.
    {
      field: "Xc",
      html: "<i>X</i><sub>c</sub>",
      name: "X_c",
      step: "any",
      range: [XC_STOPS[0]!, XC_STOPS.at(-1)!],
    },
    {
      field: "dhf",
      html: "Δ<i>h</i><sub>f</sub> (kJ/mol)",
      name: "Δh_f (kJ/mol)",
      step: DHF_STEP,
      range: [DHF_MIN, DHF_MAX],
    },
    {
      field: "dsf",
      html: "Δ<i>s</i><sub>f</sub> (J/(mol·K))",
      name: "Δs_f (J/(mol·K))",
      step: DSF_STEP,
      range: [DSF_MIN, DSF_MAX],
    },
  ];
  /** A field's value at `p`, or null for a compound field without a compound; X_c to 3 places. */
  const fieldValue = (field: AlphaField, p: AlphaPoint): string | null => {
    if (field === "alphaS" || field === "alphaL" || field === "TmB") return String(p[field]);
    if (!p.compound) return null;
    return field === "Xc" ? p.compound.Xc.toFixed(3) : String(p.compound[field]);
  };
  const numbers = FIELDS.map(({ field, html, name, step, range: [min, max] }) => {
    const row = document.createElement("label");
    const text = document.createElement("span");
    text.innerHTML = html;
    const number = document.createElement("input");
    number.type = "number";
    number.className = "field-input";
    number.name = field;
    number.step = String(step);
    number.inputMode = "decimal";
    number.min = String(min);
    number.max = String(max);
    number.setAttribute("aria-label", name);
    row.append(text, number);
    inputs.append(row);
    // Enter or leaving the field applies it; a value that is not a number shows the last again.
    number.addEventListener("change", () => {
      const next = typedPoint(field, number.valueAsNumber, point, locked());
      if (next) go(next, true);
      number.value = fieldValue(field, point) ?? "";
    });
    return { field, row, number };
  });
  const cutInput = column.querySelector(".cut-input");
  if (cutInput) cutInput.after(inputs);
  else column.prepend(inputs);
  // Without a compound the box's empty column holds the α and T_m,B fields, where they fit.
  const boxFields = document.createElement("div");
  boxFields.className = "alpha-box-fields";
  boxFields.setAttribute("role", "group");
  boxFields.setAttribute("aria-label", "α mode values");
  boxFields.hidden = true;
  box.append(boxFields);
  const moving = numbers.slice(0, 3);
  /** Puts the α and T_m,B fields in the box or the side column, but not while one is in use. */
  const placeFields = (inBox: boolean) => {
    const home = inBox ? boxFields : inputs;
    if (moving.some(({ row }) => row.parentElement === home)) return;
    if (moving.some(({ number }) => document.activeElement === number)) return;
    if (inBox) boxFields.append(...moving.map(({ row }) => row));
    else inputs.prepend(...moving.map(({ row }) => row));
    boxFields.hidden = !inBox;
    inputs.hidden = inBox;
  };
  /** Where the fields belong now: in the box while there is no compound and they fit. */
  const fieldsInBox = () => point.compound === null && fieldsFit;
  // One kept in place while in use goes once it is left.
  for (const { number } of moving) {
    number.addEventListener("blur", () => placeFields(fieldsInBox()));
  }

  // ---- Pointer and keyboard on the pad.
  const pointerAlphas = (event: PointerEvent, offset: { x: number; y: number }) => {
    const rect = svgNode.getBoundingClientRect();
    return alphasAt(
      event.clientX - rect.left + offset.x,
      event.clientY - rect.top + offset.y,
      side,
    );
  };
  // A drag (not the keys, which would stick) is pulled slightly onto a grid preset's dot; under
  // the lock, only onto one on the axes. With a compound the dots are hidden, and pull nothing.
  const dragged = (alphas: Alphas) => {
    const p = locked() ? toAxes(alphas) : alphas;
    if (point.compound) return p;
    const targets = GRID_PRESETS.map((q) => q.params).filter((q) => !locked() || onAxes(q));
    return snapAlphas(p, targets, side, PRESET_MAGNET_PX);
  };
  const moves = perFrame((alphas: Alphas) => goAlphas(dragged(alphas), false));
  let held: { pointerId: number; offset: { x: number; y: number } } | null = null;

  svgNode.addEventListener("pointerdown", (event) => {
    if (held || side === 0) return;
    // Grabbed off-centre, the knob keeps its offset; pressed elsewhere, it jumps to the pointer.
    const onKnob = knob.node()!.contains(event.target as Node);
    const rect = svgNode.getBoundingClientRect();
    const xy = padXY(point, side);
    const offset = onKnob
      ? { x: xy.x - (event.clientX - rect.left), y: xy.y - (event.clientY - rect.top) }
      : { x: 0, y: 0 };
    held = { pointerId: event.pointerId, offset };
    svgNode.setPointerCapture(event.pointerId);
    svgNode.classList.add("alpha-dragging");
    hold(true);
    event.preventDefault();
    knob.node()!.focus({ preventScroll: true });
    if (!onKnob) moves.push(pointerAlphas(event, offset));
  });
  svgNode.addEventListener("pointermove", (event) => {
    if (event.pointerId === held?.pointerId) moves.push(pointerAlphas(event, held.offset));
  });
  const onEnd = (event: PointerEvent) => {
    if (event.pointerId !== held?.pointerId) return;
    // A release is where the pointer was let go; a cancel keeps the last move.
    if (event.type === "pointerup") moves.push(pointerAlphas(event, held.offset));
    moves.flush();
    held = null;
    svgNode.classList.remove("alpha-dragging");
    hold(false);
    getDrag().release();
  };
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"] as const) {
    svgNode.addEventListener(type, onEnd);
  }
  knob.node()!.addEventListener("keydown", (event) => {
    const next = alphasAfterKey(event.key, event.shiftKey, point, locked());
    if (!next) return;
    event.preventDefault();
    go({ ...point, ...next }, true);
  });

  // ---- Drawing.
  const drawWarning = () => {
    knob.classed("failed", failed);
    warning.textContent = failed ? CANNOT_COMPUTE : "";
  };

  function draw() {
    const { x, y } = padXY(point, side);
    knob
      .attr("transform", `translate(${x},${y})`)
      .attr("aria-valuenow", point.alphaS)
      .attr("aria-valuetext", knobText(point));
    quadrants.classed("active", (q) => inQuadrant(q, point));
    tmb.show(point.TmB, String(point.TmB), `${point.TmB} K`);
    const c = point.compound;
    compoundBox.checked = c !== null;
    compoundCell.hidden = c === null;
    viewSwitch.hidden = c === null;
    box.classList.toggle("show-compound", c !== null && view === "compound");
    for (const { v, radio } of views) radio.checked = v === view;
    // The grid presets have no compound, so their dots go while there is one.
    presets.attr("display", c ? "none" : null);
    if (c) {
      xc.show(xcStop(c.Xc), alphaFormula(c.Xc), xcText(c.Xc));
      views[1]!.text.textContent = alphaFormula(c.Xc);
      views[1]!.radio.setAttribute("aria-label", `${alphaFormula(c.Xc)} sliders`);
      dhf.show(c.dhf, signed(c.dhf), `${signed(c.dhf)} kJ/mol`);
      dsf.show(c.dsf, signed(c.dsf), `${signed(c.dsf)} J/(mol·K)`);
    }
    placeFields(fieldsInBox());
    for (const { field, row, number } of numbers) {
      const v = fieldValue(field, point);
      row.hidden = v === null;
      if (v !== null && document.activeElement !== number) number.value = v;
    }
  }

  /**
   * Each time the mode opens, from the Δg^M mode's parameters `from`: the store's position, the
   * lock as the store has it (unticked, unless a link ticks it), the pad (on a narrow box), no
   * warning, and *Line Compound*
   * ticked for a line compound; for a compound with a range, which the store dropped, its tooltip
   * says why. A knob off the axes stays there until it is moved.
   */
  const open = (from?: Params) => {
    point = alphaPointOf(store.state.params);
    shelved = point.compound ?? ALPHA_COMPOUND;
    compoundLabel.title = from?.compound?.width === "range" ? RANGE_DROPPED : COMPOUND_TITLE;
    lockBox.checked = locked();
    view = "pad";
    failed = false;
    drawWarning();
    draw();
  };
  open();
  store.subscribe((state, prev) => {
    if (state.mode === "alpha" && prev.mode !== "alpha") open(prev.params);
    else if (state.alphaLock !== prev.alphaLock) lockBox.checked = state.alphaLock;
  });

  // The pad is as high as the lower plot's box, but for the gap and the lock's row above it and
  // the gap under it.
  attachPanel(plots, store, (size) => {
    const height = SLICE_MARGIN.top + size.height + SLICE_MARGIN.bottom;
    side = height - PAD_TOP - LOCK_ROW - PAD_BOTTOM;
    box.style.height = `${height}px`;
    let width = size.width + MARGIN.right;
    // Upright where the empty column is wide enough; else flat, where it and the pad hold three;
    // else upright in the pad's place, behind the switch (§9 phase 19).
    let free = width - side - TMB_COLUMN - 2 * COLUMN_GAP;
    const swap = free < UPRIGHT_MIN && (side < FLAT_MIN || free < FLAT_WIDTH_MIN);
    // Where that leaves the switch or the fields too little room (under about 400 px), the box reaches left
    // under the diagram's T axis, as far as its margin.
    const reach = swap ? Math.min(MARGIN.left, Math.max(0, COLUMN_LEAST - free)) : 0;
    width += reach;
    free += reach;
    // Still short (under about 330 px), the gaps and the T_m,B column narrow, T_m,A's note goes;
    // then the pad, down to the three sliders' width.
    const tight = swap && free < COLUMN_LEAST;
    if (tight) {
      free += TMB_COLUMN - TMB_TIGHT + 2 * (COLUMN_GAP - GAP_TIGHT);
      const shrink = Math.min(Math.max(0, COLUMN_LEAST - free), Math.max(0, side - SWAP_LEAST));
      side -= shrink;
      free += shrink;
    }
    box.classList.toggle("compound-tight", tight);
    box.style.setProperty("--pad", `${side}px`);
    box.style.left = `${MARGIN.left - reach}px`;
    box.style.width = `${width}px`;
    box.classList.toggle("compound-flat", free < UPRIGHT_MIN && !swap);
    box.classList.toggle("compound-swap", swap);
    box.classList.toggle("row-from-tmb", free < ROW_LABEL_MIN);
    box.classList.toggle("narrow-row", free < ROW_WARNING_MIN);
    // The fields with their units where the column has room, else without, and on two lines
    // each (name over field) where it is narrower still.
    fieldsFit = free >= FIELDS_STACKED_MIN;
    box.classList.toggle("fields-units", free >= FIELDS_UNITS_MIN);
    box.classList.toggle("fields-stacked", free < FIELDS_MIN);
    drawPad();
    draw();
  });
}
