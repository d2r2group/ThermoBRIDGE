import { expect, test } from "./fixtures";

// The fixture fails the test on any page or console error while it loads.
test("the built page loads without errors", async ({ page }) => {
  await page.goto("./");

  await expect(page).toHaveTitle("ThermoBRIDGE");
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("ThermoBRIDGE");
  await expect(page.locator(".phase-diagram svg")).toBeVisible();
});

// Where the plots are just tall enough to need a scrollbar that takes width, its coming would
// narrow them so that they no longer need it, for ever; its room is kept instead (main.ts).
test("with scrollbars that take width the page keeps their room; overlay ones take none", async ({
  page,
}) => {
  await page.goto("./");
  const gutter = () =>
    page.evaluate(() => getComputedStyle(document.documentElement).scrollbarGutter);
  // The tests' headless Chrome hides its scrollbars, as overlay ones.
  expect(await gutter()).toBe("auto");
  await page.evaluate(() => document.documentElement.classList.add("classic-scrollbars"));
  expect(await gutter()).toBe("stable");
});
