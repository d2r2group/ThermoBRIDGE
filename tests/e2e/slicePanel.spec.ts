import type { Locator } from "@playwright/test";
import { centresX, diagram, expect, plotArea, setCut, slicePanel, test } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(page.locator(".slice-panel svg")).toBeVisible();
});

/** The page y of each element's centre. */
async function centresY(items: Locator): Promise<number[]> {
  const boxes = await Promise.all((await items.all()).map((el) => el.boundingBox()));
  return boxes.map((b) => b!.y + b!.height / 2);
}

test("at 900 K in (h): the liquid arc, one L + β tangent, its touching points and the shading", async ({
  page,
}) => {
  const slice = slicePanel(page);
  await expect(slice.locator("svg")).toHaveAttribute(
    "aria-label",
    "Gibbs energy curves and common tangents at 900.0 K",
  );
  await expect(slice.locator(".tangent.stable")).toHaveCount(1);
  await expect(slice.locator(".touch-marker.stable")).toHaveCount(2);
  // Both curves, solid where they are the envelope and dashed elsewhere.
  for (const phase of ["L", "S"]) {
    await expect(slice.locator(`.curve.stable[data-phase="${phase}"]`)).toHaveCount(1);
    expect(await slice.locator(`.curve.metastable[data-phase="${phase}"]`).count()).toBeGreaterThan(
      0,
    );
  }
  // The shading repeats the diagram's fields along the cut: L, L + β in its checkerboard, β.
  const shades = slice.locator(".shade");
  await expect(shades).toHaveCount(3);
  expect(await shades.evaluateAll((els) => els.map((el) => el.getAttribute("data-kind")))).toEqual([
    "L",
    "L+S",
    "S",
  ]);
  const fill = await shades.nth(1).getAttribute("fill");
  expect(fill).toMatch(/^url\(#checker-.+-L\+S\)$/);
  await expect(slice.locator(`pattern${fill!.slice(4, -1).replace("+", "\\+")}`)).toHaveCount(1);
  // L + γ alone is in diamonds.
  await expect(slice.locator("pattern.checker[patternTransform]")).toHaveAttribute(
    "data-kind",
    "L+C",
  );
  // The bold values under the diagram's X axis.
  await expect(diagram(page).locator(".bold-value text")).toHaveText(["0.638", "0.948"]);
});

test("a band along the bottom edge marks the one-phase fields in their curve colours", async ({
  page,
}) => {
  const slice = slicePanel(page);
  // At 900 K in (h): L, L + β, β. Nothing under the tangent.
  const rects = slice.locator(".stable-band rect");
  await expect(rects).toHaveCount(2);
  expect(await rects.evaluateAll((els) => els.map((el) => el.getAttribute("data-kind")))).toEqual([
    "L",
    "S",
  ]);
  const curve = (phase: string) =>
    slice
      .locator(`.curve.stable[data-phase="${phase}"]`)
      .evaluate((el) => getComputedStyle(el).stroke);
  expect(await rects.nth(0).evaluate((el) => getComputedStyle(el).fill)).toBe(await curve("L"));
  expect(await rects.nth(1).evaluate((el) => getComputedStyle(el).fill)).toBe(await curve("S"));
  // 4 px high on the bottom edge, from the plot area's left end to the L + β tangent's first
  // touching point, and from its second to the right end.
  const frame = await plotArea(slice);
  const [l, s] = await Promise.all((await rects.all()).map(async (r) => (await r.boundingBox())!));
  for (const box of [l!, s!]) {
    expect(box.height).toBeCloseTo(4, 1);
    expect(box.y + box.height).toBeCloseTo(frame.y + frame.height, 0);
  }
  const touches = await centresX(slice.locator(".touch-marker.stable"));
  expect(l!.x).toBeCloseTo(frame.x, 0);
  expect(l!.x + l!.width).toBeCloseTo(touches[0]!, 0);
  expect(s!.x).toBeCloseTo(touches[1]!, 0);
  expect(s!.x + s!.width).toBeCloseTo(frame.x + frame.width, 0);
});

for (const [width, height] of [
  [900, 700],
  [600, 650],
] as const) {
  test(`in a ${width} × ${height} window, with the column under the plots, both plots still fit its height`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const bottom = async () => {
      const box = (await slicePanel(page).locator("svg").boundingBox())!;
      return box.y + box.height;
    };
    await expect.poll(bottom).toBeLessThanOrEqual(height - 16);
    expect(await bottom()).toBeGreaterThan(height - 16 - 2);
    // The column is under the plots.
    const slice = (await slicePanel(page).boundingBox())!;
    expect((await page.locator(".controls").boundingBox())!.y).toBeGreaterThan(slice.y);
  });
}

test("where the height-fitted plots leave 19rem beside them, the column moves there, also below 60rem", async ({
  page,
}) => {
  const box = async (sel: string) => (await page.locator(sel).boundingBox())!;
  /** Whether the column sits right of the plots, rather than under them. */
  const beside = async () => {
    const [plots, column] = [await box(".plots"), await box(".controls")];
    return column.x >= plots.x + plots.width && column.y < plots.y + plots.height;
  };
  // About 868 px of page: about 498 px of plots, the gap and the 19rem column fit in one row.
  await page.setViewportSize({ width: 900, height: 600 });
  await expect.poll(beside).toBe(true);
  const [plots, column] = [await box(".plots"), await box(".controls")];
  // The column's least width, 19rem, in px.
  const least = await page
    .locator(".controls")
    .evaluate((el) => parseFloat(getComputedStyle(el).flexBasis));
  expect(column.width).toBeGreaterThanOrEqual(least);
  expect(column.x + column.width).toBeCloseTo(900 - 16, 0);
  // The row's least width: the page's padding either side, the plots, the gap and the column at
  // its least width, all measured, since the plots' width follows the window's height.
  const gap = column.x - (plots.x + plots.width);
  const padding = plots.x + (900 - (column.x + column.width));
  const row = padding + plots.width + gap + least;
  // A few pixels less, and it wraps under them.
  await page.setViewportSize({ width: Math.round(row) - 4, height: 600 });
  await expect.poll(beside).toBe(false);
  expect((await box(".controls")).y).toBeGreaterThan((await box(".slice-panel")).y);
});

test("on a landscape tablet the plots narrow to fit the window's height, the column takes the rest", async ({
  page,
}) => {
  // An iPad Air in landscape, below Safari's toolbar.
  await page.setViewportSize({ width: 1180, height: 746 });
  const bottom = async () => {
    const box = (await slicePanel(page).locator("svg").boundingBox())!;
    return box.y + box.height;
  };
  await expect.poll(bottom).toBeLessThanOrEqual(746 - 16);
  expect(await bottom()).toBeGreaterThan(746 - 16 - 2);
  const area = await plotArea(diagram(page));
  // The plot areas keep their 2:1 shape.
  expect(Math.abs(area.width / area.height - 2)).toBeLessThan(0.01);
  // The column beside them, and the theme button above it, reach the page's right padding.
  for (const selector of [".controls", ".theme-toggle"]) {
    const box = (await page.locator(selector).boundingBox())!;
    expect(box.x + box.width, selector).toBeCloseTo(1180 - 16, 0);
  }
  // The column starts level with the diagram's plot area.
  const column = (await page.locator(".controls").boundingBox())!;
  expect(column.y).toBeCloseTo(area.y, 0);
});

test("each guide line runs straight from the cut on the diagram to its touching point", async ({
  page,
}) => {
  for (const T of [900, 450, 700]) {
    await setCut(page, T);
    const top = await centresX(diagram(page).locator(".touch-marker.stable"));
    const bottom = await centresX(slicePanel(page).locator(".touch-marker.stable"));
    const guidesTop = await centresX(diagram(page).locator(".guide.stable"));
    const guidesBottom = await centresX(slicePanel(page).locator(".guide.stable"));
    const values = await centresX(diagram(page).locator(".bold-tick"));
    expect(bottom.length).toBeGreaterThan(0);
    expect(top).toHaveLength(bottom.length);
    for (const xs of [top, guidesTop, guidesBottom, values]) {
      xs.forEach((x, k) => expect(Math.abs(x - bottom[k]!)).toBeLessThan(0.5));
    }
    // The diagram's markers sit on the cut.
    const cut = (await diagram(page).locator(".cut-line").boundingBox())!;
    for (const y of await centresY(diagram(page).locator(".touch-marker.stable"))) {
      expect(Math.abs(y - (cut.y + cut.height / 2))).toBeLessThan(0.5);
    }
  }
});

test("the curves, the tangents and the g axis follow the cut as it is dragged", async ({
  page,
}) => {
  const slice = slicePanel(page);
  const tangent = slice.locator(".tangent.stable").first();
  const yTicks = () => slice.locator(".y-axis .tick text").allTextContents();
  const before = { d: await tangent.getAttribute("d"), ticks: await yTicks() };

  const line = (await diagram(page).locator(".cut-line").boundingBox())!;
  const x = line.x + line.width / 2;
  const y = line.y + line.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 40, { steps: 4 });
  await page.mouse.up();

  await expect(slice.locator("svg")).not.toHaveAttribute("aria-label", /900\.0 K/);
  expect(await tangent.getAttribute("d")).not.toBe(before.d);
  // The envelope is shallower lower down, so the axis is refitted and its labels change.
  expect(await yTicks()).not.toEqual(before.ticks);
  const top = await centresX(diagram(page).locator(".touch-marker.stable"));
  const bottom = await centresX(slice.locator(".touch-marker.stable"));
  top.forEach((x, k) => expect(Math.abs(x - bottom[k]!)).toBeLessThan(0.5));

  // Above both melting points: the liquid alone, with no tangent and no bold value.
  await diagram(page).locator(".cut-handle").focus();
  await page.keyboard.press("End");
  await expect(slice.locator(".tangent.stable")).toHaveCount(0);
  await expect(slice.locator(".shade")).toHaveCount(1);
  await expect(slice.locator(".shade")).toHaveAttribute("data-kind", "L");
  await expect(diagram(page).locator(".bold-value")).toHaveCount(0);
  // At the bottom: α, α + β in its checkerboard, β.
  await page.keyboard.press("Home");
  expect(
    await slice.locator(".shade").evaluateAll((els) => els.map((el) => el.dataset.kind)),
  ).toEqual(["S", "S+S", "S"]);
});

test("at the eutectic temperature three markers lie on one tangent", async ({ page }) => {
  await setCut(page, 634.1544);
  const slice = slicePanel(page);
  await expect(slice.locator(".tangent.stable")).toHaveCount(1);
  await expect(slice.locator(".tangent.stable")).toHaveAttribute("data-points", "3");
  // In the slice panel each of the three carries the eutectic's ▼ in place of the plain circle.
  await expect(slice.locator(".touch-marker.stable")).toHaveCount(0);
  const symbols = slice.locator('.touch-symbol[data-kind="eutectic"]');
  await expect(symbols).toHaveCount(3);
  const ys = await centresY(symbols.locator(".halo"));
  // Under the tangent, its two tie lines in the eutectic's orange hatch, not a checkerboard.
  const hatched = slice.locator('.shade[data-invariant="eu"]');
  await expect(hatched).toHaveCount(2);
  for (const fill of await hatched.evaluateAll((els) => els.map((el) => el.getAttribute("fill"))))
    expect(fill).toMatch(/^url\(#hatch-\w+-eu\)$/);
  for (const y of ys) expect(Math.abs(y - ys[0]!)).toBeLessThan(0.5);
  // On the diagram the ends keep their circles, and the eutectic's own ▼ marks the middle, with
  // no metastable circle over it.
  await expect(diagram(page).locator(".touch-symbol")).toHaveCount(0);
  const ends = await centresX(diagram(page).locator(".touch-marker.stable"));
  const middle = await centresX(diagram(page).locator('.event-point[data-kind="eutectic"] .halo'));
  for (const x of await centresX(diagram(page).locator(".touch-marker.metastable")))
    expect(Math.abs(x - middle[0]!)).toBeGreaterThan(1);
  const bottom = await centresX(symbols.locator(".halo"));
  [ends[0]!, middle[0]!, ends[1]!].forEach((x, k) =>
    expect(Math.abs(x - bottom[k]!)).toBeLessThan(0.5),
  );
  await expect(diagram(page).locator(".bold-value text")).toHaveText(["0.087", "0.319", "0.913"]);
  // A hair off the invariant the plain circles come back.
  await setCut(page, 640);
  await expect(slice.locator(".touch-symbol")).toHaveCount(0);
  await expect(slice.locator(".shade[data-invariant]")).toHaveCount(0);
  await expect(slice.locator(".touch-marker.stable")).not.toHaveCount(0);
});
