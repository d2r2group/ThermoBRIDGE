import AxeBuilder from "@axe-core/playwright";
import { devices, type Page } from "@playwright/test";
import { diagram, expect, menu, plotArea, test } from "./fixtures";

// The α mode's line compound (plan §9 phase 19): the *Line Compound* box beside the lock above the pad, its three
// sliders in the box's empty column (flat on a phone), their number fields in the side column; on a phone, in the pad's place behind a switch, the
// diagram they move through, and the caption's compound line.

const addCompound = (page: Page) => page.getByRole("checkbox", { name: "Line Compound" });
const xc = (page: Page) => page.getByRole("slider", { name: /X_c/ });
const dhf = (page: Page) => page.getByRole("slider", { name: /Δh_f/ });
const dsf = (page: Page) => page.getByRole("slider", { name: /Δs_f/ });
const value = (page: Page, name: string) => page.getByRole("spinbutton", { name });
const compoundBox = (page: Page) => page.locator(".alpha-compound");
const invariants = (page: Page) => page.locator(".readout-invariants");
const caption = (page: Page) => diagram(page).locator(".alpha-summary");
const labels = (page: Page) =>
  diagram(page)
    .locator(".field-labels > text")
    .evaluateAll((els) => els.map((el) => el.textContent));

async function openAlpha(page: Page, hash = "") {
  await page.goto(`./${hash}`);
  await expect(page.locator(".phase-diagram svg")).toBeVisible();
  if (!hash.includes(";A")) await page.getByRole("radio", { name: "Alpha" }).check();
  await expect(page.locator(".alpha-knob")).toBeVisible();
}

/** Types `v` into the side column's field `name` and applies it. */
async function type(page: Page, name: string, v: number) {
  const field = value(page, name);
  await field.fill(String(v));
  await field.press("Enter");
}

test.describe("on a desktop", () => {
  test("without a compound the α and T_m,B fields sit in the box's empty column", async ({
    page,
  }) => {
    const inBox = (name: string) => page.locator(".alpha-box").getByRole("spinbutton", { name });
    await openAlpha(page);
    for (const name of ["α_s (kJ/mol)", "α_l (kJ/mol)", "T_m,B (K)"]) {
      await expect(inBox(name)).toBeVisible();
    }
    await expect(page.locator(".alpha-inputs")).toBeHidden();
    const tmb = (await page.getByRole("slider", { name: /T_m,B/ }).boundingBox())!;
    const field = (await inBox("α_s (kJ/mol)").boundingBox())!;
    expect(field.x).toBeGreaterThan(tmb.x + tmb.width);
    await type(page, "α_l (kJ/mol)", 5);
    await expect(page.locator(".alpha-knob")).toHaveAttribute(
      "aria-valuetext",
      "αₛ +15, αₗ +5 kJ/mol",
    );
    // With a compound its sliders take the column, and the fields go back to the side column.
    await addCompound(page).check();
    await expect(inBox("α_s (kJ/mol)")).toHaveCount(0);
    await expect(page.locator(".alpha-inputs").getByRole("spinbutton")).toHaveCount(6);
    await expect(value(page, "α_l (kJ/mol)")).toHaveValue("5");
    await addCompound(page).uncheck();
    await expect(inBox("T_m,B (K)")).toBeVisible();
  });

  test("Line Compound shows three sliders at c1's values, and brings the last ones back", async ({
    page,
  }) => {
    await openAlpha(page);
    await expect(addCompound(page)).not.toBeChecked();
    await expect(compoundBox(page)).toBeHidden();
    await expect(value(page, "X_c")).toBeHidden();
    await addCompound(page).check();
    await expect(compoundBox(page)).toBeVisible();
    await expect(xc(page)).toHaveAttribute("aria-valuetext", "AB, X_B = 0.500");
    await expect(dhf(page)).toHaveValue("-6");
    await expect(dsf(page)).toHaveValue("0");
    await expect(value(page, "X_c")).toHaveValue("0.500");
    // (h) with c1's compound is c1, which the menu names.
    await expect(menu(page)).toHaveValue("c1");
    // The grid presets have no compound, so their dots go.
    await expect(page.locator(".alpha-pad .pad-preset").first()).toBeHidden();
    await expect.poll(() => labels(page)).toContain("α + AB");
    await expect(invariants(page)).toHaveText("Invariants: eutectic, 760 K; eutectic, 963 K.");
    await xc(page).focus();
    await page.keyboard.press("ArrowUp");
    await expect(xc(page)).toHaveAttribute("aria-valuetext", "A₂B₃, X_B = 0.600");
    await addCompound(page).uncheck();
    await expect(compoundBox(page)).toBeHidden();
    await expect(page.locator(".alpha-pad .pad-preset")).toHaveCount(7);
    await expect(page.locator(".alpha-pad .pad-preset").first()).toBeVisible();
    await expect.poll(() => labels(page)).not.toContain("α + AB");
    await addCompound(page).check();
    await expect(xc(page)).toHaveAttribute("aria-valuetext", "A₂B₃, X_B = 0.600");
    // Leaving forgets it: the next visit starts from c1's again.
    await page.getByRole("radio", { name: "Delta g M" }).check();
    await expect(page.locator(".system-label")).toHaveText("αₗ 0, αₛ +15, Tₘ,B 1200 K, A₂B₃");
  });

  test("the sliders sit in the box's empty column, upright, right of the T_m,B slider", async ({
    page,
  }) => {
    await openAlpha(page, "#c1;A");
    await expect(addCompound(page)).toBeChecked();
    const tmb = (await page.getByRole("slider", { name: /T_m,B/ }).boundingBox())!;
    const box = (await page.locator(".alpha-box").boundingBox())!;
    let right = tmb.x + tmb.width;
    for (const s of [xc(page), dhf(page), dsf(page)]) {
      const r = (await s.boundingBox())!;
      expect(r.width).toBeGreaterThanOrEqual(44);
      expect(r.height).toBeGreaterThan(2 * r.width);
      expect(r.x).toBeGreaterThan(right);
      right = r.x + r.width;
    }
    expect(right).toBeLessThanOrEqual(box.x + box.width);
    // The values beside the thumbs stay in the box.
    for (const output of await compoundBox(page).locator("output").all()) {
      const o = (await output.boundingBox())!;
      expect(o.x + o.width).toBeLessThanOrEqual(box.x + box.width + 1);
    }
    await expect(compoundBox(page).locator(".xc output")).toHaveText("AB");
    // The lock, the box and the warning share the row above the pad.
    const lockRow = (await page.locator(".alpha-lock-row").boundingBox())!;
    const added = (await page.locator(".alpha-add-compound").boundingBox())!;
    expect(added.y).toBeGreaterThanOrEqual(lockRow.y - 1);
    expect(added.y + added.height).toBeLessThanOrEqual(lockRow.y + lockRow.height + 1);
  });

  test("the sliders reach c4 and c8 by keys and mouse, and the menu names them", async ({
    page,
  }) => {
    await openAlpha(page, "#c1;A");
    await dhf(page).focus();
    // Δh_f from −6 to +2 kJ/mol in 0.5 steps.
    for (let k = 0; k < 16; k++) await page.keyboard.press("ArrowUp");
    await expect(dhf(page)).toHaveValue("2");
    await expect(value(page, "Δh_f (kJ/mol)")).toHaveValue("2");
    await dsf(page).focus();
    await page.keyboard.press("End");
    await expect(dsf(page)).toHaveValue("5");
    await expect(menu(page)).toHaveValue("c4");
    await expect(invariants(page)).toHaveText(/eutectoid/i);

    // c8: T_m,B = 1800 K, α_l = +19, α_s = 0, AB₃ with Δh_f = −13 and Δs_f = −3.
    await type(page, "T_m,B (K)", 1800);
    await type(page, "α_l (kJ/mol)", 19);
    await type(page, "α_s (kJ/mol)", 0);
    await type(page, "Δh_f (kJ/mol)", -13);
    await type(page, "Δs_f (J/(mol·K))", -3);
    // X_c by mouse: a press near the track's top end, then the keys down to AB₃.
    const box = (await xc(page).boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + 6);
    await expect(xc(page)).toHaveAttribute("aria-valuetext", "AB₉, X_B = 0.900");
    for (let k = 0; k < 2; k++) await page.keyboard.press("ArrowDown");
    await expect(xc(page)).toHaveAttribute("aria-valuetext", "AB₃, X_B = 0.750");
    await expect(menu(page)).toHaveValue("c8");
    await expect(invariants(page)).toHaveText(/metatectic/i);
  });

  test("the side column's fields apply on Enter, X_c to the nearest stop", async ({ page }) => {
    await openAlpha(page, "#c1;A");
    await type(page, "X_c", 0.3);
    await expect(value(page, "X_c")).toHaveValue("0.333");
    await expect(xc(page)).toHaveAttribute("aria-valuetext", "A₂B, X_B = 0.333");
    await type(page, "Δh_f (kJ/mol)", -31);
    await expect(value(page, "Δh_f (kJ/mol)")).toHaveValue("-20");
    await type(page, "Δs_f (J/(mol·K))", 2.3);
    await expect(value(page, "Δs_f (J/(mol·K))")).toHaveValue("2.5");
    await expect(dsf(page)).toHaveValue("2.5");
  });

  test("the caption gains the compound's line, clear of the diagram's top fields", async ({
    page,
  }) => {
    await openAlpha(page, "#c1;A");
    await expect(caption(page).nth(0)).toHaveText(
      "αs = +15.0 kJ/mol · αl = 0.0 kJ/mol · Tm,A = 800 K · Tm,B = 1200 K",
    );
    await expect(caption(page).nth(1)).toHaveText("AB: Δhf = −6.0 kJ/mol, Δsf = 0.0 J/(mol·K)");
    const line = (await caption(page).nth(1).boundingBox())!;
    const plot = await plotArea(diagram(page));
    expect(line.x + line.width).toBeLessThan(plot.x + plot.width);
    // The liquid's label, at the top of the window, is not under the caption.
    const liquid = diagram(page).locator(".field-labels > text", { hasText: /^L$/ });
    await expect(liquid).toHaveCount(1);
    const l = (await liquid.boundingBox())!;
    const overlaps =
      l.x < line.x + line.width &&
      line.x < l.x + l.width &&
      l.y < line.y + line.height &&
      line.y < l.y + l.height;
    expect(overlaps).toBe(false);
  });

  test("c3's compound with a range is dropped, and the box says why", async ({ page }) => {
    await openAlpha(page, "#c3;A");
    await expect(addCompound(page)).not.toBeChecked();
    await expect(page.locator(".alpha-add-compound")).toHaveAttribute(
      "title",
      "A compound with a range is not used in the α mode",
    );
    await expect(compoundBox(page)).toBeHidden();
    // Nothing moved: the Δg^M mode gets c3 back.
    await page.getByRole("radio", { name: "Delta g M" }).check();
    await expect(menu(page)).toHaveValue("c3");
  });

  test("the warning shares the row with the boxes when a position cannot be computed", async ({
    page,
  }) => {
    await openAlpha(page, "#c1;A");
    // A₉B with a strongly negative Δh_f at T_m,B = 1575 K (plan §9 phase 19's probe).
    await type(page, "T_m,B (K)", 1575);
    await type(page, "α_l (kJ/mol)", 19);
    await type(page, "α_s (kJ/mol)", -14.5);
    await type(page, "X_c", 0.1);
    await type(page, "Δh_f (kJ/mol)", -17.5);
    await type(page, "Δs_f (J/(mol·K))", 0);
    const warning = page.locator(".alpha-warning");
    await expect(warning).toHaveText("This system could not be computed");
    const row = (await page.locator(".alpha-lock-row").boundingBox())!;
    const w = (await warning.boundingBox())!;
    const added = (await page.locator(".alpha-add-compound").boundingBox())!;
    expect(w.x).toBeGreaterThanOrEqual(added.x + added.width);
    expect(w.y + w.height).toBeLessThanOrEqual(row.y + row.height + 1);
  });

  test("axe finds no violations with the compound's sliders shown", async ({ page }) => {
    await openAlpha(page, "#c1;A");
    await expect(invariants(page)).not.toHaveText("");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});

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

test.describe("at 900 × 700, with touch", () => {
  test.use({ viewport: { width: 900, height: 700 }, hasTouch: true });

  test("the sliders lie flat in the box and follow a finger", async ({ page }) => {
    await openAlpha(page, "#c1;A");
    const box = (await page.locator(".alpha-box").boundingBox())!;
    for (const s of [xc(page), dhf(page), dsf(page)]) {
      const r = (await s.boundingBox())!;
      expect(r.width).toBeGreaterThan(r.height);
      expect(r.height).toBeGreaterThanOrEqual(44);
      expect(r.x + r.width).toBeLessThanOrEqual(box.x + box.width + 1);
    }
    const r = (await dhf(page).boundingBox())!;
    const scroll = await page.evaluate(() => scrollY);
    await touchDrag(page, r.x + r.width / 2, r.y + r.height / 2, r.width / 2 - 2, 0);
    await expect.poll(async () => Number(await dhf(page).inputValue())).toBeGreaterThan(0);
    expect(await page.evaluate(() => scrollY)).toBe(scroll);
  });
});

test.describe("on a phone", () => {
  const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = devices["Pixel 7"];
  test.use({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent });

  test("the sliders stand in the pad's place behind a switch, and the box holds both", async ({
    page,
  }) => {
    const padView = page.getByRole("radio", { name: "α pad" });
    const sliderView = page.getByRole("radio", { name: /sliders$/ });
    await openAlpha(page, "#c1;A");
    await expect(addCompound(page)).toBeChecked();
    // A link opens at the pad, the switch right of the T_m,B slider.
    await expect(padView).toBeChecked();
    await expect(page.locator(".alpha-knob")).toBeVisible();
    await expect(compoundBox(page)).toBeHidden();
    await expect(sliderView).toHaveAccessibleName("AB sliders");
    const tmb = (await page.getByRole("slider", { name: /T_m,B/ }).boundingBox())!;
    const view = (await page.locator(".alpha-view").boundingBox())!;
    expect(view.x).toBeGreaterThan(tmb.x + tmb.width);
    await sliderView.check();
    await expect(page.locator(".alpha-knob")).toBeHidden();
    await expect(page.locator(".alpha-lock")).toBeHidden();
    await expect(compoundBox(page)).toBeVisible();
    const axe = await new AxeBuilder({ page }).include(".alpha-box").analyze();
    expect(axe.violations).toEqual([]);
    // Upright, 44 px wide, left of the T_m,B slider and inside the box.
    const box = (await page.locator(".alpha-box").boundingBox())!;
    for (const s of [xc(page), dhf(page), dsf(page)]) {
      const r = (await s.boundingBox())!;
      expect(r.width).toBeCloseTo(44, 0);
      expect(r.height).toBeGreaterThan(80);
      expect(r.x).toBeGreaterThanOrEqual(box.x - 1);
      expect(r.x + r.width).toBeLessThanOrEqual(tmb.x);
      expect(r.y + r.height).toBeLessThanOrEqual(box.y + box.height + 1);
    }
    const r = (await dhf(page).boundingBox())!;
    const scroll = await page.evaluate(() => scrollY);
    await touchDrag(page, r.x + r.width / 2, r.y + r.height - 10, 0, -(r.height / 2));
    await expect.poll(async () => Number(await dhf(page).inputValue())).toBeGreaterThan(-6);
    expect(await page.evaluate(() => scrollY)).toBe(scroll);
    await expect(value(page, "Δh_f (kJ/mol)")).toHaveValue(await dhf(page).inputValue());
    // The switch names the compound by its formula.
    await type(page, "X_c", 0.75);
    await expect(sliderView).toHaveAccessibleName("AB₃ sliders");
    // The warning takes the lock's place above the sliders, inside the box.
    await page.evaluate(
      () =>
        (document.querySelector(".alpha-warning")!.textContent =
          "This system could not be computed"),
    );
    const w = (await page.locator(".alpha-warning").boundingBox())!;
    const first = (await xc(page).boundingBox())!;
    expect(w.y + w.height).toBeLessThanOrEqual(first.y);
    expect(w.y).toBeGreaterThanOrEqual(box.y);
    // Unticked, the pad comes back and the switch goes; ticked again, the sliders show.
    await addCompound(page).uncheck();
    await expect(page.locator(".alpha-knob")).toBeVisible();
    await expect(page.locator(".alpha-view")).toBeHidden();
    await addCompound(page).check();
    await expect(sliderView).toBeChecked();
    await expect(compoundBox(page)).toBeVisible();
    await padView.check();
    await expect(page.locator(".alpha-knob")).toBeVisible();
    await expect(compoundBox(page)).toBeHidden();
  });

  test("without a compound the fields sit in the box, a name over each", async ({ page }) => {
    await openAlpha(page);
    const box = (await page.locator(".alpha-box").boundingBox())!;
    const pad = (await page.locator(".alpha-pad").boundingBox())!;
    const fields = page.locator(".alpha-box .alpha-box-fields");
    await expect(fields.getByRole("spinbutton")).toHaveCount(3);
    const f = (await fields.boundingBox())!;
    expect(f.x + f.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
    expect(f.y + f.height).toBeLessThanOrEqual(pad.y + pad.height + 0.5);
    await type(page, "T_m,B (K)", 1500);
    await expect(page.getByRole("slider", { name: /T_m,B/ })).toHaveValue("1500");
  });

  test("the row above the pad stays inside the box", async ({ page }) => {
    await openAlpha(page, "#c1;A");
    await page.evaluate(
      () =>
        (document.querySelector(".alpha-warning")!.textContent =
          "This system could not be computed"),
    );
    const box = (await page.locator(".alpha-box").boundingBox())!;
    for (const sel of [".alpha-lock", ".alpha-add-compound", ".alpha-warning", ".alpha-view"]) {
      const b = (await page.locator(sel).first().boundingBox())!;
      expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width + 1);
      expect(b.y + b.height).toBeLessThanOrEqual(box.y + box.height + 1);
    }
  });

  test("the caption's compound line stays in the plot area", async ({ page }) => {
    await openAlpha(page, "#c1;A");
    await expect(caption(page).nth(2)).toHaveText("AB: Δhf = −6.0 kJ/mol, Δsf = 0.0 J/(mol·K)");
    const plot = await plotArea(diagram(page));
    const field = diagram(page).locator(".field-labels > text");
    const fieldBoxes = await Promise.all((await field.all()).map((f) => f.boundingBox()));
    for (const line of await caption(page).all()) {
      const b = (await line.boundingBox())!;
      expect(b.x + b.width).toBeLessThan(plot.x + plot.width);
      // No field label under it: the labels keep clear of the caption.
      for (const l of fieldBoxes) {
        const overlaps =
          l!.x < b.x + b.width &&
          b.x < l!.x + l!.width &&
          l!.y < b.y + b.height &&
          b.y < l!.y + l!.height;
        expect(overlaps).toBe(false);
      }
    }
  });
});

for (const width of [280, 320]) {
  test.describe(`on a ${width} px phone`, () => {
    test.use({ viewport: { width, height: 568 }, isMobile: true, hasTouch: true });

    test("the box reaches left under the T axis and tightens, so everything stays in it", async ({
      page,
    }) => {
      await openAlpha(page, "#c1;A");
      const box = (await page.locator(".alpha-box").boundingBox())!;
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(clientWidth);
      for (const view of ["α pad", /sliders$/]) {
        await page.getByRole("radio", { name: view }).check();
        for (const sel of [".alpha-add-compound", ".alpha-view", ".tmb-input", ".alpha-compound"]) {
          const b = await page.locator(sel).boundingBox();
          if (b) expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(clientWidth);
      // Under about 330 px T_m,A's note goes, and the T_m,B slider is as tall as the compound's.
      await expect(page.locator(".tmb-note")).toBeHidden();
      const tmb = (await page.getByRole("slider", { name: /T_m,B/ }).boundingBox())!;
      for (const s of [xc(page), dhf(page), dsf(page)]) {
        const r = (await s.boundingBox())!;
        expect(r.y).toBeCloseTo(tmb.y, 1);
        expect(r.height).toBeCloseTo(tmb.height, 1);
      }
    });
  });
}

test.describe("as the window narrows", () => {
  test.use({ isMobile: true, hasTouch: true });

  test("the fields stay in the box from 285 px up, and leave it only below", async ({ page }) => {
    await page.setViewportSize({ width: 560, height: 900 });
    await openAlpha(page);
    const fields = page.locator(".alpha-box-fields");
    for (let width = 560; width >= 250; width -= 15) {
      await page.setViewportSize({ width, height: 900 });
      if (width >= 285) {
        await expect(fields, `at ${width} px`).toBeVisible();
        const box = (await page.locator(".alpha-box").boundingBox())!;
        const f = (await fields.boundingBox())!;
        expect(f.x + f.width, `at ${width} px`).toBeLessThanOrEqual(box.x + box.width + 0.5);
        expect(f.y + f.height, `at ${width} px`).toBeLessThanOrEqual(box.y + box.height + 0.5);
      } else {
        await expect(fields, `at ${width} px`).toBeHidden();
        await expect(page.locator(".alpha-inputs")).toBeVisible();
      }
    }
  });
});
