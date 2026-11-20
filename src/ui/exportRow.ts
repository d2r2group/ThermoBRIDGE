// The export row above the Parameters panel (plan §9 phases 20–21): Export TDB saves the system
// as a CALPHAD database, Export figure(s) the plots as SVG or PNG images, each as one ZIP with the system's JSON
// file. Outside the panel's form, so both work with the panel closed and in the α mode, which
// exports its system as the Δg^M mode would show it (`Store.dgState`). Figure's menu holds the
// cuts (the current cut, named by its T, or the N unique cuts: each cut of `seriesCuts`, from the
// top of the window down), the plot size and the PNG's DPI; a DPI too large for the figure is
// lowered, and a note under Figure says so.

import { report, setLabel } from "./buttons";
import { seriesCuts, seriesName } from "./cutSeries";
import {
  addMetadata,
  buildFigures,
  DEFAULT_PLOT_SIZE,
  PLOT_SIZES,
  pngOf,
  svgText,
  type FigureFormat,
  type FigurePlots,
} from "./figure";
import { formatInvariantT } from "./format";
import type { PlotSize } from "./geometry";
import { DATABASE, DOWNLOAD, PICTURE } from "./icons";
import { DEFAULT_DPI, DPIS, fittingDpi } from "./png";
import { stateAtCut, type State, type Store } from "./state";
import { appliedSystem, fileName, toLink, toSystemFile } from "./systemFile";
import { download } from "./systemIO";
import { toTdb } from "./tdb";
import { zip, type ZipEntry } from "./zip";

/** The share link of `state`, the Δg^M mode's: its system, its cut and, with the lever, X₀. */
function linkOf(state: Readonly<State>): string {
  const view = state.showLever ? { cut: state.cut, X0: state.X0 } : { cut: state.cut };
  return location.href.replace(/#.*$/, "") + toLink(appliedSystem(state), view);
}

/** What an export writes for `state`, the Δg^M mode's: its system, file base name and link. */
function exportOf(state: Readonly<State>) {
  const system = appliedSystem(state);
  const base = fileName(system.name).replace(/\.json$/, "");
  return { system, link: linkOf(state), base, json: toSystemFile(system) };
}

/** Downloads `entries` as `<base>.zip`. */
function saveZip(base: string, entries: ZipEntry[]): void {
  const bytes = zip(entries);
  download(
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/zip" }),
    `${base}.zip`,
  );
}

/** The ZIP of the TDB export: `<base>.tdb` and `<base>.json`. */
export function exportTdb(state: Readonly<State>): void {
  const { system, link, base, json } = exportOf(state);
  saveZip(base, [
    { name: `${base}.tdb`, data: toTdb(system, link) },
    { name: `${base}.json`, data: json },
  ]);
}

/** What the Figure menu chose: a series or not, the plot size and the PNG's DPI. */
export interface FigureOptions {
  series?: boolean;
  size?: PlotSize;
  dpi?: number;
}

/**
 * The ZIP of the figure export: the three images in `format`, then `<base>.json`, at the plot size
 * `size`. With `series`, `<base>-series.zip` with the three images at each cut of `seriesCuts`,
 * named by their kind first and then the cut, `<base>-<both|diagram|slice>-<nn>-<T>K`, so that
 * they sort by kind and then by T, decreasing; each carries the link to its own cut. A PNG is
 * drawn at `dpi`, or, when the largest image would pass MAX_PNG_PIXELS at it, every image at the
 * largest DPI that fits (`fittingDpi`). Returns the DPI the PNGs were drawn at.
 */
export async function exportFigure(
  store: Store,
  plots: FigurePlots,
  format: FigureFormat,
  { series = false, size = DEFAULT_PLOT_SIZE, dpi = DEFAULT_DPI }: FigureOptions = {},
): Promise<{ dpi: number }> {
  // Text is measured in Lato, not a fallback font, so that the export is the same everywhere.
  await document.fonts?.ready;
  const dg = store.dgState();
  const { system, base, json } = exportOf(dg);
  const views = series
    ? seriesCuts(dg.diagram.scan.events, dg.window).map(({ T }) => stateAtCut(dg, T))
    : [dg];
  const figures = buildFigures(plots, views, store.state, size);
  const used =
    format === "png"
      ? fittingDpi(
          figures.flat().map(({ svg }) => ({
            width: Number(svg.getAttribute("width")),
            height: Number(svg.getAttribute("height")),
          })),
          dpi,
        )
      : dpi;
  const entries: ZipEntry[] = [];
  // By kind, then by cut.
  for (const kind of figures[0]?.keys() ?? []) {
    for (const [k, images] of figures.entries()) {
      const view = views[k]!;
      const { suffix, svg } = images[kind]!;
      addMetadata(svg, system.name, system.params, linkOf(view));
      // The whole figure, which has no suffix of its own, is "both" in a series.
      const stem = series
        ? `${base}${suffix || "-both"}-${seriesName(k, view.cut)}`
        : base + suffix;
      entries.push({
        name: `${stem}.${format}`,
        data: format === "svg" ? svgText(svg) : await pngOf(svg, used),
      });
    }
  }
  entries.push({ name: `${base}.json`, data: json });
  saveZip(series ? `${base}-series` : base, entries);
  return { dpi: used };
}

const FORMATS: readonly { format: FigureFormat; text: string; title: string }[] = [
  {
    format: "svg",
    text: "SVG",
    title: "Vector images at the size chosen above, with the text as text",
  },
  { format: "png", text: "PNG", title: "Images at the size and resolution chosen above" },
];

/** What the note under Figure says when the DPI was lowered from `chosen` to `used`. */
export const loweredDpiText = (used: number, chosen: number) =>
  `Saved at ${used} DPI: ${chosen} DPI is more than this browser can draw for a figure this size.`;

/** A plot size as the menu writes it. */
const sizeText = ({ width, height }: PlotSize) => `${width} × ${height}`;

/**
 * Appends the row to `container`: TDB, and Figure with its menu: the cuts, the plot sizes, the
 * DPIs, then the formats, and the note under Figure. `plots` gives the plots once they are built,
 * after the row.
 */
export function createExportRow(
  container: HTMLElement,
  store: Store,
  plots: () => FigurePlots,
): void {
  const row = document.createElement("div");
  row.className = "export-row";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", "TDB and figure export");
  const tdb = document.createElement("button");
  tdb.type = "button";
  tdb.className = "btn tdb";
  setLabel(tdb, DATABASE, "Export TDB");
  tdb.title = "Export the applied system as a CALPHAD database, with its JSON file";

  const box = document.createElement("div");
  box.className = "figure-box";
  const figure = document.createElement("button");
  figure.type = "button";
  figure.className = "btn figure";
  setLabel(figure, PICTURE, "Export figure(s)…");
  figure.title =
    "Choose the cuts, size and format, then export the plots as SVG or PNG images, with the " +
    "system's JSON file";
  figure.setAttribute("aria-haspopup", "menu");
  figure.setAttribute("aria-expanded", "false");
  const menu = document.createElement("div");
  menu.className = "figure-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Figure format");
  menu.hidden = true;
  /**
   * A group of `menuitemradio`s named `label`, exactly one checked, `first` at first; choosing one
   * keeps the menu open. `chosen` gives the index of the checked one.
   */
  const radioGroup = (cls: string, label: string, texts: readonly string[], first: number) => {
    const group = document.createElement("div");
    group.className = `choice ${cls}`;
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", label);
    const radios = texts.map((text, k) => {
      const item = document.createElement("button");
      item.type = "button";
      item.setAttribute("role", "menuitemradio");
      item.setAttribute("aria-checked", String(k === first));
      item.textContent = text;
      item.tabIndex = -1;
      item.addEventListener("click", () => {
        for (const r of radios) r.setAttribute("aria-checked", String(r === item));
      });
      group.append(item);
      return item;
    });
    menu.append(group);
    return {
      radios,
      chosen: () => radios.findIndex((r) => r.getAttribute("aria-checked") === "true"),
    };
  };
  // The unique cuts save a series (`seriesCuts`), counted on opening; the current cut, the
  // default, saves the one.
  const cuts = radioGroup("cuts", "Cuts", ["Unique cuts", "Current cut"], 1);
  const [uniqueCuts, currentCut] = cuts.radios;
  uniqueCuts!.title =
    "Save the images at each distinct cut, from high to low T: one in each band of the same " +
    "phases, and one at each invariant and congruent point (not a pure component's melting point)";
  currentCut!.title = "Save the images at the current cut";
  const sizes = radioGroup(
    "plot-size",
    "Plot size",
    PLOT_SIZES.map(sizeText),
    PLOT_SIZES.indexOf(DEFAULT_PLOT_SIZE),
  );
  const dpis = radioGroup(
    "dpi",
    "PNG resolution",
    DPIS.map((d) => `${d} DPI`),
    DPIS.indexOf(DEFAULT_DPI as (typeof DPIS)[number]),
  );

  const formats = FORMATS.map(({ format, text, title }) => {
    const item = document.createElement("button");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.dataset.format = format;
    setLabel(item, DOWNLOAD, text);
    item.title = title;
    item.tabIndex = -1;
    menu.append(item);
    return item;
  });
  const items = [...cuts.radios, ...sizes.radios, ...dpis.radios, ...formats];
  // Under Figure, after an export whose DPI was lowered: visible, and announced.
  const note = document.createElement("p");
  note.className = "figure-note";
  note.setAttribute("role", "status");
  box.append(figure, menu, note);
  row.append(tdb, box);
  container.append(row);

  const close = (refocus: boolean) => {
    if (menu.hidden) return;
    menu.hidden = true;
    figure.setAttribute("aria-expanded", "false");
    if (refocus) figure.focus();
  };
  const hideNote = () => {
    note.textContent = "";
  };
  const open = () => {
    hideNote();
    const dg = store.dgState();
    const n = seriesCuts(dg.diagram.scan.events, dg.window).length;
    uniqueCuts!.textContent = `${n} unique ${n === 1 ? "cut" : "cuts"}`;
    // Non-breaking spaces, so that a narrow menu wraps it as "Current cut" over "(1320 K)".
    const T = formatInvariantT(dg.cut).replace(" ", "\u00a0");
    currentCut!.textContent = `Current\u00a0cut (${T})`;
    menu.hidden = false;
    figure.setAttribute("aria-expanded", "true");
    items[0]!.focus();
  };

  tdb.addEventListener("click", () => {
    try {
      exportTdb(store.dgState());
    } catch (err) {
      report(err);
    }
  });
  figure.addEventListener("click", () => (menu.hidden ? open() : close(false)));
  figure.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" && menu.hidden) {
      event.preventDefault();
      open();
    } else if (event.key === "Escape" && note.textContent) {
      event.preventDefault();
      hideNote();
    }
  });
  menu.addEventListener("keydown", (event) => {
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
    if (step !== undefined) {
      event.preventDefault();
      items[(at + step + items.length) % items.length]!.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]!.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "Tab") {
      close(false);
    }
  });
  for (const item of formats) {
    item.addEventListener("click", () => {
      close(true);
      hideNote();
      const options = {
        series: cuts.chosen() === 0,
        size: PLOT_SIZES[sizes.chosen()]!,
        dpi: DPIS[dpis.chosen()]!,
      };
      exportFigure(store, plots(), item.dataset.format as FigureFormat, options)
        .then(({ dpi }) => {
          // Not over the menu, should it have been opened again meanwhile.
          if (dpi !== options.dpi && menu.hidden) {
            note.textContent = loweredDpiText(dpi, options.dpi);
          }
        })
        .catch(report);
    });
  }
  // A press or focus outside the button and its menu closes it, and the note.
  const outside = (event: Event) => {
    if (box.contains(event.target as Node)) return;
    close(false);
    hideNote();
  };
  document.addEventListener("pointerdown", outside);
  document.addEventListener("focusin", outside);
}
