import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import {
  applyButton,
  diagram,
  expect,
  field,
  handle,
  leverToggle,
  menu,
  setWidth,
  slicePanel,
  test,
} from "./fixtures";

// The α mode's page (plan §9 phase 16): the toggle, what it greys out and hides, the diagram's X
// axis, the Parameters panel and the readout. The pad itself is phase 17's.

const dgRadio = (page: Page) => page.getByRole("radio", { name: "Delta g M" });
const alphaRadio = (page: Page) => page.getByRole("radio", { name: "Alpha" });
/** The tick numbers under the diagram's X axis. */
const xTickTexts = (page: Page) =>
  diagram(page)
    .locator(".x-axis .tick text")
    .evaluateAll((els) => els.map((el) => el.textContent));

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(page.locator(".phase-diagram svg")).toBeVisible();
});

test("the toggle sits right of the info button, 44 px high, and opens in the Δg^M mode", async ({
  page,
}) => {
  const group = page.getByRole("radiogroup", { name: "Mode" });
  await expect(group).toBeVisible();
  const box = (await group.boundingBox())!;
  const info = (await page.getByRole("button", { name: "About", exact: true }).boundingBox())!;
  const row = (await page.locator(".main-row").boundingBox())!;
  expect(box.height).toBe(44);
  expect(box.x).toBeGreaterThan(info.x + info.width);
  expect(box.x + box.width).toBeLessThan(row.x);
  await expect(dgRadio(page)).toBeChecked();
  await expect(page.locator("#app")).toHaveAttribute("data-mode", "dg");
  // The selected half is filled with --selected.
  const selected = await page.evaluate(() =>
    getComputedStyle(document.querySelector(".mode-toggle label")!).getPropertyValue(
      "background-color",
    ),
  );
  expect(selected).toBe("rgb(117, 30, 215)");
});

test("the toggle switches by mouse and by keyboard", async ({ page }) => {
  await page.locator(".mode-toggle label").nth(1).click();
  await expect(alphaRadio(page)).toBeChecked();
  await expect(page.locator("#app")).toHaveAttribute("data-mode", "alpha");
  // The arrow keys move along the radio group, as for any radio buttons.
  await alphaRadio(page).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(dgRadio(page)).toBeChecked();
  await expect(page.locator("#app")).toHaveAttribute("data-mode", "dg");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#app")).toHaveAttribute("data-mode", "alpha");
});

test("the α mode greys out the menu and Lever and hides the cut, the lever and the slice", async ({
  page,
}) => {
  await leverToggle(page).click();
  await expect(page.locator(".lever-knob")).toBeVisible();
  await alphaRadio(page).check();

  await expect(menu(page)).toBeDisabled();
  await expect(leverToggle(page)).toBeDisabled();
  await expect(page.locator(".system-menu")).toHaveAttribute("title", "Not used in the α mode");
  await expect(page.locator(".lever-box")).toHaveAttribute("title", "Not used in the α mode");
  await expect(page.locator(".logo button")).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator(".logo button")).toHaveAttribute("title", /α mode has no cut/);
  for (const hidden of [
    handle(page),
    diagram(page).locator(".cut-line"),
    diagram(page).locator(".guides line").first(),
    diagram(page).locator(".bold-value").first(),
    page.locator(".lever-knob"),
    page.locator(".cut-input"),
    page.locator(".lever-readout"),
    slicePanel(page).locator("svg"),
  ]) {
    await expect(hidden).toBeHidden();
  }
  // The slice panel's box stays, so the diagram does not move.
  const slice = (await slicePanel(page).boundingBox())!;
  expect(slice.height).toBeGreaterThan(300);
  // Kept: the fields, their labels, Metastable, Labels, Share and the theme button.
  await expect(diagram(page).locator(".field-label").first()).toBeVisible();
  for (const name of ["Metastable", /^Labels/, "Share", /Switch to/]) {
    await expect(page.getByRole("button", { name })).toBeEnabled();
  }

  await dgRadio(page).check();
  await expect(menu(page)).toBeEnabled();
  await expect(leverToggle(page)).toBeEnabled();
  await expect(page.locator(".system-menu")).not.toHaveAttribute("title", /./);
  await expect(menu(page)).toHaveAttribute("title", "Choose a preset system");
  await expect(handle(page)).toBeVisible();
  await expect(page.locator(".lever-knob")).toBeVisible();
  await expect(slicePanel(page).locator("svg")).toBeVisible();
  await expect(page.locator(".logo button")).not.toHaveAttribute("aria-disabled");
});

test("the diagram's X axis has tick numbers in the α mode only", async ({ page }) => {
  expect(new Set(await xTickTexts(page))).toEqual(new Set([""]));
  await alphaRadio(page).check();
  await expect.poll(() => xTickTexts(page)).toContain("0.5");
  await dgRadio(page).check();
  await expect.poll(async () => new Set(await xTickTexts(page))).toEqual(new Set([""]));
});

test("the menu names a preset in the α mode, whatever the window, otherwise Custom", async ({
  page,
}) => {
  await alphaRadio(page).check();
  // The default eutectic (h) is a grid system.
  await expect(page.locator(".system-label")).toHaveText("Eutectic");
  await dgRadio(page).check();
  await menu(page).selectOption("p1");
  // P1 (T_m,B = 2400 K) is on the slider, in the α mode's window rather than its own.
  await alphaRadio(page).check();
  await expect(page.locator(".system-label")).toHaveText("Peritectic");
  await dgRadio(page).check();
  await menu(page).selectOption("c8");
  // c8 keeps its line compound (§9 phase 19); c3 loses its compound with a range, and is (h).
  await alphaRadio(page).check();
  await expect(page.locator(".system-label")).toHaveText("Metatectic");
  await dgRadio(page).check();
  await menu(page).selectOption("c3");
  await alphaRadio(page).check();
  await expect(page.locator(".system-label")).toHaveText("Eutectic");
  // Nothing moved, so c3 comes back.
  await dgRadio(page).check();
  await expect(page.locator(".system-label")).toHaveText("Berthollide compound");
});

test("the Parameters panel shows the α mode's system with only Export enabled", async ({
  page,
}) => {
  await menu(page).selectOption("c1");
  await page.locator(".parameters summary").click();
  await alphaRadio(page).check();
  await expect(field(page, "TmB")).toHaveValue("1200");
  await expect(field(page, "alphaS")).toHaveValue("15");
  // c1's line compound is kept (§9 phase 19).
  await expect(page.getByRole("checkbox", { name: "Add compound", exact: true })).toBeChecked();
  await expect(page.getByRole("textbox", { name: "System name" })).toHaveValue(
    "αₗ 0, αₛ +15, Tₘ,B 1200 K, AB",
  );
  const controls = page.locator(".parameters form").locator("input:not([type=file]), button");
  for (const control of await controls.all()) {
    const isExport = await control.evaluate((el) => el.classList.contains("export"));
    if (isExport) await expect(control).toBeEnabled();
    else await expect(control).toBeDisabled();
  }
  await dgRadio(page).check();
  await expect(page.getByRole("checkbox", { name: "Add compound", exact: true })).toBeChecked();
  await expect(field(page, "alphaL")).toBeEnabled();
  await expect(field(page, "Xc")).toBeEnabled();
  await expect(page.locator(".parameters .import")).toBeEnabled();
  await expect(applyButton(page)).toBeDisabled();
  await field(page, "alphaL").fill("5");
  await expect(applyButton(page)).toBeEnabled();
});

test("the readout lists the invariants in the α mode, in a polite live region", async ({
  page,
}) => {
  const live = page.locator(".readout-invariants");
  await expect(live).toHaveAttribute("aria-live", "polite");
  await expect(live).toHaveText("");
  await alphaRadio(page).check();
  await expect(live).toHaveText(/^Invariants: eutectic, 63\d K\.$/);
  await expect(page.locator(".readout .fields")).toBeHidden();
  await dgRadio(page).check();
  await expect(live).toHaveText("");
});

test("the header keeps the menu at least 9rem wide at the compaction widths in the α mode", async ({
  page,
}) => {
  await alphaRadio(page).check();
  for (const width of [944, 943, 687, 686, 375]) {
    await setWidth(page, width + 32);
    const menuBox = (await page.locator(".system-menu").boundingBox())!;
    expect(menuBox.width, `${width}`).toBeGreaterThanOrEqual(143);
    const toggle = (await page.locator(".mode-toggle").boundingBox())!;
    const theme = (await page.getByRole("button", { name: /Switch to/ }).boundingBox())!;
    expect(toggle.x + toggle.width, `${width}`).toBeLessThanOrEqual(theme.x);
    expect(Math.abs(toggle.y - theme.y), `${width}`).toBeLessThan(1);
  }
});

test("axe finds no violations in the α mode", async ({ page }) => {
  await alphaRadio(page).check();
  await expect(page.locator("#app")).toHaveAttribute("data-mode", "alpha");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
