// Adapted from pTerrain's tests/e2e/about.spec.ts.

import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, leverToggle, test } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(page.locator(".phase-diagram svg")).toBeVisible();
});

const openButton = (page: Page) => page.getByRole("button", { name: "About", exact: true });
const dialog = (page: Page) => page.getByRole("dialog", { name: "About ThermoBRIDGE" });

test("the info button sits right of the logo, borderless and 44 px square", async ({ page }) => {
  const logo = (await page.locator(".logo").boundingBox())!;
  const info = (await openButton(page).boundingBox())!;
  expect(info.x).toBeGreaterThanOrEqual(logo.x + logo.width);
  expect(Math.abs(info.y + info.height / 2 - (logo.y + logo.height / 2))).toBeLessThan(3);
  expect(info.width).toBe(44);
  expect(info.height).toBe(44);
  await expect(openButton(page)).toHaveCSS("border-top-width", "0px");
  await expect(openButton(page)).toHaveAttribute("title", /what each of its buttons is for/);
});

test("it opens a modal overlay that summarizes the app and explains each control", async ({
  page,
}) => {
  await openButton(page).click();
  await expect(dialog(page)).toBeVisible();
  expect(await dialog(page).evaluate((el) => el.matches(":modal"))).toBe(true);
  await expect(dialog(page).locator(".dialog-body > p").first()).toContainText("phase diagram");
  // It spells out the name, with the capitals of "BRIDGE" in bold.
  await expect(dialog(page).locator(".dialog-body > p").first()).toContainText(
    "ThermoBRIDGE (Binary Regular-solution Interactive Diagram Generator for Education)",
  );
  expect(
    await dialog(page).locator(".dialog-body > p").first().locator("b").allTextContents(),
  ).toEqual(["B", "R", "I", "D", "G", "E"]);
  const names = await dialog(page).locator("dt .visually-hidden").allTextContents();
  expect(names).toEqual([
    "Logo",
    "Mode",
    "System menu",
    "Lever",
    "Metastable",
    "Labels",
    "Share",
    "Theme",
    "α pad",
    "Stay on the axes",
    "T_m,B slider",
    "Line Compound",
    "Compound sliders",
    "Pad or sliders",
    "Parameters",
    "Add compound",
    "Apply",
    "Import and Export",
    "Model Details",
  ]);
  // Every key holds a copy of its control, and every copy is described.
  for (const key of await dialog(page).locator(".about-key").all())
    expect(await key.evaluate((el) => el.childElementCount)).toBeGreaterThan(0);
  expect(await dialog(page).locator("dd").count()).toBe(names.length);
});

test("the copies look like the controls, show their state and do nothing", async ({ page }) => {
  await leverToggle(page).click();
  await openButton(page).click();
  const copy = (sel: string) => dialog(page).locator(`.about-key ${sel}`);
  // Styled as on the page.
  for (const sel of [".lever-toggle", ".metastable-toggle", ".share"]) {
    const [real, copied] = await Promise.all(
      [page.locator(`header ${sel}`), copy(sel)].map((l) =>
        l.evaluate((el) => {
          const s = getComputedStyle(el);
          return [s.height, s.borderTopWidth, s.borderRadius, s.backgroundColor];
        }),
      ),
    );
    expect(copied, sel).toEqual(real);
  }
  // The theme key shows both symbols, moon / sun.
  await expect(dialog(page).locator(".about-key .theme-toggle")).toHaveCount(2);
  await expect(dialog(page).locator(".about-slash")).toHaveText("/");
  // In the page's current state.
  await expect(copy(".lever-toggle")).toHaveAttribute("aria-pressed", "true");
  // Inert: neither focusable nor clickable, and hidden from screen readers.
  await expect(dialog(page).getByRole("button", { name: "Lever rule" })).toHaveCount(0);
  await copy(".lever-toggle").click({ force: true });
  await page.keyboard.press("Escape");
  await expect(page.locator("header .lever-toggle")).toHaveAttribute("aria-pressed", "true");
});

test("only its body scrolls, not the dialog around it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await openButton(page).click();
  const about = page.locator(".about");
  expect(await about.evaluate((el) => el.scrollHeight - el.clientHeight)).toBe(0);
  const body = about.locator(".dialog-body");
  expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
});

test("Esc closes it and returns focus to the info button", async ({ page }) => {
  await openButton(page).click();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeHidden();
  await expect(openButton(page)).toBeFocused();
});

test("on a phone it causes no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openButton(page).click();
  await expect(dialog(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false,
  );
});

test("it shows copies of the mode toggle, the α pad, the lock, the sliders and Line Compound", async ({
  page,
}) => {
  await page.getByRole("radio", { name: "Alpha" }).check();
  await openButton(page).click();
  const copy = (sel: string) => dialog(page).locator(`.about-key ${sel}`);
  // The toggle's copy shows the α mode, and leaves the page's toggle as it was.
  await expect(copy(".mode-toggle input")).toHaveCount(2);
  expect(
    await copy(".mode-toggle input").evaluateAll((els) =>
      els.map((el) => (el as HTMLInputElement).checked),
    ),
  ).toEqual([false, true]);
  await expect(page.locator("header .mode-toggle input[value=alpha]")).toBeChecked();
  // The pad's copy is scaled to the key, with the knob and the seven grid presets.
  const pad = copy(".alpha-pad svg");
  const box = (await pad.boundingBox())!;
  expect(box.width).toBe(160);
  expect(box.height).toBe(160);
  await expect(pad).toHaveAttribute("viewBox", /^0 0 \d+(\.\d+)? \d+(\.\d+)?$/);
  await expect(copy(".alpha-pad .pad-preset")).toHaveCount(7);
  await expect(copy(".alpha-pad .alpha-knob")).toHaveCount(1);
  await expect(copy(".alpha-lock input")).not.toBeChecked();
  expect((await copy(".tmb-input input[type=range]").boundingBox())!.height).toBeGreaterThan(70);
  // Line Compound, and the compound's three sliders, shown though the box is unticked.
  await expect(copy(".alpha-add-compound input")).not.toBeChecked();
  await expect(copy(".alpha-compound input[type=range]")).toHaveCount(3);
  for (const range of await copy(".alpha-compound input[type=range]").all()) {
    expect((await range.boundingBox())!.height).toBeGreaterThan(70);
  }
  // Inert: the knob's copy is no slider for screen readers.
  await expect(dialog(page).getByRole("slider")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("header .mode-toggle input[value=alpha]")).toBeChecked();
});

test("axe finds no violations in the open About overlay", async ({ page }) => {
  await openButton(page).click();
  await expect(dialog(page)).toBeVisible();
  const results = await new AxeBuilder({ page }).include(".about").analyze();
  expect(results.violations).toEqual([]);
});
