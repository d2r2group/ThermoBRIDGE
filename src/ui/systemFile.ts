// The system as a file and as a link (plan §8 rows 17–19), adapted from pTerrain's
// ui/substanceFile.ts: the name it is applied with, the JSON file that Export writes and Import
// reads, its download name, and the short positional fragment of a share link, each with the
// optional compound (§9 phase 13). No DOM here.

import { autoWindow } from "../physics/autoWindow";
import type { Compound, Params } from "../physics/gibbs";
import type { PlotWindow } from "../physics/plotWindow";
import { PRESETS, type PresetId } from "../physics/presets";
import type { Components, State } from "./state";
import {
  cleanComponent,
  cutText,
  DEFAULT_COMPOUND,
  FIELDS,
  matchPreset,
  recordOf,
} from "./systemFields";

/** A system as the panel applies it: its name, components, parameters, window and *auto* box. */
export interface SystemSpec {
  name: string;
  components: Components;
  params: Params;
  window: PlotWindow;
  /** Whether the window was applied with *auto* ticked, so that it is `autoWindow(params)`. */
  auto: boolean;
}

/** The applied system, which Export and Share write: not unapplied edits. */
export function appliedSystem({
  name,
  components,
  params,
  window,
  auto,
}: Readonly<State>): SystemSpec {
  return { name, components, params, window, auto };
}

/** The view a link opens on: the cut T* (K), and the lever rule's X₀ while it is on. */
export interface View {
  cut: number;
  X0?: number;
}

/** A link that opens in the α mode (plan §9 phase 18), with *Stay on the axes* ticked or not. */
export interface AlphaTail {
  alpha: { locked: boolean };
}

/** What a link carries after its system: the Δg^M mode's view, or the α mode in place of one. */
export type LinkTail = View | AlphaTail;

/** Whether `tail` opens the α mode. */
export const isAlphaTail = (tail: LinkTail): tail is AlphaTail => "alpha" in tail;

/** What a parser returns: the value, or the first problem, for a one-line warning. */
export type Parsed<T> = { ok: true; value: T } | { ok: false; problem: string };

/** The longest name the Name field takes. */
export const NAME_MAX = 40;

/** The name of a system that has none. */
export const CUSTOM_NAME = "Custom";

/** Marks a name that would otherwise be a preset's label on a system that is not that preset. */
export const CLASH_SUFFIX = " (custom)";

/**
 * The name that is applied for `typed`: trimmed and cut to NAME_MAX code points, *Custom* if empty. A preset's
 * label, in any case, names only that preset: on the preset it applies as the label itself, and
 * on any other system with CLASH_SUFFIX, so an edit of a preset keeps its name but no longer
 * claims to be it.
 */
export function cleanName(
  typed: string,
  system: Pick<SystemSpec, "params" | "window" | "components">,
): string {
  const name = cutText(typed.trim(), NAME_MAX).trim() || CUSTOM_NAME;
  const owner = PRESETS.find((p) => p.label.toLowerCase() === name.toLowerCase());
  if (!owner) return name;
  if (matchPreset(system.params, system.window, system.components) === owner.id) return owner.label;
  return cutText(name, NAME_MAX - CLASH_SUFFIX.length).trim() + CLASH_SUFFIX;
}

const FORMAT = "thermobridge-system";
const VERSION = 1;

/** The parameters in the file's and the link's order, then the window edges. */
const PARAM_KEYS = ["TmA", "TmB", "dsA", "dsB", "alphaL", "alphaS"] as const;
const WINDOW_KEYS = ["Tmin", "Tmax"] as const;
/** The compound's numbers, in the file's and the link's order; the link writes α_γ last. */
const COMPOUND_KEYS = ["Xc", "dhf", "dsf"] as const;

/** For a reader of the file, from the Parameters panel's fields; ignored on import. */
const UNITS = {
  ...recordOf(
    [...PARAM_KEYS, ...WINDOW_KEYS, "dhf", "dsf", "alphaG"] as const,
    (key) => FIELDS.find((f) => f.key === key)!.unit,
  ),
  Xc: "mole fraction of B",
};

/**
 * The system file: pretty-printed JSON in the model's units, with `compound` null for a system
 * without one.
 */
export function toSystemFile({ name, components, params, window, auto }: SystemSpec): string {
  const c = params.compound;
  const file = {
    format: FORMAT,
    version: VERSION,
    name,
    components: { A: components.A, B: components.B },
    params: Object.fromEntries(PARAM_KEYS.map((k) => [k, params[k]])),
    compound: c ? { Xc: c.Xc, dhf: c.dhf, dsf: c.dsf, width: c.width, alphaG: c.alphaG } : null,
    window: { Tmin: window.Tmin, Tmax: window.Tmax },
    autoWindow: auto,
    units: UNITS,
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** The numbers under `keys` of `object`, or the first one that is missing or not finite. */
function numbers<K extends string>(
  object: unknown,
  path: string,
  keys: readonly K[],
): Parsed<Record<K, number>> {
  if (!isObject(object)) return { ok: false, problem: `${path} is missing` };
  const values = new Map<K, number>();
  for (const key of keys) {
    const x = object[key];
    if (typeof x !== "number" || !Number.isFinite(x)) {
      return { ok: false, problem: `${path}.${key} is missing or not a finite number` };
    }
    values.set(key, x);
  }
  return { ok: true, value: recordOf(keys, (key) => values.get(key)!) };
}

/**
 * A file's compound: none for an absent or null key, else its numbers and width. α_γ may be left
 * out for a line, which ignores it.
 */
function parseCompound(x: unknown): Parsed<Compound | null> {
  if (x === undefined || x === null) return { ok: true, value: null };
  if (!isObject(x)) return { ok: false, problem: "compound is not an object or null" };
  const { width } = x;
  if (width !== "line" && width !== "range") {
    return { ok: false, problem: 'compound.width is not "line" or "range"' };
  }
  const values = numbers(x, "compound", COMPOUND_KEYS);
  if (!values.ok) return values;
  let alphaG = DEFAULT_COMPOUND.alphaG;
  if (width === "range" || x.alphaG !== undefined) {
    const a = numbers(x, "compound", ["alphaG"] as const);
    if (!a.ok) return a;
    alphaG = a.value.alphaG;
  }
  return { ok: true, value: { ...values.value, width, alphaG } };
}

/** The system in a file's text, or the first problem with it; unknown keys are ignored. */
export function parseSystemFile(text: string): Parsed<SystemSpec> {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return { ok: false, problem: "it is not JSON" };
  }
  if (!isObject(file)) return { ok: false, problem: "it is not a JSON object" };
  if (file.format !== FORMAT) return { ok: false, problem: `its format is not "${FORMAT}"` };
  if (file.version !== VERSION) {
    return { ok: false, problem: `version ${JSON.stringify(file.version)} is not supported` };
  }
  if (typeof file.name !== "string") return { ok: false, problem: "its name is not a string" };
  if (!isObject(file.components)) return { ok: false, problem: "components is missing" };
  const { A, B } = file.components;
  if (typeof A !== "string") return { ok: false, problem: "components.A is not a string" };
  if (typeof B !== "string") return { ok: false, problem: "components.B is not a string" };
  const numeric = numbers(file.params, "params", PARAM_KEYS);
  if (!numeric.ok) return numeric;
  const compound = parseCompound(file.compound);
  if (!compound.ok) return compound;
  const params = withCompound(numeric.value, compound.value);
  const window = numbers(file.window, "window", WINDOW_KEYS);
  if (!window.ok) return window;
  if (typeof file.autoWindow !== "boolean") {
    return { ok: false, problem: "autoWindow is not true or false" };
  }
  return { ok: true, value: spec(file.name, A, B, params, window.value, file.autoWindow) };
}

/** `params` with `compound`, or without the key for none, as a preset without one has none. */
function withCompound(params: Params, compound: Compound | null): Params {
  return compound ? { ...params, compound } : params;
}

/** A system with its names cleaned as Apply cleans them. */
function spec(
  name: string,
  A: string,
  B: string,
  params: Params,
  window: PlotWindow,
  auto: boolean,
): SystemSpec {
  const components = { A: cleanComponent(A, "A"), B: cleanComponent(B, "B") };
  return {
    name: cleanName(name, { params, window, components }),
    components,
    params,
    window,
    auto,
  };
}

/**
 * The download name: the name reduced to letters, digits, `-` and `_` (after NFKD, so *α₁* gives
 * `α1`, and with spaces as `_`), or `system.json` if nothing is left.
 */
export function fileName(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_-]/gu, "");
  return `${base || "system"}.json`;
}

/** A number in a link: its shortest exact form, with a leading `0.` cut to `.`. */
function linkNumber(x: number): string {
  return String(x).replace(/^(-?)0\./, "$1.");
}

/** A view value in a link (T* or X₀): 4 significant figures. */
function linkView(x: number): string {
  return linkNumber(Number(x.toPrecision(4)));
}

/** A decimal number as `String` writes it, or as typed, with or without the leading 0. */
const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/**
 * The preset that `system` is in parameters, components and, unless `alpha`, window and name, or
 * null.
 */
function presetOf(system: SystemSpec, alpha = false): PresetId | null {
  const id = matchPreset(system.params, alpha ? null : system.window, system.components);
  if (!id) return null;
  return alpha || PRESETS.find((p) => p.id === id)?.label === system.name ? id : null;
}

/**
 * The fragment of a share link, with its `#`: a preset's id when parameters, window, components
 * and name are the preset's, otherwise `1,<name>,<A>,<B>,<6 parameters>[,<Tmin>,<Tmax>]`, the
 * window left out when it is automatic, and with a compound `;C,<X_c>,<Δh_f>,<Δs_f>,<α_γ or l>`
 * (`l` for a line); then `;T,<T*>` and, while the lever rule is on, `;X,<X₀>` for the view, or
 * `;A` for the α mode, `;A,l` with *Stay on the axes* ticked. A link to the α mode gives a
 * preset's id whatever the name and window, since that mode names its systems from their values
 * and sets its own window.
 */
export function toLink(system: SystemSpec, tail?: LinkTail): string {
  const { name, components, params, window, auto } = system;
  const alpha = tail && isAlphaTail(tail) ? tail.alpha : null;
  let text: string | null = presetOf(system, alpha !== null);
  if (!text) {
    const c = params.compound;
    const numbers = [
      ...PARAM_KEYS.map((k) => params[k]),
      ...(auto ? [] : [window.Tmin, window.Tmax]),
    ];
    text = [
      String(VERSION),
      ...[name, components.A, components.B].map(encodeURIComponent),
      ...numbers.map(linkNumber),
    ].join(",");
    if (c) {
      const last = c.width === "line" ? "l" : linkNumber(c.alphaG);
      text += `;C,${[...COMPOUND_KEYS.map((k) => linkNumber(c[k])), last].join(",")}`;
    }
  }
  if (alpha) text += alpha.locked ? ";A,l" : ";A";
  else if (tail && !isAlphaTail(tail)) {
    text += `;T,${linkView(tail.cut)}`;
    if (tail.X0 !== undefined) text += `;X,${linkView(tail.X0)}`;
  }
  return `#${text}`;
}

function linkValue(text: string, label: string): Parsed<number> {
  const x = Number(text);
  if (!NUMBER.test(text) || !Number.isFinite(x)) {
    return { ok: false, problem: `${label} is not a finite number` };
  }
  return { ok: true, value: x };
}

/** The α mode's part of a link: `A`, or `A,l` with *Stay on the axes* ticked. */
function parseAlpha(part: string): Parsed<AlphaTail> {
  if (part === "A") return { ok: true, value: { alpha: { locked: false } } };
  if (part === "A,l") return { ok: true, value: { alpha: { locked: true } } };
  return { ok: false, problem: "its α mode is not A or A,l" };
}

/** What follows a link's system: `A` or `A,l`, or the view, `T,<T*>` then optionally `X,<X₀>`. */
function parseTail(parts: readonly string[]): Parsed<LinkTail | undefined> {
  if (parts.length === 0) return { ok: true, value: undefined };
  const alphaAt = parts.findIndex((part) => part.split(",")[0] === "A");
  if (alphaAt >= 0) {
    if (parts.length > 1) return { ok: false, problem: "it has both a view and the α mode" };
    return parseAlpha(parts[0]!);
  }
  const [cutPart, leverPart] = parts as [string, string | undefined];
  const cutItems = cutPart.split(",");
  if (cutItems.length !== 2 || cutItems[0] !== "T") {
    return { ok: false, problem: "its view is not T,<T*>" };
  }
  const cut = linkValue(cutItems[1] as string, "the cut");
  if (!cut.ok) return cut;
  if (leverPart === undefined) return { ok: true, value: { cut: cut.value } };
  const leverItems = leverPart.split(",");
  if (leverItems.length !== 2 || leverItems[0] !== "X") {
    return { ok: false, problem: "its lever rule is not X,<X₀>" };
  }
  const X0 = linkValue(leverItems[1] as string, "X₀");
  if (!X0.ok) return X0;
  if (X0.value < 0 || X0.value > 1) return { ok: false, problem: "X₀ is not between 0 and 1" };
  return { ok: true, value: { cut: cut.value, X0: X0.value } };
}

/** A link's compound part, `C,<X_c>,<Δh_f>,<Δs_f>,<α_γ or l>`. */
function parseLinkCompound(part: string): Parsed<Compound> {
  const items = part.split(",");
  if (items.length !== 5) {
    return { ok: false, problem: `its compound has ${items.length - 1} values, not 4` };
  }
  const values: number[] = [];
  for (const [k, key] of COMPOUND_KEYS.entries()) {
    const x = linkValue(items[k + 1]!, key);
    if (!x.ok) return x;
    values.push(x.value);
  }
  const [Xc, dhf, dsf] = values as [number, number, number];
  const last = items[4]!;
  if (last === "l") {
    return { ok: true, value: { Xc, dhf, dsf, width: "line", alphaG: DEFAULT_COMPOUND.alphaG } };
  }
  const alphaG = linkValue(last, "α_γ");
  if (!alphaG.ok) return { ok: false, problem: "its compound's width is not l or a number" };
  return { ok: true, value: { Xc, dhf, dsf, width: "range", alphaG: alphaG.value } };
}

/**
 * The system in a link's fragment (with or without its `#`) and its view, or `alpha` for a link
 * that opens the α mode; or the first problem.
 */
export function parseLink(
  fragment: string,
): Parsed<{ system: SystemSpec; view?: View; alpha?: AlphaTail["alpha"] }> {
  const text = fragment.replace(/^#/, "");
  if (text === "") return { ok: false, problem: "it is empty" };
  const [head, ...parts] = text.split(";") as [string, ...string[]];
  // The compound's part, if any, comes first after the system, and then the view's two at most,
  // or the α mode's one.
  const compoundPart = parts[0]?.startsWith("C,") ? parts[0] : null;
  const tail = compoundPart === null ? parts : parts.slice(1);
  if (tail.length > 2) {
    return { ok: false, problem: `it has more than ${compoundPart ? "three" : "two"} ;` };
  }
  const parsedTail = parseTail(tail);
  if (!parsedTail.ok) return parsedTail;
  const tailValue = parsedTail.value;
  const after = !tailValue ? {} : isAlphaTail(tailValue) ? tailValue : { view: tailValue };
  let compound: Compound | null = null;
  if (compoundPart !== null) {
    const c = parseLinkCompound(compoundPart);
    if (!c.ok) return c;
    compound = c.value;
  }

  const [first, ...rest] = head.split(",") as [string, ...string[]];
  if (first !== String(VERSION)) {
    const p = PRESETS.find((q) => q.id === first);
    if (p) {
      if (rest.length > 0) return { ok: false, problem: `the preset id ${first} takes no numbers` };
      if (compound) return { ok: false, problem: `the preset id ${first} takes no compound` };
      const system = spec(p.label, "A", "B", p.params, p.window, false);
      return { ok: true, value: { system, ...after } };
    }
    return {
      ok: false,
      problem: /^\d+$/.test(first)
        ? `version ${first} is not supported`
        : `unknown system "${first}"`,
    };
  }
  if (rest.length < 3) return { ok: false, problem: "it lacks the name and the component names" };
  const [nameText, AText, BText, ...numberTexts] = rest as [string, string, string, ...string[]];
  const count = numberTexts.length;
  const full = PARAM_KEYS.length + WINDOW_KEYS.length;
  if (count !== PARAM_KEYS.length && count !== full) {
    return { ok: false, problem: `it has ${count} numbers, not ${PARAM_KEYS.length} or ${full}` };
  }
  let names: string[];
  try {
    names = [nameText, AText, BText].map(decodeURIComponent);
  } catch {
    return { ok: false, problem: "a name is not encoded right" };
  }
  const values = new Map<string, number>();
  for (const [k, key] of [...PARAM_KEYS, ...WINDOW_KEYS].slice(0, count).entries()) {
    const x = linkValue(numberTexts[k]!, key);
    if (!x.ok) return x;
    values.set(key, x.value);
  }
  const value = (key: string) => values.get(key)!;
  const params = withCompound(recordOf(PARAM_KEYS, value), compound);
  const auto = count === PARAM_KEYS.length;
  const window = auto ? autoWindow(params) : recordOf(WINDOW_KEYS, value);
  const [name, A, B] = names as [string, string, string];
  return { ok: true, value: { system: spec(name, A, B, params, window, auto), ...after } };
}
