import { expect, test } from "./fixtures";

// The fixture fails the test on any page or console error while it loads.
test("the built page loads without errors", async ({ page }) => {
  await page.goto("./");

  await expect(page).toHaveTitle("ThermoBRIDGE");
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("ThermoBRIDGE");
  await expect(page.locator(".phase-diagram svg")).toBeVisible();
});
