// The α mode's preview on the diagram (plan §9 phase 15), driven through the page's `?timing` hook
// so that the knob's rest is under the test's control: a preview hides the field labels and the
// invariant temperatures rather than leave them stale, and the full diagram brings them back.

import type { createAlphaDrag } from "../../src/ui/alphaDrag";
import type { Store } from "../../src/ui/state";
import { diagram, expect, test } from "./fixtures";

interface Hook {
  thermobridge: { store: Store; createAlphaDrag: typeof createAlphaDrag };
}

test("a preview hides the labels until the full diagram replaces it", async ({ page }) => {
  await page.goto("./?timing");
  const labels = diagram(page).locator(".field-labels > text");
  const temps = diagram(page).locator(".invariant-temperatures > *");
  await expect(labels).not.toHaveCount(0);
  await expect(temps).not.toHaveCount(0);

  // A peritectic, from the eutectic (h) the page opens with: the knob rests until released.
  await page.evaluate(() => {
    const { store, createAlphaDrag } = (globalThis as unknown as Hook).thermobridge;
    const drag = createAlphaDrag(store, { timeouts: { set: () => 0, clear: () => {} } });
    drag.move({ alphaS: 15, alphaL: 10, TmB: 1200, compound: null });
    Object.assign(globalThis, { drag });
  });
  await expect(labels).toHaveCount(0);
  await expect(temps).toHaveCount(0);
  await expect(diagram(page).locator("path.boundary.stable")).not.toHaveCount(0);

  await page.evaluate(() =>
    (globalThis as unknown as { drag: ReturnType<typeof createAlphaDrag> }).drag.release(),
  );
  await expect(labels).not.toHaveCount(0);
  await expect(temps).not.toHaveCount(0);
});
