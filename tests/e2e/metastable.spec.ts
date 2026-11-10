import type { Page } from "@playwright/test";
import { centresX, diagram, expect, setCut, setWidth, slicePanel, test } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(page.locator(".slice-panel svg")).toBeVisible();
});

/** Everything that the Metastable toggle must leave alone: the stable lines, shading and text. */
async function stableSnapshot(page: Page) {
  const attrs = (sel: string, names: string[]) =>
    page
      .locator(sel)
      .evaluateAll((els, ns) => els.map((el) => ns.map((n) => el.getAttribute(n))), names);
  return {
    boundaries: await attrs(".phase-diagram .boundary.stable", ["d"]),
    invariants: await attrs(".phase-diagram .invariant", ["x1", "x2", "y1"]),
    labels: await attrs(".phase-diagram .field-label", ["x", "y"]),
    shades: await attrs(".slice-panel .shade", ["d", "fill"]),
    curves: await attrs(".slice-panel .curve.stable", ["d"]),
    tangents: await attrs(".slice-panel .tangent.stable", ["d"]),
    guides: await attrs(".guide.stable", ["x1", "y1", "y2"]),
    markers: await attrs(".touch-marker.stable", ["cx", "cy"]),
    values: await page.locator(".bold-value text").allTextContents(),
    raster: await page
      .locator(".phase-diagram canvas.regions")
      .evaluate((el) => (el as HTMLCanvasElement).toDataURL()),
  };
}

/**
 * The computed display of every element `sel` selects. (A vertical guide line has a box of zero
 * width, which Playwright counts as hidden whether it is drawn or not.)
 */
const displays = (page: Page, sel: string) =>
  page.locator(sel).evaluateAll((els) => els.map((el) => getComputedStyle(el).display));

/** The metastable elements, each selector with how many (h) shows of it at 600 K. */
const METASTABLE = {
  ".phase-diagram .boundary.metastable": 4,
  ".phase-diagram .spinodal": 2,
  ".phase-diagram .guide.metastable": 4,
  ".phase-diagram .touch-marker.metastable": 4,
  ".slice-panel .tangent.metastable": 2,
  ".slice-panel .guide.metastable": 4,
  ".slice-panel .touch-marker.metastable": 4,
  ".slice-panel .spinodal-point": 2,
} as const;

test("(h) labels its fields and writes the eutectic's temperature at its right end", async ({
  page,
}) => {
  const labels = diagram(page).locator(".field-label");
  const names = await labels.allTextContents();
  expect(names).toEqual(expect.arrayContaining(["L", "L + α", "L + β", "α", "β", "α + β"]));
  expect(names).toHaveLength(new Set(names).size);
  // One-phase names in the curve colours, two-phase ones in --fg.
  const fill = (name: string) =>
    labels
      .filter({ hasText: new RegExp(`^${name.replace("+", "\\+")}$`) })
      .evaluate((el) => getComputedStyle(el).fill);
  expect(await fill("L")).not.toBe(await fill("α"));
  expect(await fill("L + β")).toBe(await fill("α + β"));

  const temperature = diagram(page).locator(".invariant-temperature");
  await expect(temperature).toHaveText(["634 K"]);
  const t = (await temperature.boundingBox())!;
  const line = (await diagram(page).locator(".invariant").boundingBox())!;
  // Beside the right end, above or below the line.
  expect(Math.abs(t.x + t.width - (line.x + line.width))).toBeLessThan(10);
  expect(Math.abs(t.y + t.height / 2 - line.y)).toBeLessThan(15);
});

test("below the eutectic the extensions carry dashed tangents, aligned with their guides", async ({
  page,
}) => {
  await setCut(page, 600);
  for (const [sel, n] of Object.entries(METASTABLE)) {
    await expect(page.locator(sel), sel).toHaveCount(n);
  }
  const top = await centresX(diagram(page).locator(".touch-marker.metastable"));
  const bottom = await centresX(slicePanel(page).locator(".touch-marker.metastable"));
  const guidesTop = await centresX(diagram(page).locator(".guide.metastable"));
  const guidesBottom = await centresX(slicePanel(page).locator(".guide.metastable"));
  for (const xs of [top, guidesTop, guidesBottom]) {
    xs.forEach((x, k) => expect(Math.abs(x - bottom[k]!)).toBeLessThan(0.5));
  }
  // The bold values are the stable touching points' only.
  await expect(diagram(page).locator(".bold-value")).toHaveCount(2);

  // Above the eutectic no extension reaches the cut.
  await setCut(page, 900);
  await expect(slicePanel(page).locator(".tangent.metastable")).toHaveCount(0);
  await expect(page.locator(".guide.metastable")).toHaveCount(0);
});

test("hiding the metastable branches leaves the shading and the stable lines unchanged", async ({
  page,
}) => {
  await setCut(page, 600);
  const button = page.getByRole("button", { name: "Metastable" });
  const before = await stableSnapshot(page);
  const all = [...Object.keys(METASTABLE), ".slice-panel .curve.metastable"];
  for (const sel of all) expect(await displays(page, sel), sel).not.toContain("none");

  await button.click();
  for (const sel of all) {
    const shown = await displays(page, sel);
    expect(shown.length, sel).toBeGreaterThan(0);
    expect(new Set(shown), sel).toEqual(new Set(["none"]));
  }
  expect(await stableSnapshot(page)).toEqual(before);
  await expect(diagram(page).locator(".field-label").first()).toBeVisible();
  await expect(diagram(page).locator(".invariant-temperature")).toBeVisible();

  await button.click();
  for (const sel of all) expect(await displays(page, sel), sel).not.toContain("none");
  expect(await stableSnapshot(page)).toEqual(before);
});

test("the labels are placed again for a new system and a new plot size", async ({ page }) => {
  const names = () => diagram(page).locator(".field-label").allTextContents();
  await page.getByRole("combobox", { name: "System" }).selectOption("k");
  await expect.poll(names).toEqual(expect.arrayContaining(["L₁ + L₂", "α₁ + α₂"]));
  await expect(diagram(page).locator(".invariant-temperature")).toHaveText(["1357 K"]);
  const placed = () =>
    diagram(page)
      .locator(".field-label")
      .evaluateAll((els) => els.map((el) => [el.textContent, el.getAttribute("x")]));
  const at = await placed();
  // A phone: a narrower plot, so every label moves.
  await setWidth(page, 420);
  await expect.poll(placed).not.toEqual(at);
});
