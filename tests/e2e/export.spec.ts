import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import type { Browser, Page } from "@playwright/test";
import { scan } from "../../src/physics/events";
import { preset } from "../../src/physics/presets";
import { unzip, type ZipRead } from "../zipReader";
import { expect, leverToggle, test } from "./fixtures";

// The TDB and figure exports (plan §9 phases 20–21): the row above the Parameters panel, the ZIP
// each export downloads, the images' contents and sizes, the light theme, the α mode, which
// exports its system as the Δg^M mode would show it, the vector fields, the fixed plot sizes and
// the PNG's DPI.

const tdbButton = (page: Page) => page.getByRole("button", { name: "TDB" });
const figureButton = (page: Page) => page.getByRole("button", { name: "Figure" });
const alphaRadio = (page: Page) => page.getByRole("radio", { name: "Alpha" });

async function open(page: Page, hash = "") {
  await page.goto(`./${hash}`);
  await expect(page.locator(".phase-diagram svg")).toBeVisible();
}

/** The download that `act` starts: its name and bytes. */
async function downloaded(page: Page, act: () => Promise<void>) {
  const [download] = await Promise.all([page.waitForEvent("download"), act()]);
  return {
    name: download.suggestedFilename(),
    bytes: new Uint8Array(await readFile((await download.path())!)),
  };
}

/**
 * Screenshots taken with animations held at their start: the cut handle's hint ring pulses for
 * ever, so two screenshots of an unchanged page differ unless both catch it at the same moment.
 */
const STILL = { animations: "disabled" } as const;

/**
 * The most the whole figure's SVG may hold at (h) and c6 at 720 × 360, characters: the first run
 * (November 2026) gave 115 K and 221 K, the field paths about 3 K of each.
 */
const BOUND = 300_000;

const text = (entry: ZipRead | undefined) => new TextDecoder().decode(entry!.data);
const entry = (entries: ZipRead[], name: string) => entries.find((e) => e.name === name);

async function exportTdb(page: Page) {
  const { name, bytes } = await downloaded(page, () => tdbButton(page).click());
  return { name, entries: unzip(bytes) };
}

/** What the Figure menu offers for the plot size and the DPI, as its items read. */
type SizeText = "360 × 180" | "540 × 270" | "720 × 360";
type DpiText = "150 DPI" | "300 DPI" | "600 DPI";

/** Exports the figure at all unique cuts for `series`, else the current cut, and at `size` and `dpi` when given. */
async function exportFigure(
  page: Page,
  format: "SVG" | "PNG",
  series = false,
  { size, dpi }: { size?: SizeText; dpi?: DpiText } = {},
) {
  await figureButton(page).click();
  await page
    .getByRole("menuitemradio", { name: series ? "All unique cuts" : "Current cut" })
    .click();
  if (size) await page.getByRole("menuitemradio", { name: size }).click();
  if (dpi) await page.getByRole("menuitemradio", { name: dpi }).click();
  const { name, bytes } = await downloaded(page, () =>
    page.getByRole("menuitem", { name: format }).click(),
  );
  return { name, entries: unzip(bytes) };
}

/** What Export in the Parameters panel writes. */
async function exportJson(page: Page) {
  await page.locator(".parameters summary").click();
  const { bytes } = await downloaded(page, () =>
    page.getByRole("button", { name: "Export", exact: true }).click(),
  );
  await page.locator(".parameters summary").click();
  return new TextDecoder().decode(bytes);
}

/**
 * Facts about an SVG file, measured in the page: each text's box inside the SVG's, the tick
 * numbers' and the band's places, and the count of dotted guide lines.
 */
async function measure(page: Page, svgText: string) {
  return page.evaluate((source) => {
    const doc = new DOMParser().parseFromString(source, "image/svg+xml");
    const svg = document.importNode(doc.documentElement, true) as unknown as SVGSVGElement;
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:0;top:0";
    host.append(svg);
    document.body.append(host);
    const box = svg.getBoundingClientRect();
    const texts = [...svg.querySelectorAll("text")].filter((t) => t.textContent);
    const outside = texts
      .filter((t) => {
        const r = t.getBoundingClientRect();
        return (
          r.left < box.left - 0.5 ||
          r.right > box.right + 0.5 ||
          r.top < box.top - 0.5 ||
          r.bottom > box.bottom + 0.5
        );
      })
      .map((t) => t.textContent);
    const tick = texts.find((t) => t.textContent === "0.5");
    const band = [...svg.querySelectorAll("rect")].find((r) => r.getAttribute("height") === "4");
    const guides = [...svg.querySelectorAll("line")].filter((l) =>
      /stroke-dasharray:\s*0(px)?,?\s+4(px)?/.test(l.getAttribute("style") ?? ""),
    ).length;
    // The plot area: the diagram's frame (top and right edges) or the slice panel's (bottom and
    // right).
    const frame = [...svg.querySelectorAll("path")]
      .map((p) =>
        /^M0,(?:0H([\d.]+)V([\d.]+)|([\d.]+)H([\d.]+)V0)$/.exec(p.getAttribute("d") ?? ""),
      )
      .find((m) => m);
    const result = {
      plot: frame
        ? frame[1]
          ? { width: Number(frame[1]), height: Number(frame[2]) }
          : { width: Number(frame[4]), height: Number(frame[3]) }
        : null,
      width: box.width,
      height: box.height,
      outside,
      tickTop: tick ? tick.getBoundingClientRect().top : null,
      bandBottom: band ? band.getBoundingClientRect().bottom : null,
      guides,
      images: svg.querySelectorAll("image").length,
      title: svg.querySelector(":scope > title")?.textContent ?? null,
    };
    host.remove();
    return result;
  }, svgText);
}

/** A PNG's width and height, from its IHDR chunk. */
function pngSize(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  expect([...bytes.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** A PNG's pHYs chunks, each as its pixels per unit across and down and its unit. */
function pngPhys(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  const out: { x: number; y: number; unit: number }[] = [];
  for (let at = 8; at < bytes.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (type === "pHYs") {
      out.push({ x: view.getUint32(at + 8), y: view.getUint32(at + 12), unit: bytes[at + 16]! });
    }
    at += 12 + length;
  }
  return out;
}

/** An SVG file's width and height attributes. */
function svgSize(source: string) {
  return {
    width: Number(/<svg[^>]* width="(\d+)"/.exec(source)![1]),
    height: Number(/<svg[^>]* height="(\d+)"/.exec(source)![1]),
  };
}

test("the row sits above the Parameters panel and works with the panel closed", async ({
  page,
}) => {
  await open(page);
  const row = page.getByRole("group", { name: "TDB and figure export" });
  await expect(row).toBeVisible();
  const rowBox = (await row.boundingBox())!;
  const panelBox = (await page.locator(".parameters summary").boundingBox())!;
  expect(rowBox.y + rowBox.height).toBeLessThanOrEqual(panelBox.y);
  await expect(page.locator("details.parameters")).not.toHaveAttribute("open");
  // The two buttons share the row's width.
  const [a, b] = [
    (await tdbButton(page).boundingBox())!,
    (await figureButton(page).boundingBox())!,
  ];
  expect(Math.abs(a.width - b.width)).toBeLessThan(1);
  expect(a.height).toBeGreaterThanOrEqual(44);
  const { name } = await exportTdb(page);
  expect(name).toBe("Eutectic.zip");
});

test("TDB saves the database and the JSON file that Export writes, at (h) and c1", async ({
  page,
}) => {
  for (const [hash, base] of [
    ["", "Eutectic"],
    ["#c1", "Congruent_compound"],
  ] as const) {
    await open(page, hash);
    const { name, entries } = await exportTdb(page);
    expect(name).toBe(`${base}.zip`);
    expect(entries.map((e) => e.name)).toEqual([`${base}.tdb`, `${base}.json`]);
    expect(entries.every((e) => e.method === 0)).toBe(true);
    const tdb = text(entry(entries, `${base}.tdb`));
    expect(tdb).toContain("PARAMETER L(SOLID,A,B;0)");
    expect(tdb).toMatch(/^\$ Link: http:\/\/localhost:\d+\/#/m);
    if (hash === "#c1") expect(tdb).toContain("PHASE GAMMA % 2");
    expect(text(entry(entries, `${base}.json`))).toBe(await exportJson(page));
  }
});

test("the JSON file of an export opens again with Import", async ({ page }) => {
  await open(page, "#c1");
  const { entries } = await exportTdb(page);
  const json = entries.find((e) => e.name.endsWith(".json"))!;
  await open(page);
  await page.locator(".parameters summary").click();
  await page.locator('.parameters input[type="file"]').setInputFiles({
    name: json.name,
    mimeType: "application/json",
    buffer: Buffer.from(json.data),
  });
  await expect(page.locator(".system-label")).toHaveText("Congruent compound");
});

test("Figure saves three SVG images and the JSON file, each standing alone", async ({ page }) => {
  for (const hash of ["", "#c1"]) {
    await open(page, hash);
    await leverToggle(page).click();
    const { entries } = await exportFigure(page, "SVG");
    const base = entries.at(-1)!.name.replace(/\.json$/, "");
    expect(entries.map((e) => e.name)).toEqual([
      `${base}.svg`,
      `${base}-diagram.svg`,
      `${base}-slice.svg`,
      `${base}.json`,
    ]);
    const [whole, diagram, slice] = entries.slice(0, 3).map(text) as [string, string, string];
    for (const svg of [whole, diagram, slice]) {
      expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
      expect(svg).not.toContain("var(--");
      expect(svg).not.toMatch(/\sclass=/);
      expect(svg).not.toContain("aria-");
      expect(svg).not.toContain("tabindex");
      expect(svg).toContain("<!-- ThermoBRIDGE figure of");
      expect(svg).toContain("font-family:Lato, sans-serif");
      // No control: the cut's knob and the lever's.
      expect(svg).not.toContain('r="22"');
      const m = await measure(page, svg);
      expect(m.outside, "text outside the viewBox").toEqual([]);
      expect(m.title).not.toBeNull();
    }
    const [w, d, s] = [
      await measure(page, whole),
      await measure(page, diagram),
      await measure(page, slice),
    ];
    // The whole figure keeps the guide lines (the lever's among them); the single plots drop them.
    expect(w.guides).toBeGreaterThan(0);
    expect(d.guides).toBe(0);
    expect(s.guides).toBe(0);
    // The fields are paths, not an image.
    expect(w.images + d.images + s.images).toBe(0);
    // The diagram alone has its tick numbers; the slice panel's axis is under its band.
    expect(d.tickTop).not.toBeNull();
    expect(s.tickTop).toBeGreaterThan(s.bandBottom!);
    expect(w.height).toBeGreaterThan(d.height);
  }
});

test("the images follow the Labels button", async ({ page }) => {
  await open(page);
  const labels = page.locator(".labels-toggle");
  /** The texts of the elements matching `selector`, on the page or in an exported SVG. */
  const live = (selector: string) => page.locator(selector).allTextContents();
  const exported = async () => {
    const { entries } = await exportFigure(page, "SVG");
    return page.evaluate(
      (source) =>
        [...new DOMParser().parseFromString(source, "image/svg+xml").querySelectorAll("text")].map(
          (t) => t.textContent,
        ),
      text(entries[1]),
    );
  };
  // Field names and point names.
  await labels.click();
  await expect(labels).toHaveAttribute("aria-label", "Labels: field names and point names");
  const fields = await live(".phase-diagram .field-labels text");
  const points = await live(".phase-diagram .point-labels text");
  expect(fields.length).toBeGreaterThan(0);
  expect(points.length).toBeGreaterThan(0);
  const shown = await exported();
  for (const name of [...fields, ...points]) expect(shown).toContain(name);
  // None.
  await labels.click();
  await labels.click();
  await expect(labels).toHaveAttribute("aria-label", "Labels: none");
  const hidden = await exported();
  for (const name of [...fields, ...points]) expect(hidden).not.toContain(name);
});

test("a series saves the three images at each distinct cut, high to low, and leaves the page", async ({
  page,
}) => {
  await open(page);
  await leverToggle(page).click();
  const cut = await page.locator(".cut-handle").getAttribute("aria-valuenow");
  const before = await page.locator(".phase-diagram svg").screenshot(STILL);
  const sliceBefore = await page.locator(".slice-panel svg").screenshot(STILL);
  const { name, entries } = await exportFigure(page, "SVG", true);
  expect(name).toBe("Eutectic-series.zip");
  // (h): the liquid, L + β, both two-phase fields, the eutectic at 634 K, and α + β.
  const stems = ["01-1350K", "02-1000K", "03-717K", "04-634K", "05-467K"];
  expect(entries.map((e) => e.name)).toEqual([
    ...["both", "diagram", "slice"].flatMap((kind) =>
      stems.map((s) => `Eutectic-${kind}-${s}.svg`),
    ),
    "Eutectic.json",
  ]);
  // Each cut's images carry the link to that cut, with X₀ since the lever rule is on.
  const links = entries
    .filter((e) => e.name.startsWith("Eutectic-diagram-"))
    .map((e) => /Link: \S+;T,([\d.]+);X,\.5\./.exec(text(e))?.[1]);
  expect(links.map(Number).map(Math.round)).toEqual([1350, 1000, 717, 634, 467]);
  // The slice panel differs from cut to cut; the page keeps its own cut.
  const slices = entries.filter((e) => e.name.startsWith("Eutectic-slice-")).map(text);
  expect(new Set(slices).size).toBe(stems.length);
  // Each image is as tall as the plots, however far the clipped curves run past the g axis.
  for (const kind of ["both", "diagram", "slice"]) {
    const heights = entries
      .filter((e) => e.name.startsWith(`Eutectic-${kind}-`))
      .map((e) => Number(/<svg[^>]* height="(\d+)"/.exec(text(e))![1]));
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(30);
  }
  await expect(page.locator(".cut-handle")).toHaveAttribute("aria-valuenow", cut!);
  expect(await page.locator(".phase-diagram svg").screenshot(STILL)).toEqual(before);
  // With the lever's marker, which the store draws on its own.
  expect(await page.locator(".slice-panel svg").screenshot(STILL)).toEqual(sliceBefore);
});

test("in the α mode a series runs through the Δg^M mode's view", async ({ page }) => {
  await open(page);
  await alphaRadio(page).check();
  const { name, entries } = await exportFigure(page, "PNG", true);
  expect(name).toMatch(/-series\.zip$/);
  expect(entries.filter((e) => e.name.endsWith(".png"))).toHaveLength(15);
  await expect(page.locator("#app")).toHaveAttribute("data-mode", "alpha");
  await expect(page.locator(".slice-panel svg")).toBeHidden();
});

test("Figure saves PNG images at the DPI chosen, 300 at first, recorded in pHYs", async ({
  page,
}) => {
  await open(page);
  const svg = await exportFigure(page, "SVG");
  for (const [dpi, choice] of [
    [300, undefined],
    [150, "150 DPI"],
    [600, "600 DPI"],
  ] as const) {
    // 600 DPI at the default 720 × 360 is too large; the smaller sizes fit at 600.
    const size = dpi === 600 ? "540 × 270" : undefined;
    const ref = size ? await exportFigure(page, "SVG", false, { size }) : svg;
    const png = await exportFigure(page, "PNG", false, { dpi: choice, size });
    expect(png.entries.map((e) => e.name)).toEqual([
      "Eutectic.png",
      "Eutectic-diagram.png",
      "Eutectic-slice.png",
      "Eutectic.json",
    ]);
    for (let k = 0; k < 3; k++) {
      const { width, height } = svgSize(text(ref.entries[k]));
      expect(pngSize(png.entries[k]!.data)).toEqual({
        width: Math.round((width * dpi) / 96),
        height: Math.round((height * dpi) / 96),
      });
      const ppm = Math.round(dpi / 0.0254);
      expect(pngPhys(png.entries[k]!.data)).toEqual([{ x: ppm, y: ppm, unit: 1 }]);
    }
    if (dpi === 300) expect(pngPhys(png.entries[0]!.data)[0]!.x).toBe(11811);
  }
  await expect(page.locator(".figure-note")).toBeEmpty();
});

test("a DPI too large for the figure is lowered for every image, and a note says so", async ({
  page,
}) => {
  await open(page);
  const svg = await exportFigure(page, "SVG", false, { size: "720 × 360" });
  const sizes = svg.entries.slice(0, 3).map((e) => svgSize(text(e)));
  const largest = sizes.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
  const pixels = (d: number) =>
    Math.round((largest.width * d) / 96) * Math.round((largest.height * d) / 96);
  // If 600 DPI fits at 720 × 360, this test needs a lower limit than the app's.
  expect(pixels(600)).toBeGreaterThan(16_777_216);
  let dpi = 600;
  while (pixels(dpi) > 16_777_216) dpi--;

  const png = await exportFigure(page, "PNG", false, { size: "720 × 360", dpi: "600 DPI" });
  for (let k = 0; k < 3; k++) {
    const { width, height } = sizes[k]!;
    expect(pngSize(png.entries[k]!.data)).toEqual({
      width: Math.round((width * dpi) / 96),
      height: Math.round((height * dpi) / 96),
    });
    const ppm = Math.round(dpi / 0.0254);
    expect(pngPhys(png.entries[k]!.data)).toEqual([{ x: ppm, y: ppm, unit: 1 }]);
  }
  const note = page.locator(".figure-note");
  await expect(note).toHaveAttribute("role", "status");
  await expect(note).toBeVisible();
  await expect(note).toHaveText(
    `Saved at ${dpi} DPI: 600 DPI is more than this browser can draw for a figure this size.`,
  );
  await expect(figureButton(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(note).toBeHidden();
  await expect(note).toBeEmpty();
});

test("the fields are vector paths in the diagram's images, with their patterns", async ({
  page,
}) => {
  for (const hash of ["", "#c6"]) {
    await open(page, hash);
    const { entries } = await exportFigure(page, "SVG");
    const [whole, diagram, slice] = entries.slice(0, 3).map(text) as [string, string, string];
    for (const svg of [whole, diagram, slice]) {
      expect(svg).not.toContain("<image");
      expect(svg).not.toContain("data:image");
      expect(svg).not.toContain("var(--");
      // Every pattern or clip a fill or clip-path names is in the file.
      for (const [, id] of svg.matchAll(/url\(#([^)]+)\)/g)) {
        expect(svg, `#${id}`).toContain(`id="${id}"`);
      }
    }
    expect(whole).toContain("url(#field-");
    expect(diagram).toContain("url(#field-");
    expect(slice).not.toContain("field-");
    // The fields are a few KB, where the raster was up to a few hundred.
    expect(whole.length, "the whole figure's size").toBeLessThan(BOUND);
  }
});
test("the images are light when the page is dark, and the page stays dark", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  const before = await page.locator(".phase-diagram svg").screenshot(STILL);
  const { entries } = await exportFigure(page, "SVG");
  const svg = text(entries[0]);
  // The light --fg and --bg, and none of the dark ones.
  expect(svg).toContain("rgb(0, 0, 0)");
  expect(svg).not.toContain("rgb(17, 17, 17)");
  expect(svg).not.toContain("rgb(242, 242, 242)");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.locator(".phase-diagram svg").screenshot(STILL)).toEqual(before);
});

test("in the α mode the export shows the system as the Δg^M mode would", async ({ page }) => {
  await open(page);
  await alphaRadio(page).check();
  // Move the knob off its start, so the Δg^M mode would take the system as a custom one.
  const knob = page.locator(".alpha-knob");
  await knob.focus();
  await knob.press("ArrowRight");
  await knob.press("ArrowUp");
  await expect(page.locator("#app")).toHaveAttribute("data-mode", "alpha");
  const caption = await page.locator(".alpha-summary").first().textContent();

  const tdb = await exportTdb(page);
  const figure = await exportFigure(page, "SVG");
  expect(figure.entries).toHaveLength(4);
  const whole = await measure(page, text(figure.entries[0]));
  expect(whole.guides).toBeGreaterThan(0);
  // The page is still in the α mode, its caption and pad unchanged.
  await expect(page.locator("#app")).toHaveAttribute("data-mode", "alpha");
  await expect(page.locator(".alpha-summary").first()).toHaveText(caption!);
  await expect(page.locator(".alpha-pad")).toBeVisible();
  await expect(page.locator(".slice-panel svg")).toBeHidden();

  // The same files as after leaving the α mode.
  await page.getByRole("radio", { name: "Delta g M" }).check();
  await expect(page.locator("#app")).toHaveAttribute("data-mode", "dg");
  const after = await exportTdb(page);
  expect(after.name).toBe(tdb.name);
  expect(after.entries.map(text)).toEqual(tdb.entries.map(text));
  expect(text(figure.entries.at(-1))).toBe(text(after.entries.at(-1)));
});

test("both buttons work in the α mode, outside the Parameters panel's lock", async ({ page }) => {
  await open(page);
  await alphaRadio(page).check();
  await expect(tdbButton(page)).toBeEnabled();
  await expect(figureButton(page)).toBeEnabled();
  await page.locator(".parameters summary").click();
  await expect(page.getByRole("button", { name: "Apply" })).toBeDisabled();
});

test("the Figure menu opens from the keyboard and closes on Escape; axe finds no violations", async ({
  page,
}) => {
  await open(page);
  await figureButton(page).focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menu", { name: "Figure format" })).toBeVisible();
  await expect(figureButton(page)).toHaveAttribute("aria-expanded", "true");
  const all = page.getByRole("menuitemradio", { name: "All unique cuts" });
  const current = page.getByRole("menuitemradio", { name: "Current cut" });
  await expect(all).toBeFocused();
  await expect(all).toHaveAttribute("aria-checked", "false");
  await expect(current).toHaveAttribute("aria-checked", "true");
  // Choosing all unique cuts leaves the menu open, and unchecks the current cut.
  await page.keyboard.press("Enter");
  await expect(all).toHaveAttribute("aria-checked", "true");
  await expect(current).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(current).toBeFocused();
  // Then the three plot sizes, the three DPIs, SVG and PNG.
  for (const name of ["360 × 180", "540 × 270", "720 × 360", "150 DPI", "300 DPI", "600 DPI"]) {
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitemradio", { name })).toBeFocused();
  }
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "SVG" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "PNG" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("menuitem", { name: "PNG" })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(all).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(figureButton(page)).toBeFocused();
  // A press elsewhere closes it too.
  await figureButton(page).click();
  await page.locator("footer").click({ position: { x: 1, y: 1 } });
  await expect(page.getByRole("menu")).toBeHidden();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the row fits the width and its buttons are 44 px high", async ({ page }) => {
    await open(page);
    const row = page.getByRole("group", { name: "TDB and figure export" });
    await row.scrollIntoViewIfNeeded();
    const box = (await row.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    for (const b of [tdbButton(page), figureButton(page)]) {
      expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scroll).toBeLessThanOrEqual(390);
  });
});

test("the plot size and the DPI are each one choice, kept while the page is open", async ({
  page,
}) => {
  await open(page);
  await figureButton(page).click();
  const menu = page.getByRole("menu", { name: "Figure format" });
  const checked = (group: string) =>
    menu
      .getByRole("group", { name: group })
      .locator('[role="menuitemradio"][aria-checked="true"]')
      .allTextContents();
  expect(await checked("Plot size")).toEqual(["720 × 360"]);
  expect(await checked("PNG resolution")).toEqual(["300 DPI"]);
  await page.getByRole("menuitemradio", { name: "360 × 180" }).click();
  await page.getByRole("menuitemradio", { name: "600 DPI" }).click();
  await expect(menu).toBeVisible();
  expect(await checked("Plot size")).toEqual(["360 × 180"]);
  expect(await checked("PNG resolution")).toEqual(["600 DPI"]);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await figureButton(page).click();
  expect(await checked("Plot size")).toEqual(["360 × 180"]);
  expect(await checked("PNG resolution")).toEqual(["600 DPI"]);
  await expect(page.getByRole("menuitem", { name: "PNG" })).toHaveAttribute(
    "title",
    "Images at the size and resolution chosen above",
  );
});

test("each image's plot area is the size chosen, with its labels inside the viewBox", async ({
  page,
}) => {
  await open(page);
  for (const [size, width, height] of [
    ["360 × 180", 360, 180],
    ["540 × 270", 540, 270],
    ["720 × 360", 720, 360],
  ] as const) {
    const { entries } = await exportFigure(page, "SVG", false, { size });
    for (const entry of entries.slice(0, 3)) {
      const m = await measure(page, text(entry));
      expect(m.plot, entry.name).toEqual({ width, height });
      expect(m.outside, `${entry.name} at ${size}`).toEqual([]);
    }
  }
});

test("a series exports every cut at the size chosen", async ({ page }) => {
  await open(page);
  const { entries } = await exportFigure(page, "SVG", true, { size: "540 × 270" });
  const images = entries.filter((e) => e.name.endsWith(".svg"));
  expect(images).toHaveLength(15);
  for (const entry of images) {
    expect((await measure(page, text(entry))).plot, entry.name).toEqual({
      width: 540,
      height: 270,
    });
  }
});

test("an export at another size leaves the page's plots as they were", async ({ page }) => {
  await open(page);
  await leverToggle(page).click();
  const sizes = () =>
    page.evaluate(() => {
      const attrs = (sel: string) => {
        const el = document.querySelector(sel)!;
        return [el.getAttribute("width"), el.getAttribute("height")];
      };
      const canvas = document.querySelector<HTMLCanvasElement>(".phase-diagram canvas")!;
      return {
        diagram: attrs(".phase-diagram svg"),
        slice: attrs(".slice-panel svg"),
        canvas: [canvas.width, canvas.height, canvas.style.width, canvas.style.height],
      };
    });
  const before = await sizes();
  const cut = await page.locator(".cut-handle").getAttribute("aria-valuenow");
  const knob = await page.locator(".lever-knob").boundingBox();
  const shot = await page.locator(".phase-diagram svg").screenshot(STILL);
  await exportFigure(page, "SVG", false, { size: "360 × 180" });
  expect(await sizes()).toEqual(before);
  await expect(page.locator(".cut-handle")).toHaveAttribute("aria-valuenow", cut!);
  expect(await page.locator(".lever-knob").boundingBox()).toEqual(knob);
  expect(await page.locator(".phase-diagram svg").screenshot(STILL)).toEqual(shot);
});

/** The SVG files of one export from a fresh page in a context with `options`. */
async function exportIn(
  browser: Browser,
  options: Parameters<Browser["newContext"]>[0],
  size: SizeText,
  date: number,
) {
  const context = await browser.newContext({ ...options, acceptDownloads: true });
  try {
    const page = await context.newPage();
    // One date in both contexts, for the comment.
    await page.clock.setFixedTime(date);
    await open(page, "#c1");
    const { entries } = await exportFigure(page, "SVG", false, { size });
    return entries.slice(0, 3).map(text);
  } finally {
    await context.close();
  }
}

test("an export is the same from a phone at 3× and a laptop at 1×", async ({ browser }) => {
  test.slow();
  const date = Date.now();
  for (const size of ["360 × 180", "540 × 270", "720 × 360"] as const) {
    const phone = await exportIn(
      browser,
      {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
      size,
      date,
    );
    const laptop = await exportIn(
      browser,
      { viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 },
      size,
      date,
    );
    for (let k = 0; k < 3; k++) expect(phone[k], `image ${k} at ${size}`).toBe(laptop[k]);
  }
});

/**
 * The lightest pixel along the row at T, for X in [X0, X1], against the field just above and
 * below it, when `svg` (a diagram alone) is drawn at `scale`: how much lighter, in 0–255 grey.
 */
async function seam(
  page: Page,
  svg: string,
  window: { Tmin: number; Tmax: number },
  T: number,
  [X0, X1]: [number, number],
  scale: number,
) {
  return page.evaluate(
    async ({ svg, window, T, X0, X1, scale, margin, plot }) => {
      const [vx, vy, vw, vh] = /viewBox="([^"]+)"/.exec(svg)![1]!.split(" ").map(Number) as [
        number,
        number,
        number,
        number,
      ];
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(vw * scale);
      canvas.height = Math.round(vh * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const grey = (x: number, y: number) => {
        const k = 4 * (Math.round(y) * canvas.width + Math.round(x));
        return (data[k]! + data[k + 1]! + data[k + 2]!) / 3;
      };
      const px = (X: number) => (margin.left - vx + X * plot.width) * scale;
      const y =
        (margin.top - vy + ((window.Tmax - T) / (window.Tmax - window.Tmin)) * plot.height) * scale;
      let worst = -Infinity;
      for (let x = Math.ceil(px(X0)); x <= px(X1); x++) {
        // The field beside the row, away from any seam: the darker of the two sides (one side
        // may be a lighter checker cell).
        const beside = Math.min(grey(x, y - 4 * scale), grey(x, y + 4 * scale));
        for (let dy = -scale; dy <= scale; dy++) worst = Math.max(worst, grey(x, y + dy) - beside);
      }
      return worst;
    },
    {
      svg,
      window,
      T,
      X0,
      X1,
      scale,
      margin: { top: 12, left: 50 },
      plot: { width: 720, height: 360 },
    },
  );
}

test("two fields of one kind that meet show no seam, at 1× and 3×", async ({ page }) => {
  const labels = page.locator(".labels-toggle");
  const cases = [
    // The α field below and above (h)'s eutectic, left of its line.
    { id: "h", kind: "eutectic", X: [0.02, 0.07] },
    // The liquid below and above 1804 K, where k's liquid dome closes, beside the dome: its top
    // is flat, so its boundary runs within a few px of the row from about X = 0.35 to 0.65.
    { id: "k", kind: "critical", X: [0.05, 0.25] },
  ] as const;
  for (const { id, kind, X } of cases) {
    const { params, window } = preset(id);
    const T = scan(params, window)
      .events.filter((e) => e.kind === kind)
      .at(-1)!.T;
    await open(page, `#${id};T,1000`);
    while ((await labels.getAttribute("aria-label")) !== "Labels: none") await labels.click();
    const { entries } = await exportFigure(page, "SVG");
    for (const scale of [1, 3]) {
      const lighter = await seam(page, text(entries[1]), window, T, [...X], scale);
      expect(lighter, `${id} at ${scale}×`).toBeLessThanOrEqual(3);
    }
  }
});
