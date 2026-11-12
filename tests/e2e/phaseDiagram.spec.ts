import { cutValue, expect, handle, plotArea, test } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(page.locator(".phase-diagram svg")).toBeVisible();
});

test("the handle pings until first used, marks a drag and rings while focused", async ({
  page,
}) => {
  const svg = page.locator(".phase-diagram svg");
  const knob = page.locator(".cut-handle-knob");
  await expect(page.locator(".cut-handle-ping")).toHaveCount(1);
  await expect(page.locator(".cut-handle-grip")).toHaveCount(1);
  await expect(knob).toHaveCSS("stroke", "none");

  const box = (await page.locator(".cut-line").boundingBox())!;
  await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2 + 15);
  await page.mouse.down();
  await expect(svg).toHaveClass(/cut-dragging/);
  await expect(page.locator(".cut-handle-ping")).toHaveCount(0);
  await page.mouse.up();
  await expect(svg).not.toHaveClass(/cut-dragging/);

  // The ring shows while the handle has focus, in the d2r2 purple, and again after a mouse click
  // on the theme button took the focus away.
  await expect(knob).toHaveCSS("stroke", "rgb(117, 30, 215)");
  await page.getByRole("button", { name: /^Switch to/ }).click();
  await expect(knob).toHaveCSS("stroke", "none");
  await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2 + 15);
  await page.mouse.down();
  await page.mouse.up();
  await expect(knob).not.toHaveCSS("stroke", "none");

  await page.reload();
  await expect(page.locator(".cut-handle-ping")).toHaveCount(1);
});

test("draws (h): its boundaries, the eutectic line and the axes with the component names", async ({
  page,
}) => {
  const diagram = page.locator(".phase-diagram");
  // Liquidus and solidus on each side, the two solvus lines, and both ends of each.
  expect(await diagram.locator("path.boundary.stable").count()).toBeGreaterThanOrEqual(8);
  const eutectic = diagram.locator('line.invariant[data-kind="eutectic"]');
  await expect(eutectic).toHaveCount(1);
  // It runs across the gap at 634 K, from X_B = 0.087 to 0.913.
  const frame = (await diagram.locator(".frame").boundingBox())!;
  const line = (await eutectic.boundingBox())!;
  expect((line.x - frame.x) / frame.width).toBeCloseTo(0.087, 2);
  expect((line.x + line.width - frame.x) / frame.width).toBeCloseTo(0.913, 2);
  const T = 1500 - ((line.y + line.height / 2 - frame.y) / frame.height) * 1200;
  // Within one pixel row (1200 K over the plot height).
  expect(Math.abs(T - 634.2)).toBeLessThan(1200 / frame.height);
  // (h)'s one marker is the eutectic's, a filled ▼ on its liquid; it has no critical or
  // congruent point.
  const marker = diagram.locator(".event-point");
  await expect(marker).toHaveCount(1);
  await expect(marker).toHaveAttribute("data-kind", "eutectic");
  await expect(marker.locator("title")).toHaveText("eutectic, 634 K");
  const box = (await marker.locator(".mark").boundingBox())!;
  // On the liquid at X_B = 0.319.
  expect((box.x + box.width / 2 - frame.x) / frame.width).toBeCloseTo(0.319, 2);

  await expect(diagram.locator(".y-label")).toHaveText("T (K)");
  await expect(diagram.locator(".x-label")).toHaveText("XB");
  await expect(diagram.locator('.component-name[data-end="A"]')).toHaveText("A");
  await expect(diagram.locator('.component-name[data-end="B"]')).toHaveText("B");
  // The diagram's X axis has tick marks without numbers; the slice panel's carries them.
  await expect(diagram.locator(".x-axis .tick text").first()).toHaveText("");
  await expect(page.locator(".slice-panel .x-axis .tick text").first()).toHaveText("0.0");
});

test("the four axes have no outer ticks, and the frames and axis lines square ends", async ({
  page,
}) => {
  // Without outer ticks d3 draws each axis line as one straight run: H alone across, V alone up.
  for (const [plot, axis, step] of [
    [".phase-diagram", ".x-axis", "H"],
    [".phase-diagram", ".y-axis", "V"],
    [".slice-panel", ".x-axis", "H"],
    [".slice-panel", ".y-axis", "V"],
  ] as const) {
    const domain = page.locator(`${plot} ${axis} .domain`);
    expect(await domain.getAttribute("d"), `${plot} ${axis}`).toMatch(
      new RegExp(`^M[-\\d.]+,[-\\d.]+${step}[-\\d.]+$`),
    );
    await expect(domain).toHaveCSS("stroke-linecap", "square");
  }
  for (const plot of [".phase-diagram", ".slice-panel"]) {
    await expect(page.locator(`${plot} .frame`)).toHaveCSS("stroke-linecap", "square");
  }
});

test("the bitmap holds one-phase fills and two-phase checkerboards", async ({ page }) => {
  const colours = await page.locator("canvas.regions").evaluate((el: HTMLCanvasElement) => {
    const { data } = el.getContext("2d")!.getImageData(0, 0, el.width, el.height);
    const seen = new Set<string>();
    for (let k = 0; k < data.length; k += 4) {
      seen.add(`${data[k]},${data[k + 1]},${data[k + 2]},${data[k + 3]}`);
    }
    return seen.size;
  });
  // L, S, S-alt (the α + β checkerboard), and L + S's purple and purple-alt.
  expect(colours).toBe(5);
});

test("dragging the cut line moves the cut with the pointer", async ({ page }) => {
  const line = page.locator(".cut-line");
  const before = await cutValue(page);
  const box = (await line.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  // Grab the line away from the handle, inside the 44 px hit band but off the drawn line.
  await page.mouse.move(x, y + 15);
  await page.mouse.down();
  await page.mouse.move(x, y - 60, { steps: 5 });
  await page.mouse.up();
  expect(await cutValue(page)).toBeGreaterThan(before);
  const moved = (await line.boundingBox())!;
  // The grab offset is kept, so the line moves by the whole drag.
  expect(moved.y + moved.height / 2).toBeCloseTo(y - 75, 0);
  // The side column follows.
  await expect(page.getByRole("spinbutton", { name: /Cut temperature.*typed value/ })).toHaveValue(
    (await cutValue(page)).toFixed(1),
  );

  // Dragging far past the top clamps to the window.
  await page.mouse.move(x, y - 75);
  await page.mouse.down();
  await page.mouse.move(x, 0, { steps: 3 });
  await page.mouse.up();
  expect(await cutValue(page)).toBe(1500);
});

test("a resize during a drag keeps the grabbed temperature under the pointer", async ({ page }) => {
  const slider = page.getByRole("slider", { name: "Cut temperature T* (K)" });
  const Tmin = Number(await slider.getAttribute("min"));
  const Tmax = Number(await slider.getAttribute("max"));
  /** The page y of temperature `T` in the plot area `area`, and back. */
  const yOf = (area: DOMRect, T: number) => area.y + ((Tmax - T) / (Tmax - Tmin)) * area.height;
  const TAt = (area: DOMRect, y: number) => Tmax - ((y - area.y) / area.height) * (Tmax - Tmin);
  const diagram = page.locator(".phase-diagram");
  const before = await cutValue(page);
  const area = await plotArea(diagram);
  const line = (await page.locator(".cut-line").boundingBox())!;
  // Grabbed 10 px below the line, inside its hit band, at a whole pixel.
  const x = Math.round(line.x + line.width / 3);
  const y = Math.round(yOf(area, before)) + 10;
  const grabbed = TAt(area, y);
  await page.mouse.move(x, y);
  await page.mouse.down();
  // A shorter window, as when a phone rotates: the plots shrink to fit its height.
  await page.setViewportSize({ width: 1280, height: 450 });
  await expect.poll(async () => (await plotArea(diagram)).height).toBeLessThan(area.height - 100);
  const resized = await plotArea(diagram);
  // The pointer over the grabbed temperature again: the cut is back where it was. An offset kept
  // in pixels would put it 10 px of the new, coarser scale away instead, some 40 K.
  const xNow = resized.x + ((x - area.x) / area.width) * resized.width;
  await page.mouse.move(xNow, yOf(resized, grabbed), { steps: 3 });
  await page.mouse.up();
  expect(Math.abs((await cutValue(page)) - before)).toBeLessThanOrEqual(1);
});

test("the keyboard steps the cut on its handle", async ({ page }) => {
  await handle(page).focus();
  await expect(handle(page)).toHaveAccessibleName("Cut line, T* (K)");
  await page.keyboard.press("Home");
  expect(await cutValue(page)).toBe(300);
  await page.keyboard.press("ArrowUp");
  expect(await cutValue(page)).toBe(310);
  await page.keyboard.press("PageUp");
  expect(await cutValue(page)).toBe(410);
  await page.keyboard.press("ArrowDown");
  expect(await cutValue(page)).toBe(400);
  await page.keyboard.press("End");
  expect(await cutValue(page)).toBe(1500);
  await expect(handle(page)).toHaveAttribute("aria-valuetext", "1500.0 K");
});

test("the slider and the number field set the cut", async ({ page }) => {
  const number = page.getByRole("spinbutton", { name: /Cut temperature.*typed value/ });
  await number.fill("634.2");
  await number.press("Enter");
  expect(await cutValue(page)).toBe(634.2);
  // Outside the window it is clamped, and the field shows where to.
  await number.fill("5000");
  await number.press("Enter");
  expect(await cutValue(page)).toBe(1500);
  await expect(number).toHaveValue("1500.0");

  const slider = page.getByRole("slider", { name: "Cut temperature T* (K)" });
  await slider.focus();
  await slider.fill("700");
  expect(await cutValue(page)).toBe(700);
  await expect(number).toHaveValue("700.0");
});
