import AxeBuilder from "@axe-core/playwright";
import { expect, leverToggle, test } from "./fixtures";

// Accessibility (plan §12, B4): the diagram is a group, so its two sliders reach screen readers.

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(page.locator(".phase-diagram svg")).toBeVisible();
});

test("the diagram is a group whose cut handle is a named slider", async ({ page }) => {
  // Under role="img" its children would be presentational, the sliders with them.
  await expect(page.locator(".phase-diagram svg")).toHaveAttribute("role", "group");
  await expect(page.getByRole("slider", { name: "Cut line, T* (K)" })).toHaveClass(/cut-handle/);
  await leverToggle(page).click();
  await expect(
    page.getByRole("slider", { name: "Overall composition X₀", exact: true }),
  ).toHaveClass(/lever-knob/);
});

test("axe finds no violations, with the lever rule off and on", async ({ page }) => {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await leverToggle(page).click();
  await expect(page.locator(".lever-knob")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
