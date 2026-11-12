import AxeBuilder from "@axe-core/playwright";
import { devices, type Page } from "@playwright/test";
import type { AlphaCache } from "../../src/ui/alphaCache";
import { boundaries, diagram, expect, menu, plotArea, test } from "./fixtures";

// The α pad and the T_m,B slider (plan §9 phase 17): their place in the slice panel's box, the
// knob by mouse, touch and keys, with and without the lock to the axes, the slider, the value
// fields in the side column, and the warning for a position that cannot be computed.

const knob = (page: Page) => page.locator(".alpha-knob");
const pad = (page: Page) => page.locator(".alpha-pad svg");
const slider = (page: Page) => page.getByRole("slider", { name: /T_m,B/ });
const lock = (page: Page) => page.getByRole("checkbox", { name: "Stay on the axes" });
const value = (page: Page, name: string) => page.getByRole("spinbutton", { name });
const invariants = (page: Page) => page.locator(".readout-invariants");
const labels = (page: Page) =>
  diagram(page)
    .locator(".field-labels > text")
    .evaluateAll((els) => els.map((el) => el.textContent));

/** The page position of (α_s, α_l) on the pad. */
async function padPoint(page: Page, alphaS: number, alphaL: number) {
  const box = (await pad(page).boundingBox())!;
  return {
    x: box.x + ((alphaS + 30) / 60) * box.width,
    y: box.y + ((30 - alphaL) / 60) * box.height,
  };
}

/** Drags the mouse from the knob to (α_s, α_l) on the pad, in a few moves. */
async function dragKnob(page: Page, alphaS: number, alphaL: number) {
  const from = (await knob(page).locator(".alpha-knob-face").boundingBox())!;
  const to = await padPoint(page, alphaS, alphaL);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

async function openAlpha(page: Page, url = "./") {
  await page.goto(url);
  await expect(page.locator(".phase-diagram svg")).toBeVisible();
  await page.getByRole("radio", { name: "Alpha" }).check();
  await expect(knob(page)).toBeVisible();
}

test.describe("on a desktop", () => {
  test.beforeEach(({ page }) => openAlpha(page));

  test("the pad sits in the slice panel's box under X = 0, with the slider right of it", async ({
    page,
  }) => {
    const plot = await plotArea(diagram(page));
    const square = (await pad(page).boundingBox())!;
    const slice = (await page.locator(".slice-panel").boundingBox())!;
    const range = (await slider(page).boundingBox())!;
    expect(Math.abs(square.x - plot.x)).toBeLessThan(1);
    expect(Math.abs(square.width - square.height)).toBeLessThan(1);
    expect(square.y).toBeGreaterThanOrEqual(slice.y);
    // As high as the box, but for the gaps above and under it and the lock's row above it.
    expect(square.height).toBeGreaterThan(slice.height - 68);
    expect(square.y + square.height).toBeLessThanOrEqual(slice.y + slice.height + 1);
    expect(range.x).toBeGreaterThan(square.x + square.width);
    expect(range.height).toBeGreaterThan(0.6 * square.height);
    // The slider's value sits right above it, not beside the thumb.
    const output = (await page.locator(".tmb-input output").boundingBox())!;
    expect(output.y + output.height).toBeLessThanOrEqual(range.y + 1);
    expect(output.x).toBeLessThan(range.x + range.width);
    // The lock over the pad, Line Compound right of it at the same height.
    const lockBox = (await page.locator(".alpha-lock").boundingBox())!;
    expect(lockBox.y + lockBox.height).toBeLessThanOrEqual(square.y + 1);
    expect(lockBox.y).toBeGreaterThanOrEqual(slice.y);
    const added = (await page.locator(".alpha-add-compound").boundingBox())!;
    expect(added.y).toBe(lockBox.y);
    expect(added.x).toBeGreaterThanOrEqual(range.x + range.width);
    // The seven grid presets, each named.
    await expect(pad(page).locator(".pad-preset")).toHaveCount(7);
    await expect(pad(page).locator('.pad-preset[data-preset="o"] title')).toHaveText(
      "Lens with a melting peak",
    );
  });

  test("the diagram does not move when the mode changes", async ({ page }) => {
    const inAlpha = await plotArea(diagram(page));
    await page.getByRole("radio", { name: "Delta g M" }).check();
    await expect(page.locator(".alpha-box")).toBeHidden();
    expect(await plotArea(diagram(page))).toEqual(inAlpha);
  });

  test("the knob starts at the system with the lock unticked, as a labelled slider", async ({
    page,
  }) => {
    await expect(knob(page)).toHaveAttribute("role", "slider");
    await expect(knob(page)).toHaveAttribute("aria-valuetext", "αₛ +15, αₗ 0 kJ/mol");
    await expect(knob(page).locator(".alpha-knob-grip")).toHaveCount(1);
    await expect(lock(page)).not.toBeChecked();
    await expect(slider(page)).toHaveValue("1200");
    await expect(page.locator(".tmb-input output")).toHaveText("1200");
    await expect(value(page, "α_s (kJ/mol)")).toHaveValue("15");
    await expect(page.locator(".tmb-note")).toHaveText("Tm,A = 800 K");
  });

  test("a locked drag from (h) at (+15, 0) to (o) at (0, +10) redraws the diagram", async ({
    page,
  }) => {
    await lock(page).check();
    await expect(invariants(page)).toHaveText(/eutectic/);
    expect(await labels(page)).toContain("α + β");
    // Nearer the α_l axis than the α_s one, so the knob lands on it.
    await dragKnob(page, 2, 10);
    await expect(knob(page)).toHaveAttribute("aria-valuetext", "αₛ 0, αₗ +10 kJ/mol");
    await expect(invariants(page)).toHaveText("This system has no invariant.");
    await expect.poll(() => labels(page)).toContain("L + S");
    await expect(value(page, "α_l (kJ/mol)")).toHaveValue("10");
    await expect(value(page, "α_s (kJ/mol)")).toHaveValue("0");
    // Back in the Δg^M mode, the system is (o) on the grid's window.
    await page.getByRole("radio", { name: "Delta g M" }).check();
    await expect(page.locator(".system-label")).toHaveText("Lens with a melting peak");
  });

  test("a free drag changes both α, and ticking the lock puts the knob on an axis", async ({
    page,
  }) => {
    await dragKnob(page, 10, 15);
    await expect(knob(page)).toHaveAttribute("aria-valuetext", "αₛ +10, αₗ +15 kJ/mol");
    await lock(page).check();
    await expect(knob(page)).toHaveAttribute("aria-valuetext", "αₛ 0, αₗ +15 kJ/mol");
  });

  test("the quadrants are a checkerboard with their signs of Δh^M, and the knob's is marked, on an axis the (+,+) or (−,−) one", async ({
    page,
  }) => {
    const active = () =>
      pad(page)
        .locator(".pad-quadrant.active")
        .evaluateAll((els) => els.map((el) => el.getAttribute("data-quadrant")));
    await expect(pad(page).locator(".pad-quadrant")).toHaveCount(4);
    await expect(pad(page).locator(".pad-quadrant.same-sign")).toHaveCount(2);
    // Each quadrant's corner gives the signs of Δh^{M,L} (α_l) and Δh^{M,S} (α_s).
    const corner = (q: string) =>
      pad(page)
        .locator(`.pad-corner[data-quadrant="${q}"]`)
        .evaluateAll((els) => els.map((el) => el.textContent));
    expect(await corner("++")).toEqual(["ΔhM,L > 0", "ΔhM,S > 0"]);
    expect(await corner("-+")).toEqual(["ΔhM,L > 0", "ΔhM,S < 0"]);
    expect(await corner("--")).toEqual(["ΔhM,L < 0", "ΔhM,S < 0"]);
    expect(await corner("+-")).toEqual(["ΔhM,L < 0", "ΔhM,S > 0"]);
    // > 0 in the monotectic markers' blue, < 0 in the eutectic markers' vermilion.
    const fills = await pad(page)
      .locator(`.pad-corner[data-quadrant="+-"]`)
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).fill));
    expect(fills).toEqual(["rgb(213, 94, 0)", "rgb(0, 114, 178)"]);
    const square = (await pad(page).boundingBox())!;
    for (const text of await pad(page).locator(".pad-corner").all()) {
      const box = (await text.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(square.x);
      expect(box.y).toBeGreaterThanOrEqual(square.y);
      expect(box.x + box.width).toBeLessThanOrEqual(square.x + square.width);
      expect(box.y + box.height).toBeLessThanOrEqual(square.y + square.height);
    }
    // (h) at (+15, 0): on the α_s axis, so only the (+,+) quadrant above it.
    expect(await active()).toEqual(["++"]);
    await dragKnob(page, -10, -15);
    await expect(knob(page)).toHaveAttribute("aria-valuetext", "αₛ −10, αₗ −15 kJ/mol");
    expect(await active()).toEqual(["--"]);
    await page.keyboard.press("Shift+ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");
    // (0, −15): on the α_l axis, so only the (−,−) quadrant left of it.
    await expect(knob(page)).toHaveAttribute("aria-valuetext", "αₛ 0, αₗ −15 kJ/mol");
    expect(await active()).toEqual(["--"]);
    // At the crossing, none.
    await page.keyboard.press("Home");
    await expect(knob(page)).toHaveAttribute("aria-valuetext", "αₛ 0, αₗ 0 kJ/mol");
    expect(await active()).toEqual([]);
  });

  test("the caption in the plot's top-left corner gives the drawn system once the knob is let go", async ({
    page,
  }) => {
    const lines = diagram(page).locator(".alpha-summary");
    await expect(lines.first()).toHaveText(
      "αs = +15.0 kJ/mol · αl = 0.0 kJ/mol · Tm,A = 800 K · Tm,B = 1200 K",
    );
    await expect(lines.nth(1)).toHaveText("");
    const plot = await plotArea(diagram(page));
    const box = (await lines.first().boundingBox())!;
    expect(box.x).toBeGreaterThan(plot.x);
    // At the lever summary's place: its halo reaches just above the plot area.
    expect(box.y).toBeGreaterThan(plot.y - 3);
    expect(box.x + box.width).toBeLessThan(plot.x + plot.width);
    // Hidden while the knob is held, through a rest, and shown with the new values on release.
    const from = (await knob(page).locator(".alpha-knob-face").boundingBox())!;
    const to = await padPoint(page, -10, 20);
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.waitForTimeout(300);
    await expect(lines.first()).toBeHidden();
    await page.mouse.up();
    await expect(lines.first()).toBeVisible();
    await expect(lines.first()).toHaveText(
      "αs = −10.0 kJ/mol · αl = +20.0 kJ/mol · Tm,A = 800 K · Tm,B = 1200 K",
    );
    // Hidden while the T_m,B slider is held, and shown again when let go off the slider.
    const range = (await slider(page).boundingBox())!;
    await page.mouse.move(range.x + range.width / 2, range.y + range.height / 2);
    await page.mouse.down();
    await page.mouse.move(range.x + range.width / 2 + 120, range.y + range.height / 3, {
      steps: 4,
    });
    await expect(lines.first()).toBeHidden();
    await page.mouse.up();
    await expect(lines.first()).toBeVisible();
    await page.getByRole("radio", { name: "Delta g M" }).check();
    await expect(lines.first()).toHaveText("");
  });

  test("a press elsewhere on the pad moves the knob there", async ({ page }) => {
    const at = await padPoint(page, -20, 5);
    await page.mouse.click(at.x, at.y);
    await expect(knob(page)).toHaveAttribute("aria-valuetext", "αₛ −20, αₗ +5 kJ/mol");
    await expect(knob(page)).toBeFocused();
  });

  test("the arrow keys move the knob, past the centre onto the other axis under the lock", async ({
    page,
  }) => {
    await lock(page).check();
    await knob(page).focus();
    await page.keyboard.press("Shift+ArrowLeft");
    await expect(knob(page)).toHaveAttribute("aria-valuetext", "αₛ +10, αₗ 0 kJ/mol");
    // Across the knob's axis: towards the centre, then up the α_l axis.
    for (let k = 0; k < 2; k++) await page.keyboard.press("Shift+ArrowUp");
    await expect(knob(page)).toHaveAttribute("aria-valuetext", "αₛ 0, αₗ 0 kJ/mol");
    await page.keyboard.press("Shift+ArrowUp");
    await expect(knob(page)).toHaveAttribute("aria-valuetext", "αₛ 0, αₗ +5 kJ/mol");
    await page.keyboard.press("Home");
    await expect(knob(page)).toHaveAttribute("aria-valuetext", "αₛ 0, αₗ 0 kJ/mol");
    await expect(invariants(page)).toHaveText("This system has no invariant.");
  });

  test("the slider moves T_m,B in 5 K steps from 805 K, by mouse and keys", async ({ page }) => {
    const before = await boundaries(page);
    const box = (await slider(page).boundingBox())!;
    // Low on the track: a low T_m,B.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 4);
    await expect.poll(async () => Number(await slider(page).inputValue())).toBeLessThan(850);
    await page.keyboard.press("End");
    await expect(slider(page)).toHaveValue("2400");
    await page.keyboard.press("Home");
    await expect(slider(page)).toHaveValue("805");
    await page.keyboard.press("ArrowUp");
    await expect(slider(page)).toHaveValue("810");
    await expect(value(page, "T_m,B (K)")).toHaveValue("810");
    await expect(page.locator(".tmb-input output")).toHaveText("810");
    await expect.poll(() => boundaries(page)).not.toEqual(before);
    await page.locator(".parameters summary").click();
    await expect(page.getByRole("textbox", { name: "System name" })).toHaveValue(
      "αₗ 0, αₛ +15, Tₘ,B 810 K",
    );
  });

  test("the value fields apply on Enter, clamped and rounded, zeroing the other α under the lock", async ({
    page,
  }) => {
    await lock(page).check();
    const alphaL = value(page, "α_l (kJ/mol)");
    await alphaL.fill("12.3");
    await alphaL.press("Enter");
    await expect(knob(page)).toHaveAttribute("aria-valuetext", "αₛ 0, αₗ +12.5 kJ/mol");
    await expect(alphaL).toHaveValue("12.5");
    await expect(value(page, "α_s (kJ/mol)")).toHaveValue("0");
    await lock(page).uncheck();
    const alphaS = value(page, "α_s (kJ/mol)");
    await alphaS.fill("45");
    // Leaving the field applies it too.
    await alphaS.blur();
    await expect(knob(page)).toHaveAttribute("aria-valuetext", "αₛ +30, αₗ +12.5 kJ/mol");
    await expect(alphaS).toHaveValue("30");
    const TmB = value(page, "T_m,B (K)");
    await TmB.fill("700");
    await TmB.press("Enter");
    await expect(TmB).toHaveValue("805");
    await expect(slider(page)).toHaveValue("805");
  });

  test("axe finds no violations with the pad in use", async ({ page }) => {
    await dragKnob(page, 5, 20);
    await expect(invariants(page)).not.toHaveText("");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});

test("a position that cannot be computed keeps the diagram, outlines the knob and says so", async ({
  page,
}) => {
  await openAlpha(page, "./?timing");
  const warning = page.locator(".alpha-warning");
  await expect(warning).toHaveText("");
  const before = await boundaries(page);
  // A stub cache in which every position α_s < 0 fails.
  await page.evaluate(() => {
    const { alphaCache } = (globalThis as unknown as { thermobridge: { alphaCache: AlphaCache } })
      .thermobridge;
    const { has, get } = alphaCache;
    alphaCache.has = (p, preview) => p.alphaS < 0 || has.call(alphaCache, p, preview);
    alphaCache.get = (p, preview) => (p.alphaS < 0 ? null : get.call(alphaCache, p, preview));
  });
  await knob(page).focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowLeft");
  await expect(warning).toHaveText("This system could not be computed");
  await expect(warning).toHaveAttribute("aria-live", "polite");
  await expect(knob(page)).toHaveClass(/failed/);
  await expect(knob(page)).toHaveAttribute("aria-valuetext", "αₛ −1, αₗ 0 kJ/mol");
  // The diagram of (0, 0), the last that could be computed.
  const kept = await boundaries(page);
  expect(kept).not.toEqual(before);
  await page.keyboard.press("ArrowLeft");
  expect(await boundaries(page)).toEqual(kept);
  await page.keyboard.press("Home");
  await expect(warning).toHaveText("");
  await expect(knob(page)).not.toHaveClass(/failed/);
});

test.describe("on a phone", () => {
  const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = devices["Pixel 7"];
  test.use({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent });

  /** Drags one finger from (x, y) to (x + dx, y + dy) through real touch events. */
  async function touchDrag(page: Page, x: number, y: number, dx: number, dy: number) {
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", t: number) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x: x + dx * t, y: y + dy * t, id: 1 }],
      });
    await touch("touchStart", 0);
    for (let k = 1; k <= 6; k++) await touch("touchMove", k / 6);
    await touch("touchEnd", 1);
    await cdp.detach();
  }

  test.beforeEach(({ page }) => openAlpha(page));

  test("the knob and the slider follow a finger, and the page does not scroll", async ({
    page,
  }) => {
    const face = (await knob(page).locator(".alpha-knob-face").boundingBox())!;
    const to = await padPoint(page, -15, 0);
    const scroll = await page.evaluate(() => scrollY);
    await touchDrag(
      page,
      face.x + face.width / 2,
      face.y + face.height / 2,
      to.x - face.x - face.width / 2,
      0,
    );
    await expect(knob(page)).toHaveAttribute("aria-valuetext", "αₛ −15, αₗ 0 kJ/mol");
    expect(await page.evaluate(() => scrollY)).toBe(scroll);

    const box = (await slider(page).boundingBox())!;
    await touchDrag(page, box.x + box.width / 2, box.y + box.height / 2, 0, box.height / 2 - 2);
    await expect.poll(async () => Number(await slider(page).inputValue())).toBeLessThan(900);
    expect(await page.evaluate(() => scrollY)).toBe(scroll);
    await expect(menu(page)).toBeDisabled();
  });

  test("the caption puts the melting points on a second line to stay in the plot area", async ({
    page,
  }) => {
    const lines = diagram(page).locator(".alpha-summary");
    await expect(lines.first()).toHaveText("αs = +15.0 kJ/mol · αl = 0.0 kJ/mol");
    await expect(lines.nth(1)).toHaveText("Tm,A = 800 K · Tm,B = 1200 K");
    const plot = await plotArea(diagram(page));
    for (const line of await lines.all()) {
      expect((await line.boundingBox())!.x + (await line.boundingBox())!.width).toBeLessThan(
        plot.x + plot.width,
      );
    }
  });

  test("the pad stays square and the slider keeps 44 px of width", async ({ page }) => {
    const square = (await pad(page).boundingBox())!;
    expect(Math.abs(square.width - square.height)).toBeLessThan(1);
    expect((await slider(page).boundingBox())!.width).toBeGreaterThanOrEqual(44);
    const box = (await page.locator(".alpha-box").boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  });
});
