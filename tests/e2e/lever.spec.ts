import type { Page } from "@playwright/test";
import {
  cutValue,
  diagram,
  expect,
  knob,
  leverToggle,
  plotArea,
  setCut,
  test,
  X0,
} from "./fixtures";

// The lever rule (plan §4 item 7, §9 phase 7) on (h), the default system.

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(page.locator(".phase-diagram svg")).toBeVisible();
});

/** The phases on one line in the diagram's top-left corner. */
const summary = (page: Page) => page.locator(".phase-diagram .lever-summary");

async function setX0(page: Page, X: number) {
  const number = page.getByRole("spinbutton", { name: /Overall composition/ });
  await number.fill(String(X));
  await number.press("Enter");
}

test("the cut's handle hides while the knob covers it at the right end", async ({ page }) => {
  const cutHandle = page.locator(".cut-handle");
  await leverToggle(page).click();
  await setX0(page, 1);
  await expect(cutHandle).toHaveCSS("opacity", "0");
  await expect(cutHandle).toHaveCSS("pointer-events", "none");
  // Focus brings it back while it has it.
  await cutHandle.focus();
  await expect(cutHandle).toHaveCSS("opacity", "1");
  await knob(page).focus();
  await expect(cutHandle).toHaveCSS("opacity", "0");
  // Moving the knob away shows it again.
  await setX0(page, 0.9);
  await expect(cutHandle).toHaveCSS("opacity", "1");
  // So does turning the lever rule off.
  await setX0(page, 1);
  await leverToggle(page).click();
  await expect(cutHandle).toHaveCSS("opacity", "1");
});

test("the Lever toggle shows and hides the knob, the marker and the readout", async ({ page }) => {
  const toggle = leverToggle(page);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(knob(page)).toBeHidden();
  await expect(page.locator(".slice-panel .lever-marker")).toBeHidden();
  await expect(page.getByRole("region", { name: "Lever rule" })).toBeHidden();
  await expect(page.locator(".readout-lever")).toBeHidden();

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(knob(page)).toBeVisible();
  await expect(page.locator(".slice-panel .lever-marker")).toBeVisible();
  await expect(page.getByRole("region", { name: "Lever rule" })).toBeVisible();
  expect(await X0(page)).toBe(0.5);
  // At 900 K and X₀ = 0.5 (h) is all liquid.
  await expect(page.locator(".lever-phases li")).toHaveText(["L: 100\u00a0%"]);
  await expect(page.locator(".readout-lever")).toHaveText(
    "Lever rule at X₀ = 0.500: L: 100\u00a0%",
  );
  await expect(page.locator(".lever-tie")).toBeHidden();
  await expect(summary(page)).toHaveText("L: 100\u00a0%");

  await toggle.click();
  await expect(knob(page)).toBeHidden();
  await expect(summary(page)).toBeHidden();
});

test("in a two-phase field the bold tie line runs between its ends, with the arms' shares", async ({
  page,
}) => {
  await leverToggle(page).click();
  await setCut(page, 700);
  await setX0(page, 0.6);
  // At 700 K: L at 0.396 and β at 0.918.
  const frame = (await page.locator(".phase-diagram .frame").boundingBox())!;
  const tie = (await page.locator(".lever-tie").boundingBox())!;
  expect((tie.x + 2 - frame.x) / frame.width).toBeCloseTo(0.396, 2);
  expect((tie.x + tie.width - 2 - frame.x) / frame.width).toBeCloseTo(0.918, 2);
  const rows = page.locator(".lever-phases li");
  await expect(rows).toHaveText([
    /^L, XB = 0\.396: (\d+)\u00a0%$/,
    /^β, XB = 0\.918: (\d+)\u00a0%$/,
  ]);
  const shares = (await rows.allTextContents()).map((t) => Number(t.match(/(\d+)\u00a0%/)![1]));
  expect(shares[0]! + shares[1]!).toBe(100);
  // The same on one line in the plot area's top-left corner.
  await expect(summary(page)).toHaveText(
    `L, XB = 0.396: ${shares[0]}\u00a0%  ·  β, XB = 0.918: ${shares[1]}\u00a0%`,
  );
  const line = (await summary(page).boundingBox())!;
  expect(line.x - frame.x).toBeGreaterThan(0);
  expect(line.x - frame.x).toBeLessThan(10);
  expect(line.y - frame.y).toBeGreaterThanOrEqual(0);
  expect(line.y + line.height - frame.y).toBeLessThan(28);
  // Each arm carries the share of the phase at its other end: β's over the arm towards L.
  await expect(page.locator('.lever-fraction[data-side="left"]')).toHaveText(
    `β ${shares[1]}\u00a0%`,
  );
  await expect(page.locator('.lever-fraction[data-side="right"]')).toHaveText(
    `L ${shares[0]}\u00a0%`,
  );
  const left = (await page.locator('.lever-fraction[data-side="left"]').boundingBox())!;
  const knobBox = (await page.locator(".lever-knob-dot").boundingBox())!;
  expect(left.x + left.width).toBeLessThan(knobBox.x + knobBox.width / 2);

  // In the slice panel the marker sits on the tangent, under the knob.
  const marker = (await page.locator(".slice-panel .lever-marker").boundingBox())!;
  expect(marker.x + marker.width / 2).toBeCloseTo(knobBox.x + knobBox.width / 2, 0);
});

test("at an invariant the three phases are listed without shares", async ({ page }) => {
  await leverToggle(page).click();
  await page.locator("header .logo button").click();
  await expect(page.locator(".lever-phases li")).toHaveText([
    /^α, XB = 0\.087$/,
    /^L, XB = 0\.319$/,
    /^β, XB = 0\.913$/,
  ]);
  await expect(page.locator(".lever-note")).toBeVisible();
  await expect(summary(page)).toHaveText("α, XB = 0.087  ·  L, XB = 0.319  ·  β, XB = 0.913");
  await expect(page.locator(".lever-tie")).toBeHidden();
});

test("X₀ survives moving the cut and choosing a preset", async ({ page }) => {
  await leverToggle(page).click();
  await setX0(page, 0.3);
  await setCut(page, 500);
  expect(await X0(page)).toBe(0.3);
  await page.getByRole("combobox", { name: "System" }).selectOption("n");
  expect(await X0(page)).toBe(0.3);
  await expect(page.getByRole("spinbutton", { name: /Overall composition/ })).toHaveValue("0.300");
});

test("dragging the knob moves X₀ with the pointer and leaves the cut", async ({ page }) => {
  await leverToggle(page).click();
  const cut = await cutValue(page);
  const frame = (await page.locator(".phase-diagram .frame").boundingBox())!;
  const box = (await page.locator(".lever-knob-dot").boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  // Grabbed off-centre: the offset is kept, so X₀ moves by the drag alone.
  await page.mouse.move(x + 4, y + 3);
  await page.mouse.down();
  await page.mouse.move(x + 4 - 0.25 * frame.width, y + 30, { steps: 5 });
  await page.mouse.up();
  expect(await X0(page)).toBeCloseTo(0.25, 2);
  expect(await cutValue(page)).toBe(cut);
  await expect(page.getByRole("spinbutton", { name: /Overall composition/ })).toHaveValue(
    (await X0(page)).toFixed(3),
  );
  // Past the left end it clamps to 0.
  await page.mouse.move(x - 0.25 * frame.width, y);
  await page.mouse.down();
  await page.mouse.move(0, y, { steps: 3 });
  await page.mouse.up();
  expect(await X0(page)).toBe(0);
});

test("dragging the knob lifts it with a grabbing cursor, as the cut's drag does", async ({
  page,
}) => {
  await leverToggle(page).click();
  const svg = page.locator(".phase-diagram svg");
  const dot = page.locator(".lever-knob-dot");
  const box = (await dot.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(svg).toHaveClass(/lever-dragging/);
  await expect(svg).not.toHaveClass(/cut-dragging/);
  await expect(svg).toHaveCSS("cursor", "grabbing");
  await expect(dot).not.toHaveCSS("filter", "none");
  // The knob has focus, ringed in the focus colour, as the cut's handle is.
  await expect(knob(page)).toBeFocused();
  await expect(dot).toHaveCSS("stroke", "rgb(117, 30, 215)");
  await page.mouse.up();
  await expect(svg).not.toHaveClass(/lever-dragging/);
  await expect(dot).toHaveCSS("filter", "none");
  // A mouse click elsewhere (here the theme button, so the ring turns the dark theme's purple)
  // takes the ring away, and the next drag brings it back.
  await page.getByRole("button", { name: /^Switch to/ }).click();
  await expect(dot).not.toHaveCSS("stroke", "rgb(175, 121, 236)");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await expect(dot).toHaveCSS("stroke", "rgb(175, 121, 236)");
});

test("a release applies the last pointer position at once, between frames", async ({ page }) => {
  await leverToggle(page).click();
  const frame = (await page.locator(".phase-diagram .frame").boundingBox())!;
  const box = (await page.locator(".lever-knob-dot").boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  // One move and the release in the same task, so no animation frame runs between them.
  await page.evaluate(
    ([toX, atY]) => {
      const svg = document.querySelector(".phase-diagram svg")!;
      const at = { clientX: toX, clientY: atY, pointerId: 1, bubbles: true, isPrimary: true };
      svg.dispatchEvent(new PointerEvent("pointermove", at));
      svg.dispatchEvent(new PointerEvent("pointerup", at));
    },
    [x - 0.2 * frame.width, y] as const,
  );
  expect(await X0(page)).toBeCloseTo(0.3, 2);
  await page.mouse.up();
});

test("a resize during a drag keeps the grabbed composition under the pointer", async ({ page }) => {
  await leverToggle(page).click();
  const dot = page.locator(".lever-knob-dot");
  const before = await X0(page);
  const area = await plotArea(diagram(page));
  const box = (await dot.boundingBox())!;
  // Grabbed 8 px right of its centre, inside the knob, at a whole pixel.
  const x = Math.round(box.x + box.width / 2) + 8;
  const grabbed = (x - area.x) / area.width;
  await page.mouse.move(x, box.y + box.height / 2);
  await page.mouse.down();
  // A shorter window, as when a phone rotates: the plots shrink to fit its height.
  await page.setViewportSize({ width: 1280, height: 450 });
  await expect
    .poll(async () => (await plotArea(diagram(page))).width)
    .toBeLessThan(area.width - 200);
  const resized = await plotArea(diagram(page));
  const moved = (await dot.boundingBox())!;
  // The pointer over the grabbed composition again: X₀ is back where it was. An offset kept in
  // pixels would put it 8 px of the new, coarser scale away instead, more than 0.01.
  await page.mouse.move(resized.x + grabbed * resized.width, moved.y + moved.height / 2, {
    steps: 3,
  });
  await page.mouse.up();
  expect(Math.abs((await X0(page)) - before)).toBeLessThanOrEqual(0.005);
});

test("the keyboard steps X₀ on the knob", async ({ page }) => {
  await leverToggle(page).click();
  await knob(page).focus();
  await expect(knob(page)).toHaveAccessibleName("Overall composition X₀");
  await page.keyboard.press("ArrowRight");
  expect(await X0(page)).toBe(0.51);
  await page.keyboard.press("PageDown");
  expect(await X0(page)).toBe(0.41);
  await page.keyboard.press("Home");
  expect(await X0(page)).toBe(0);
  await page.keyboard.press("End");
  expect(await X0(page)).toBe(1);
  await expect(knob(page)).toHaveAttribute("aria-valuetext", "1.000");
});

test("the X₀ slider sets X₀ and follows the number field and the knob", async ({ page }) => {
  await leverToggle(page).click();
  const slider = page.getByRole("slider", {
    name: "Overall composition X₀, mole fraction of B",
  });
  const number = page.getByRole("spinbutton", { name: /Overall composition/ });
  await expect(slider).toHaveAttribute("min", "0");
  await expect(slider).toHaveAttribute("max", "1");
  await expect(slider).toHaveValue("0.5");
  await slider.fill("0.25");
  expect(await X0(page)).toBe(0.25);
  await expect(number).toHaveValue("0.250");
  await expect(slider).toHaveAttribute("aria-valuetext", "0.250");
  await setX0(page, 0.7);
  await expect(slider).toHaveValue("0.7");
  await knob(page).focus();
  await page.keyboard.press("ArrowRight");
  await expect(slider).toHaveValue(String(await X0(page)));
});
