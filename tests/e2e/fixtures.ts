// The shared e2e setup: every spec imports `test` and `expect` from here instead of
// "@playwright/test", so each test fails on any page error or console error, and the locators that
// several specs need are written once.

import { test as base, expect, type Locator, type Page } from "@playwright/test";

export { expect };

/**
 * Playwright's `test`, with every page's uncaught errors and console errors collected and required
 * to be none when the test ends. They are collected on the context, so pages a test opens besides
 * `page` count too. Console warnings are not errors.
 */
export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: [
    async ({ context }, use) => {
      const seen: string[] = [];
      context.on("weberror", (err) => seen.push(err.error().message));
      context.on("console", (msg) => {
        if (msg.type() === "error") seen.push(msg.text());
      });
      await use(seen);
      expect(seen, "page and console errors").toEqual([]);
    },
    { auto: true },
  ],
});

// The diagram and the cut.

export const diagram = (page: Page) => page.locator(".phase-diagram");
export const slicePanel = (page: Page) => page.locator(".slice-panel");
/** The draggable handle on the cut line; the side column has a range slider of its own. */
export const handle = (page: Page) => page.locator(".cut-handle");
/** The cut temperature T*, K, as the handle reports it. */
export const cutValue = async (page: Page) =>
  Number(await handle(page).getAttribute("aria-valuenow"));

/** Types `T` into the cut's number field and applies it with Enter. */
export async function setCut(page: Page, T: number) {
  const number = page.getByRole("spinbutton", { name: /Cut temperature.*typed value/ });
  await number.fill(String(T));
  await number.press("Enter");
}

/** A plot's area in page pixels; a locator's bounding box would take in the frame's stroke. */
export const plotArea = (plot: Locator) =>
  plot.locator(".frame").evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);

/** The page x of each element's centre, left to right. */
export async function centresX(items: Locator): Promise<number[]> {
  const boxes = await Promise.all((await items.all()).map((el) => el.boundingBox()));
  return boxes.map((b) => b!.x + b!.width / 2).sort((a, b) => a - b);
}

// The lever rule.

export const leverToggle = (page: Page) => page.getByRole("button", { name: "Lever rule" });
export const knob = (page: Page) => page.locator(".lever-knob");
/** The overall composition X₀, as the knob reports it. */
export const X0 = async (page: Page) => Number(await knob(page).getAttribute("aria-valuenow"));

// The System menu and the Parameters panel.

export const menu = (page: Page) => page.getByRole("combobox", { name: "System" });
export const field = (page: Page, name: string) =>
  page.locator(`.parameters input[name="${name}"]`);
export const applyButton = (page: Page) => page.getByRole("button", { name: "Apply" });
export const autoBox = (page: Page) => page.getByRole("checkbox", { name: "Automatic window" });
/** The Parameters panel's list of validation issues, or its one-line warning. */
export const warning = (page: Page) => page.locator(".validation");
/** Every stable boundary's path, which changes with the system. */
export const boundaries = (page: Page) =>
  page
    .locator(".phase-diagram path.boundary.stable")
    .evaluateAll((els) => els.map((el) => el.getAttribute("d")));

/** Sets the viewport's width and keeps its height, the config's unless a test changed it. */
export async function setWidth(page: Page, width: number) {
  await page.setViewportSize({ width, height: page.viewportSize()!.height });
}
