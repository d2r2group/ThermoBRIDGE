import { devices, type Page } from "@playwright/test";
import { cutValue, expect, leverToggle, test, X0 } from "./fixtures";

// A phone with a touch screen. The browser comes from the project, so the device's own browser
// type is not taken over.
const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = devices["Pixel 7"];
test.use({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent });

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(page.locator(".phase-diagram svg")).toBeVisible();
});

/**
 * Drags one finger from (x, y) by (dx, dy), in `steps` moves, through real touch events. The finger
 * holds still before it lifts, so the drag does not end in a fling (as in pTerrain's tests).
 */
async function touchDrag(page: Page, x: number, y: number, dy: number, steps = 6, dx = 0) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: "touchStart" | "touchMove" | "touchEnd", t: number) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x: x + dx * t, y: y + dy * t, id: 1 }],
    });
  await touch("touchStart", 0);
  for (let k = 1; k <= steps; k++) await touch("touchMove", k / steps);
  // Chromium takes a pointer as stopped once it has not moved for 40 ms. Each move is dispatched
  // before `send` returns, so the page's clock now is no earlier than the last move.
  const lastMove = await page.evaluate(() => performance.now());
  await expect
    .poll(() => page.evaluate((t) => performance.now() - t, lastMove), { intervals: [20] })
    .toBeGreaterThan(40);
  await touch("touchMove", 1);
  await touch("touchEnd", 1);
  await cdp.detach();
}

test("the main row sits under the logo, the cut input below the plots, and nothing scrolls sideways", async ({
  page,
}) => {
  const diagram = (await page.locator(".phase-diagram svg").boundingBox())!;
  const slice = (await page.locator(".slice-panel svg").boundingBox())!;
  const cutInput = (await page.locator(".cut-input").boundingBox())!;
  expect(slice.y).toBeGreaterThanOrEqual(diagram.y + diagram.height - 0.5);
  expect(Math.abs(slice.x - diagram.x)).toBeLessThan(0.5);
  expect(cutInput.y).toBeGreaterThanOrEqual(slice.y + slice.height);
  expect(cutInput.x + cutInput.width).toBeLessThanOrEqual(viewport.width);
  const items = await page
    .locator("header .logo, header .info-button, header .theme-toggle")
    .evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { right: r.right, centre: r.top + r.height / 2 };
      }),
    );
  for (const b of items) expect(Math.abs(b.centre - items[0]!.centre)).toBeLessThan(3);
  expect(items.at(-1)!.right).toBeLessThanOrEqual(viewport.width);
  // At 412 px the menu would get narrower than 9rem beside the logo, so the row moves under it,
  // compacted: the Lever balance and the Metastable eye without their labels.
  const logo = (await page.locator("header .logo").boundingBox())!;
  const row = (await page.locator(".main-row").boundingBox())!;
  expect(row.y).toBeGreaterThanOrEqual(logo.y + logo.height);
  expect(row.x + row.width).toBeLessThanOrEqual(viewport.width);
  await expect(page.locator(".metastable-toggle .label")).toBeHidden();
  await expect(page.getByRole("button", { name: "Metastable" })).toBeVisible();
  await expect(page.locator(".lever-toggle .label")).toBeHidden();
  await expect(page.getByRole("button", { name: "Lever rule" })).toBeVisible();
  const [scrollWidth, innerWidth] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
});

test("a tap on the logo and on a preset works on a touch screen", async ({ page }) => {
  await page.locator("header .logo button").tap();
  expect(await cutValue(page)).toBeCloseTo(634.2, 1);
  await page.getByRole("combobox", { name: "System" }).selectOption("n");
  await expect(page.locator("header .logo button")).toHaveAttribute("aria-disabled", "true");
  expect(await cutValue(page)).toBe(900);
});

test("a finger drags the cut line without scrolling the page", async ({ page }) => {
  const before = await cutValue(page);
  const box = (await page.locator(".cut-line").boundingBox())!;
  const x = box.x + box.width / 3;
  const y = box.y + box.height / 2;
  await touchDrag(page, x, y + 10, -30);
  expect(await cutValue(page)).toBeGreaterThan(before);
  const moved = (await page.locator(".cut-line").boundingBox())!;
  expect(moved.y + moved.height / 2).toBeCloseTo(y - 30, 0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.getByRole("spinbutton", { name: /Cut temperature.*typed value/ })).toHaveValue(
    (await cutValue(page)).toFixed(1),
  );
});

test("a finger drags the lever knob along the cut without moving the cut", async ({ page }) => {
  await leverToggle(page).tap();
  const cut = await cutValue(page);
  const frame = (await page.locator(".phase-diagram .frame").boundingBox())!;
  const box = (await page.locator(".lever-knob-dot").boundingBox())!;
  await touchDrag(page, box.x + box.width / 2, box.y + box.height / 2, 0, 6, 0.2 * frame.width);
  expect(await X0(page)).toBeCloseTo(0.7, 2);
  expect(await cutValue(page)).toBe(cut);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});
