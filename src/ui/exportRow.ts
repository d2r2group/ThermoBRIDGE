// The export row above the Parameters panel (plan §9 phase 20): TDB saves the system as a CALPHAD
// database, Figure the plots as SVG or PNG images, each as one ZIP with the system's JSON file.
// Outside the panel's form, so both work with the panel closed and in the α mode, which exports
// its system as the Δg^M mode would show it (`Store.dgState`). Figure's *Series of cuts* box
// saves the images at each cut of `seriesCuts` instead, from the top of the window down.

import { report, setLabel } from "./buttons";
import { seriesCuts, seriesName } from "./cutSeries";
import {
  addMetadata,
  buildFigures,
  pngOf,
  svgText,
  type FigureFormat,
  type FigurePlots,
} from "./figure";
import { DATABASE, PICTURE } from "./icons";
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

/**
 * The ZIP of the figure export: the three images in `format`, then `<base>.json`. With `series`,
 * `<base>-series.zip` with the three images at each cut of `seriesCuts`, named by their kind
 * first and then the cut, `<base>-<both|diagram|slice>-<nn>-<T>K`, so that they sort by kind and
 * then by T, decreasing; each carries the link to its own cut.
 */
export async function exportFigure(
  store: Store,
  plots: FigurePlots,
  format: FigureFormat,
  series = false,
): Promise<void> {
  const dg = store.dgState();
  const { system, base, json } = exportOf(dg);
  const views = series
    ? seriesCuts(dg.diagram.scan.events, dg.window).map(({ T }) => stateAtCut(dg, T))
    : [dg];
  const figures = buildFigures(plots, views, store.state, format);
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
        data: format === "svg" ? svgText(svg) : await pngOf(svg),
      });
    }
  }
  entries.push({ name: `${base}.json`, data: json });
  saveZip(series ? `${base}-series` : base, entries);
}

const FORMATS: readonly { format: FigureFormat; text: string; title: string }[] = [
  { format: "svg", text: "SVG", title: "Vector images, with the text as text" },
  { format: "png", text: "PNG", title: "Images at 3× the plots' size" },
];

/**
 * Appends the row to `container`: TDB, and Figure with its menu: the *Series of cuts* box, then
 * the formats. `plots` gives the plots once they are built, after the row.
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
  setLabel(tdb, DATABASE, "TDB");
  tdb.title = "Save the applied system as a CALPHAD database, with its JSON file";

  const box = document.createElement("div");
  box.className = "figure-box";
  const figure = document.createElement("button");
  figure.type = "button";
  figure.className = "btn figure";
  setLabel(figure, PICTURE, "Figure");
  figure.title = "Save the plots as SVG or PNG images, with the system's JSON file";
  figure.setAttribute("aria-haspopup", "menu");
  figure.setAttribute("aria-expanded", "false");
  const menu = document.createElement("div");
  menu.className = "figure-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Figure format");
  menu.hidden = true;
  // A box in the menu, which stays open when it is ticked.
  const seriesItem = document.createElement("button");
  seriesItem.type = "button";
  seriesItem.className = "series";
  seriesItem.setAttribute("role", "menuitemcheckbox");
  seriesItem.setAttribute("aria-checked", "false");
  seriesItem.textContent = "Series of cuts";
  seriesItem.title =
    "Save the images at each distinct cut, from high to low T: one in each band of the same " +
    "phases, and one at each invariant";
  seriesItem.tabIndex = -1;
  menu.append(seriesItem);
  const formats = FORMATS.map(({ format, text, title }) => {
    const item = document.createElement("button");
    item.type = "button";
    item.setAttribute("role", "menuitem");
    item.dataset.format = format;
    item.textContent = text;
    item.title = title;
    item.tabIndex = -1;
    menu.append(item);
    return item;
  });
  const items = [seriesItem, ...formats];
  box.append(figure, menu);
  row.append(tdb, box);
  container.append(row);

  const close = (refocus: boolean) => {
    if (menu.hidden) return;
    menu.hidden = true;
    figure.setAttribute("aria-expanded", "false");
    if (refocus) figure.focus();
  };
  const open = () => {
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
  seriesItem.addEventListener("click", () => {
    const on = seriesItem.getAttribute("aria-checked") !== "true";
    seriesItem.setAttribute("aria-checked", String(on));
  });
  for (const item of formats) {
    item.addEventListener("click", () => {
      close(true);
      const series = seriesItem.getAttribute("aria-checked") === "true";
      exportFigure(store, plots(), item.dataset.format as FigureFormat, series).catch(report);
    });
  }
  // A press or focus outside the button and its menu closes it.
  const outside = (event: Event) => {
    if (!box.contains(event.target as Node)) close(false);
  };
  document.addEventListener("pointerdown", outside);
  document.addEventListener("focusin", outside);
}
