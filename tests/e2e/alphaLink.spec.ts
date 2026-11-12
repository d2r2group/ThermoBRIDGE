import type { Page } from "@playwright/test";
import { diagram, expect, menu, plotArea, test, warning } from "./fixtures";

// The α mode's share link and layouts (plan §9 phase 18): Share writes `;A`, or `;A,l` with the
// lock ticked, in place of the view; such a link opens in the α mode at its system; and the pad
// and slider fit each layout of §4.2 as the slice panel does.

const knob = (page: Page) => page.locator(".alpha-knob");
const pad = (page: Page) => page.locator(".alpha-pad svg");
const slider = (page: Page) => page.getByRole("slider", { name: /T_m,B/ });
const lock = (page: Page) => page.getByRole("checkbox", { name: "Stay on the axes" });
const mode = (page: Page) => page.locator("#app").getAttribute("data-mode");
const share = (page: Page) => page.getByRole("button", { name: "Share" });

/** Records what Share copies, with `navigator.share` taken away. */
async function stubClipboard(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { copied: string[] };
    w.copied = [];
    Object.defineProperty(navigator, "share", { value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async (text: string) => void w.copied.push(text) },
    });
  });
}
const lastCopied = async (page: Page) => {
  const all = await page.evaluate(() => (window as unknown as { copied: string[] }).copied);
  return new URL(all.at(-1)!).hash;
};

async function open(page: Page, hash = "") {
  await page.goto(`./${hash}`);
  await expect(page.locator(".phase-diagram svg")).toBeVisible();
}

test("#h;A opens the α mode at (h) with the lock unticked, and clears the fragment", async ({
  page,
}) => {
  await open(page, "#h;A");
  expect(await mode(page)).toBe("alpha");
  await expect(knob(page)).toHaveAttribute("aria-valuetext", "αₛ +15, αₗ 0 kJ/mol");
  await expect(slider(page)).toHaveValue("1200");
  await expect(lock(page)).not.toBeChecked();
  await expect(menu(page)).toHaveValue("h");
  await expect(warning(page)).toBeEmpty();
  expect(new URL(page.url()).hash).toBe("");
  // Nothing moved, so the Δg^M mode takes the linked system as it is.
  await page.getByRole("radio", { name: "Delta g M" }).check();
  await expect(menu(page)).toHaveValue("h");
});

test("#…;A,l opens with the lock ticked; a link pasted in the α mode applies too", async ({
  page,
}) => {
  await open(page, "#1,x,A,B,800,1005,10,10,10,2.5,300,1500;A,l");
  expect(await mode(page)).toBe("alpha");
  await expect(knob(page)).toHaveAttribute("aria-valuetext", "αₛ +2.5, αₗ +10 kJ/mol");
  await expect(slider(page)).toHaveValue("1005");
  await expect(lock(page)).toBeChecked();
  await page.evaluate(() => (location.hash = "#o;A"));
  await expect(knob(page)).toHaveAttribute("aria-valuetext", "αₛ 0, αₗ +10 kJ/mol");
  await expect(lock(page)).not.toBeChecked();
  // And a link without A goes back to the Δg^M mode.
  await page.evaluate(() => (location.hash = "#c;T,700"));
  await expect(menu(page)).toHaveValue("c");
  expect(await mode(page)).toBe("dg");
});

test("a link with both a view and A warns and stays in the Δg^M mode", async ({ page }) => {
  await open(page, "#h;T,700;A");
  await expect(warning(page)).toContainText("it has both a view and the α mode");
  expect(await mode(page)).toBe("dg");
});

test("Share in the α mode writes ;A, or ;A,l with the lock ticked, and opens again", async ({
  page,
}) => {
  await stubClipboard(page);
  await open(page, "#h");
  await page.getByRole("radio", { name: "Alpha" }).check();
  await share(page).click();
  expect(await lastCopied(page)).toBe("#h;A");
  await lock(page).check();
  await share(page).click();
  await expect.poll(() => lastCopied(page)).toBe("#h;A,l");
  await lock(page).uncheck();
  await knob(page).focus();
  await page.keyboard.press("ArrowUp");
  await expect(knob(page)).toHaveAttribute("aria-valuetext", "αₛ +15, αₗ +1 kJ/mol");
  await share(page).click();
  await expect.poll(() => lastCopied(page)).toMatch(/^#1,.*,800,1200,10,10,1,15,100,1900;A$/);
  const link = await lastCopied(page);

  await open(page, link);
  expect(await mode(page)).toBe("alpha");
  await expect(knob(page)).toHaveAttribute("aria-valuetext", "αₛ +15, αₗ +1 kJ/mol");
  await expect(lock(page)).not.toBeChecked();
  // The Δg^M mode's Share writes its view, as before.
  await page.getByRole("radio", { name: "Delta g M" }).check();
  await share(page).click();
  await expect.poll(() => lastCopied(page)).toMatch(/;T,1000$/);
});

for (const [width, height, beside] of [
  [1280, 960, true],
  [900, 700, false],
  [390, 844, false],
] as const) {
  test(`at ${width} × ${height} the pad and slider fit the slice panel's box`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await open(page);
    const column = page.locator(".controls");
    const before = (await column.boundingBox())!;
    const slice = (await page.locator(".slice-panel").boundingBox())!;
    const plotBefore = await plotArea(diagram(page));
    await page.getByRole("radio", { name: "Alpha" }).check();
    await expect(knob(page)).toBeVisible();

    // The diagram and the column stay where the Δg^M mode put them: beside or under the plots.
    expect(await plotArea(diagram(page))).toEqual(plotBefore);
    const after = (await column.boundingBox())!;
    expect(Math.abs(after.x - before.x)).toBeLessThan(1);
    expect(Math.abs(after.y - before.y)).toBeLessThan(1);
    if (beside) expect(after.x).toBeGreaterThanOrEqual(slice.x + slice.width);
    else expect(after.y).toBeGreaterThanOrEqual(slice.y + slice.height);

    // The pad is square, under X = 0 and inside the box; the slider keeps 44 px of width.
    const square = (await pad(page).boundingBox())!;
    expect(Math.abs(square.width - square.height)).toBeLessThan(1);
    expect(Math.abs(square.x - plotBefore.x)).toBeLessThan(1);
    expect(square.y).toBeGreaterThanOrEqual(slice.y);
    expect(square.y + square.height).toBeLessThanOrEqual(slice.y + slice.height);
    const range = (await slider(page).boundingBox())!;
    expect(range.width).toBeGreaterThanOrEqual(44);
    expect(range.x).toBeGreaterThanOrEqual(square.x + square.width);
    expect(range.x + range.width).toBeLessThanOrEqual(slice.x + slice.width);
    // Nothing scrolls sideways.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  });
}
