import type { Page } from "@playwright/test";
import { expect, setWidth, test } from "./fixtures";

async function open(page: Page) {
  await page.goto("./");
  await expect(page.locator(".phase-diagram svg")).toBeVisible();
}

/** The colour of the region bitmap's top-left pixel, in the liquid field of (h). */
const regionPixel = (page: Page) =>
  page
    .locator("canvas.regions")
    .evaluate((el: HTMLCanvasElement) => [...el.getContext("2d")!.getImageData(2, 2, 1, 1).data]);

test("the heading is named ThermoBRIDGE", async ({ page }) => {
  await open(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("ThermoBRIDGE");
  // The logo's outlines, drawn in the text colour, as high as pTerrain's.
  const logo = page.getByRole("img", { name: "ThermoBRIDGE" });
  await expect(logo).toBeVisible();
  expect((await logo.boundingBox())!.height).toBeCloseTo(36, 0);
  const fg = await page.evaluate(() => getComputedStyle(document.body).color);
  await expect(logo.locator("path").first()).toHaveCSS("fill", fg);
});

test("the info button and the theme button are borderless 44 px squares at either end", async ({
  page,
}) => {
  await open(page);
  const github = page.getByRole("button", { name: "About", exact: true });
  const theme = page.getByRole("button", { name: /Switch to (dark|light) theme/ });
  // The GitHub link is in the footer now, as in pTerrain.
  await expect(page.locator("header").getByRole("link")).toHaveCount(0);
  const g = (await github.boundingBox())!;
  const t = (await theme.boundingBox())!;
  const logo = (await page.locator(".logo").boundingBox())!;
  const header = (await page.locator("header").boundingBox())!;
  for (const b of [g, t]) {
    expect(b.width).toBe(44);
    expect(b.height).toBe(44);
  }
  for (const el of [github, theme]) await expect(el).toHaveCSS("border-top-width", "0px");
  expect(g.x).toBeGreaterThanOrEqual(logo.x + logo.width);
  expect(t.x + t.width).toBeCloseTo(header.x + header.width, 0);
  expect(Math.abs(g.y + g.height / 2 - (logo.y + logo.height / 2))).toBeLessThan(3);
});

test("the cut input sits beside the plots on a wide screen and below them on a narrow one", async ({
  page,
}) => {
  await open(page);
  let plots = (await page.locator(".plots").boundingBox())!;
  let cutInput = (await page.locator(".cut-input").boundingBox())!;
  expect(cutInput.x).toBeGreaterThanOrEqual(plots.x + plots.width);
  expect(cutInput.y).toBeLessThan(plots.y + plots.height);

  await setWidth(page, 800);
  // The plots are redrawn at their new size by a ResizeObserver, so both boxes settle late.
  await expect
    .poll(async () => {
      plots = (await page.locator(".plots").boundingBox())!;
      cutInput = (await page.locator(".cut-input").boundingBox())!;
      return cutInput.y - (plots.y + plots.height);
    })
    .toBeGreaterThanOrEqual(0);
});

test("the two plots have the same plot area, one under the other, at every width", async ({
  page,
}) => {
  for (const width of [1280, 900, 600]) {
    await setWidth(page, width);
    await open(page);
    const diagram = (await page.locator(".phase-diagram .frame").boundingBox())!;
    const slice = (await page.locator(".slice-panel .frame").boundingBox())!;
    expect(slice.x, `${width}`).toBeCloseTo(diagram.x, 0);
    expect(slice.width, `${width}`).toBeCloseTo(diagram.width, 0);
    expect(slice.height, `${width}`).toBeCloseTo(diagram.height, 0);
    expect(slice.y, `${width}`).toBeGreaterThan(diagram.y + diagram.height);
    // Half as high as wide, within 160–360 px (plan §4.2).
    expect(diagram.height, `${width}`).toBeCloseTo(
      Math.min(360, Math.max(160, diagram.width / 2)),
      -1,
    );
    // The X ticks line up: the diagram's marks over the slice panel's numbered ones.
    const ticks = (sel: string) =>
      page.locator(`${sel} .x-axis .tick line`).evaluateAll((els) =>
        els.map((el) => {
          const r = el.getBoundingClientRect();
          return Math.round(r.x + r.width / 2);
        }),
      );
    expect(await ticks(".phase-diagram")).toEqual(await ticks(".slice-panel"));
  }
});

test("the header compacts, and then moves the main row under the logo, as the screen narrows", async ({
  page,
}) => {
  const layoutAt = async (width: number) => {
    await setWidth(page, width);
    const logo = (await page.locator("header .logo").boundingBox())!;
    const row = (await page.locator(".main-row").boundingBox())!;
    const menu = (await page.locator(".system-menu").boundingBox())!;
    return {
      under: row.y >= logo.y + logo.height,
      label: await page.locator(".metastable-toggle .label").isVisible(),
      leverLabel: await page.locator(".lever-toggle .label").isVisible(),
      menu: menu.width,
    };
  };
  await open(page);
  // Full, with the Lever and Metastable labels; compact; then the row under the logo, down to a
  // 375 px window, the narrowest phone tested, as in pTerrain. The menu never gets narrower than
  // about 9rem. The widths are the page's, inside its 16 px padding on either side.
  const steps = [
    [1248, false, true],
    [944, false, true],
    [943, false, false],
    [687, false, false],
    [686, true, false],
    [343, true, false],
  ] as const;
  // A classic scrollbar narrows the page, not the window, and the header follows the page; 15 px
  // more padding on the right stand in for one, as headless Chromium's scrollbars overlay the page.
  for (const scrollbar of [0, 15]) {
    if (scrollbar)
      await page.addStyleTag({ content: `body { padding-right: calc(1rem + ${scrollbar}px) }` });
    for (const [pageWidth, under, label] of steps) {
      const width = pageWidth + 32 + scrollbar;
      const got = await layoutAt(width);
      expect(got.under, `${width}`).toBe(under);
      expect(got.label, `${width}`).toBe(label);
      expect(got.leverLabel, `${width}`).toBe(label);
      expect(got.menu, `${width}`).toBeGreaterThanOrEqual(143);
    }
  }
});

test.describe("in a dark system scheme", () => {
  test.use({ colorScheme: "dark" });

  test("the theme button switches, recolours the regions and survives a reload", async ({
    page,
  }) => {
    await open(page);
    // The page is light until dark is chosen, whatever the system's scheme.
    await expect(page.locator("html")).not.toHaveAttribute("data-theme");
    const before = await regionPixel(page);
    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Switch to light theme" })).toBeVisible();
    await expect.poll(() => regionPixel(page)).not.toEqual(before);
    const dark = await regionPixel(page);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect.poll(() => regionPixel(page)).toEqual(dark);
    await page.getByRole("button", { name: "Switch to light theme" }).click();
    await expect.poll(() => regionPixel(page)).toEqual(before);
  });

  test("a switch of the system's scheme leaves the page light", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await open(page);
    const before = await regionPixel(page);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe("rgb(255, 255, 255)");
    await page.emulateMedia({ colorScheme: "dark" });
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(bg);
    expect(await regionPixel(page)).toEqual(before);
  });
});

test("the page still works when storage is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
  });
  await open(page);
  await page.getByRole("button", { name: /Switch to/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", /light|dark/);
});

test("all text is set in Lato, with T, X and g in italic on the axes", async ({ page }) => {
  await open(page);
  await expect(page.locator("body")).toHaveCSS("font-family", /^Lato/);
  await expect(page.locator(".phase-diagram .y-label .symbol")).toHaveText("T");
  await expect(page.locator(".phase-diagram .x-label .symbol")).toHaveText("X");
  await expect(page.locator(".phase-diagram .x-label .sub")).toHaveText("B");
  await expect(page.locator(".slice-panel .y-label .symbol")).toHaveText("g");
  await expect(page.locator(".slice-panel .y-label .sup")).toHaveText("M,r");
  await expect(page.locator(".slice-panel .y-label .sup")).toHaveCSS("font-style", "italic");
  await expect(page.locator(".slice-panel .y-label")).toHaveText("ΔgM,r (kJ/mol)");
  for (const el of await page.locator(".axis-label .symbol").all()) {
    await expect(el).toHaveCSS("font-style", "italic");
  }
  await expect(page.locator(".phase-diagram .x-label .sub")).toHaveCSS("font-style", "normal");
});
