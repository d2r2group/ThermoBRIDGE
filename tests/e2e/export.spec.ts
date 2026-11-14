import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { unzip, type ZipRead } from "../zipReader";
import { expect, leverToggle, test } from "./fixtures";

// The TDB and figure exports (plan §9 phase 20): the row above the Parameters panel, the ZIP each
// export downloads, the images' contents and sizes, the light theme, and the α mode, which
// exports its system as the Δg^M mode would show it.

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

const text = (entry: ZipRead | undefined) => new TextDecoder().decode(entry!.data);
const entry = (entries: ZipRead[], name: string) => entries.find((e) => e.name === name);

async function exportTdb(page: Page) {
  const { name, bytes } = await downloaded(page, () => tdbButton(page).click());
  return { name, entries: unzip(bytes) };
}

async function exportFigure(page: Page, format: "SVG" | "PNG", series = false) {
  await figureButton(page).click();
  const box = page.getByRole("menuitemcheckbox", { name: "Series of cuts" });
  if ((await box.getAttribute("aria-checked")) !== String(series)) await box.click();
  const { name, bytes } = await downloaded(page, () =>
    page.getByRole("menuitem", { name: format }).click(),
  );
  return { name, entries: unzip(bytes) };
}

/** What Export in the Parameters panel writes. */
async function exportJson(page: Page) {
  await page.locator(".parameters summary").click();
  const { bytes } = await downloaded(page, () =>
    page.getByRole("button", { name: "Export" }).click(),
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
    const result = {
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
    // The region raster under the diagram.
    expect(w.images).toBe(1);
    expect(d.images).toBe(1);
    expect(s.images).toBe(0);
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

test("Figure saves PNG images at 3× the SVG's size", async ({ page }) => {
  await open(page);
  const svg = await exportFigure(page, "SVG");
  const png = await exportFigure(page, "PNG");
  expect(png.entries.map((e) => e.name)).toEqual([
    "Eutectic.png",
    "Eutectic-diagram.png",
    "Eutectic-slice.png",
    "Eutectic.json",
  ]);
  for (let k = 0; k < 3; k++) {
    const width = Number(/<svg[^>]* width="(\d+)"/.exec(text(svg.entries[k]))![1]);
    const height = Number(/<svg[^>]* height="(\d+)"/.exec(text(svg.entries[k]))![1]);
    expect(pngSize(png.entries[k]!.data)).toEqual({ width: 3 * width, height: 3 * height });
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
  const series = page.getByRole("menuitemcheckbox", { name: "Series of cuts" });
  await expect(series).toBeFocused();
  await expect(series).toHaveAttribute("aria-checked", "false");
  // Ticking the box leaves the menu open.
  await page.keyboard.press("Enter");
  await expect(series).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "SVG" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "PNG" })).toBeFocused();
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
