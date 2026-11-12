import type { Page } from "@playwright/test";
import {
  applyButton,
  autoBox,
  boundaries,
  cutValue,
  expect,
  field,
  handle,
  menu,
  setWidth,
  test,
  warning,
} from "./fixtures";

/** The logo, a button that snaps the cut to the next invariant. */
const snap = (page: Page) => page.locator("header .logo button");
const invariantKinds = (page: Page) =>
  page
    .locator(".phase-diagram line.invariant")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-kind")));
const yTicks = (page: Page) => page.locator(".phase-diagram .y-axis .tick text").allTextContents();

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(page.locator(".phase-diagram svg")).toBeVisible();
});

async function openPanel(page: Page) {
  await page.locator(".parameters summary").click();
  await expect(field(page, "alphaL")).toBeVisible();
}

/** Types `text` into a parameter field and applies it with Enter. */
async function setField(page: Page, name: string, text: string) {
  await field(page, name).fill(text);
  await field(page, name).press("Enter");
}

test("the System menu lists five groups of presets, then Custom, and starts on the eutectic", async ({
  page,
}) => {
  await expect(menu(page)).toHaveValue("h");
  const groups = await menu(page)
    .locator("optgroup")
    .evaluateAll((els) => els.map((el) => (el as HTMLOptGroupElement).label));
  expect(groups).toEqual([
    "Ideal solutions",
    "Complete solid solubility",
    "Solid miscibility gap",
    "Liquid miscibility gap",
    "Intermediate compound",
  ]);
  const ids = await menu(page)
    .locator("option")
    .evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value));
  expect(ids).toEqual([
    ...["n", "m", "o", "m1", "h", "c", "p1", "p2", "p3", "e", "p4", "k"],
    ...["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9"],
    "custom",
  ]);
  // The open list shows the α values and T_m,B; the closed menu the short label.
  await expect(menu(page).locator('option[value="h"]')).toHaveText(
    "Eutectic: αₗ 0, αₛ +15 kJ/mol; B melts at 1200 K",
  );
  await expect(page.locator(".system-label")).toHaveText("Eutectic");
  await expect(menu(page)).toHaveCSS("color", "rgba(0, 0, 0, 0)");
  // It sits in the header, above the diagram.
  const box = (await page.locator(".system-menu").boundingBox())!;
  const diagram = (await page.locator(".phase-diagram svg").boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(diagram.y);
});

test("a preset applies at once with its window, resets the cut and refills the fields", async ({
  page,
}) => {
  await openPanel(page);
  const before = await boundaries(page);
  await handle(page).focus();
  await page.keyboard.press("PageUp");
  expect(await cutValue(page)).toBe(1000);
  await menu(page).selectOption("p1");
  await expect(page.locator(".system-label")).toHaveText("Peritectic");
  expect(await boundaries(page)).not.toEqual(before);
  expect(await invariantKinds(page)).toEqual(["peritectic"]);
  // The window 300–2500 K and the cut in its middle.
  expect(await cutValue(page)).toBe(1400);
  const slider = page.getByRole("slider", { name: "Cut temperature T* (K)" });
  await expect(slider).toHaveAttribute("min", "300");
  await expect(slider).toHaveAttribute("max", "2500");
  for (const [name, text] of [
    ["alphaL", "0"],
    ["alphaS", "15"],
    ["TmA", "800"],
    ["TmB", "2400"],
    ["dsA", "10"],
    ["dsB", "10"],
    ["Tmin", "300"],
    ["Tmax", "2500"],
  ] as const) {
    await expect(field(page, name)).toHaveValue(text);
  }
  await expect(page.locator(".parameters output").nth(1)).toHaveText("24 kJ/mol");
  await expect(autoBox(page)).not.toBeChecked();
  await expect(applyButton(page)).toBeDisabled();
});

test("an applied edit turns the menu to Custom, and a preset discards unapplied edits", async ({
  page,
}) => {
  await openPanel(page);
  const before = await boundaries(page);
  await setField(page, "alphaS", "20");
  await expect(warning(page)).toBeEmpty();
  await expect(menu(page)).toHaveValue("custom");
  await expect(page.locator(".system-label")).toHaveText("Eutectic (custom)");
  expect(await boundaries(page)).not.toEqual(before);
  await expect(applyButton(page)).toBeDisabled();
  // An edit back to (h)'s values names (h) again.
  await setField(page, "alphaS", "15");
  await expect(menu(page)).toHaveValue("h");

  // Typed but not applied: Apply is enabled, the plots and the menu stay.
  await field(page, "alphaL").fill("10");
  await expect(applyButton(page)).toBeEnabled();
  await expect(menu(page)).toHaveValue("h");
  await menu(page).selectOption("m");
  await expect(field(page, "alphaL")).toHaveValue("-10");
  await expect(field(page, "alphaS")).toHaveValue("0");
  await expect(applyButton(page)).toBeDisabled();
  expect(await invariantKinds(page)).toEqual([]);
  // Choosing the applied preset again discards edits too.
  await field(page, "alphaS").fill("5");
  await menu(page).selectOption("custom");
  await menu(page).selectOption("m");
  await expect(field(page, "alphaS")).toHaveValue("0");
});

test("Custom opens the Parameters panel and keeps the system", async ({ page }) => {
  const before = await boundaries(page);
  await expect(page.locator(".parameters")).not.toHaveAttribute("open");
  await menu(page).selectOption("custom");
  await expect(page.locator(".parameters")).toHaveAttribute("open");
  await expect(field(page, "alphaL")).toBeFocused();
  // The preset is still applied, so the menu goes back to naming it.
  await expect(menu(page)).toHaveValue("h");
  await expect(page.locator(".system-label")).toHaveText("Eutectic");
  expect(await boundaries(page)).toEqual(before);
});

test("the Parameters summary and Apply explain themselves in tooltips", async ({ page }) => {
  await expect(page.locator(".parameters summary")).toHaveAttribute(
    "title",
    "Show or hide the system's parameters and the plot window, to edit them",
  );
  await openPanel(page);
  await expect(applyButton(page)).toHaveAttribute(
    "title",
    "Redraw the plots with the edited parameters",
  );
});

test("the fieldsets keep each row on one line at their least width, three abreast at 900 px, four wider", async ({
  page,
}) => {
  await openPanel(page);
  // At their least width, 15.75rem: every name and unit fits its column.
  await page.addStyleTag({ content: ".parameters form { width: 15.75rem }" });
  await page.evaluate(() => document.fonts.ready);
  const fits = await page.evaluate(() => {
    const range = document.createRange();
    return [...document.querySelectorAll(".parameters .field-name, .parameters .field-unit")].map(
      (el) => {
        range.selectNodeContents(el);
        return {
          text: el.textContent,
          fits: range.getBoundingClientRect().width <= el.getBoundingClientRect().width + 0.01,
        };
      },
    );
  });
  expect(fits.length).toBeGreaterThan(10);
  for (const { text, fits: ok } of fits) expect(ok, text ?? "").toBe(true);
  for (const box of await page
    .locator(".parameters fieldset")
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width))) {
    expect(box).toBeCloseTo(252, 0);
  }

  // Under the plots in a 900 px window, Solutions, Components and Compound sit side by side, and
  // Window right under Solutions.
  await page.goto("./");
  await page.setViewportSize({ width: 900, height: 700 });
  await openPanel(page);
  const sets = await page.locator(".parameters fieldset").evaluateAll((els) =>
    els.map((el) => ({
      name: el.className,
      ...(el.getBoundingClientRect().toJSON() as DOMRect),
    })),
  );
  expect(sets.map((r) => r.name)).toEqual(["solutions", "components", "compound", "window"]);
  const [solutions, components, compound, window] = sets;
  expect(new Set([solutions, components, compound].map((r) => Math.round(r!.top))).size).toBe(1);
  expect(solutions!.right).toBeLessThanOrEqual(components!.left);
  expect(components!.right).toBeLessThanOrEqual(compound!.left);
  expect(window!.left).toBeCloseTo(solutions!.left, 0);
  expect(window!.top - solutions!.bottom).toBeCloseTo(8, 0);

  // All four side by side once the panel holds four columns: under full-size plots, 1100 px wide.
  await page.setViewportSize({ width: 1100, height: 960 });
  const wide = await page
    .locator(".parameters fieldset")
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(new Set(wide).size).toBe(1);
});

test("in two columns, Window follows Solutions on the left, Components and Compound the right", async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 700 });
  await openPanel(page);
  const box = (name: string) =>
    page
      .locator(`.parameters ${name}`)
      .evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
  const [apply, solutions, components, window, compound] = await Promise.all(
    [
      ".apply",
      "fieldset.solutions",
      "fieldset.components",
      "fieldset.window",
      "fieldset.compound",
    ].map(box),
  );
  // Compound under Components. The left column sets the rows, so the gap between them is at least
  // the grid's.
  expect(compound!.left).toBeCloseTo(components!.left, 0);
  expect(compound!.top - components!.bottom).toBeGreaterThanOrEqual(8 - 0.5);
  // Window right under Solutions, one 0.5rem gap apart, in the left column.
  expect(window!.left).toBeCloseTo(solutions!.left, 0);
  expect(window!.top - solutions!.bottom).toBeCloseTo(8, 0);
  // Components beside them, from Apply's top.
  expect(components!.left).toBeGreaterThan(solutions!.right);
  expect(Math.abs(components!.top - apply!.top)).toBeLessThan(12);
});

test("Custom scrolls to the Parameters panel only where it sits under the plots", async ({
  page,
}) => {
  const details = page.locator(".parameters");
  // Reduced motion scrolls at once, so a smooth scroll cannot still run into the next check.
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [width, under] of [
    [1280, false],
    [900, true],
    [375, true],
  ] as const) {
    await page.setViewportSize({ width, height: 700 });
    await page.goto("./");
    await expect(page.locator(".phase-diagram svg")).toBeVisible();
    await expect(details).not.toHaveAttribute("open");
    await menu(page).selectOption("custom");
    await expect(details).toHaveAttribute("open");
    await expect(field(page, "alphaL")).toBeFocused();
    if (under) {
      // At the top of the window, or as near as the page's end lets it come.
      const { top, end } = await page.evaluate(() => ({
        top: document.querySelector(".parameters")!.getBoundingClientRect().top,
        end: document.documentElement.scrollHeight - window.innerHeight - window.scrollY,
      }));
      expect(top, `${width}`).toBeGreaterThan(-1);
      expect(Math.min(top, end), `${width}`).toBeLessThan(1);
    } else {
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    }
    // A preset neither closes the panel nor scrolls.
    await page.evaluate(() => window.scrollTo(0, 0));
    await menu(page).selectOption("m");
    await expect(details).toHaveAttribute("open");
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  }
});

test("invalid edits keep the last valid system and say why", async ({ page }) => {
  await openPanel(page);
  const before = await boundaries(page);
  await field(page, "alphaS").fill("75");
  await field(page, "TmB").fill("-5");
  await applyButton(page).click();
  await expect(warning(page).locator("li")).toHaveText([
    "T_m,A and T_m,B must be positive.",
    "α_l and α_s must lie between −60 and +60 kJ/mol.",
    "Both melting points must lie inside the window.",
  ]);
  await expect(field(page, "alphaS")).toHaveAttribute("aria-invalid");
  await expect(field(page, "TmB")).toHaveAttribute("aria-invalid");
  await expect(field(page, "TmA")).not.toHaveAttribute("aria-invalid");
  await expect(field(page, "Tmin")).toHaveAttribute("aria-invalid");
  // The fields keep what was typed; the plots and the menu keep the last valid system.
  await expect(field(page, "alphaS")).toHaveValue("75");
  expect(await boundaries(page)).toEqual(before);
  await expect(menu(page)).toHaveValue("h");

  // An empty field is not a number; a window without the melting points is rejected.
  await field(page, "alphaS").fill("15");
  await field(page, "TmB").fill("1200");
  await setField(page, "Tmax", "1100");
  await expect(warning(page).locator("li")).toHaveText([
    "Both melting points must lie inside the window.",
  ]);
  await setField(page, "Tmax", "");
  await expect(warning(page).locator('li[data-check="finite"]')).toHaveCount(1);
  await expect(field(page, "Tmax")).toHaveAttribute("aria-invalid");
  expect(await boundaries(page)).toEqual(before);
  // T_max above the 5000 K cap.
  await setField(page, "Tmax", "6000");
  await expect(warning(page).locator("li")).toHaveText([
    "Melting points must lie below 5000 K, and T_max must not exceed it.",
  ]);
  await expect(field(page, "Tmax")).toHaveAttribute("aria-invalid");
  await expect(field(page, "TmB")).not.toHaveAttribute("aria-invalid");
  // Typing the applied value back clears the warning.
  await field(page, "Tmax").fill("1500");
  await expect(warning(page)).toBeEmpty();
  await expect(applyButton(page)).toBeDisabled();
});

test("the auto box fits the window on Apply and disables the window fields", async ({ page }) => {
  await openPanel(page);
  await autoBox(page).check();
  await expect(field(page, "Tmin")).toBeDisabled();
  await expect(applyButton(page)).toBeEnabled();
  await applyButton(page).click();
  // (h): 100 K below the eutectic at 634 K and above T_m,B, rounded out to 100 K.
  await expect(field(page, "Tmin")).toHaveValue("500");
  await expect(field(page, "Tmax")).toHaveValue("1300");
  await expect(menu(page)).toHaveValue("custom");
  await expect(page.getByRole("slider", { name: "Cut temperature T* (K)" })).toHaveAttribute(
    "min",
    "500",
  );
  expect(await yTicks(page)).not.toContain("400");
  // An edit with auto ticked refits the window.
  await setField(page, "TmB", "1600");
  await expect(field(page, "Tmax")).toHaveValue("1700");
  // A preset unticks it.
  await menu(page).selectOption("h");
  await expect(autoBox(page)).not.toBeChecked();
  await expect(field(page, "Tmin")).toBeEnabled();
  await expect(field(page, "Tmin")).toHaveValue("300");
});

test("a failed Apply with auto shows the fitted window it checked", async ({ page }) => {
  await openPanel(page);
  await autoBox(page).check();
  // A eutectic within 1e-3 K of T_m,B, which cannot be computed; its window is fitted to
  // 300–2100 K, not (h)'s 300–1500 K that the disabled fields showed before.
  const fields = {
    TmA: 1934.22,
    TmB: 440.34,
    dsA: 17.24,
    dsB: 14.02,
    alphaL: 26.88,
    alphaS: 47.78,
  };
  for (const [name, v] of Object.entries(fields)) await field(page, name).fill(String(v));
  await applyButton(page).click();
  await expect(warning(page).locator('li[data-check="computed"]')).toHaveCount(1);
  await expect(field(page, "Tmin")).toHaveValue("300");
  await expect(field(page, "Tmax")).toHaveValue("2100");
  await expect(field(page, "Tmax")).not.toHaveAttribute("aria-invalid");
});

test("the component names appear under the axis and are part of the system", async ({ page }) => {
  await openPanel(page);
  await field(page, "nameA").fill("  Cu ");
  await field(page, "nameB").fill("Ag");
  await field(page, "nameB").press("Enter");
  await expect(page.locator('.component-name[data-end="A"]')).toHaveText("Cu");
  await expect(page.locator('.component-name[data-end="B"]')).toHaveText("Ag");
  await expect(field(page, "nameA")).toHaveValue("Cu");
  await expect(menu(page)).toHaveValue("custom");
  // An empty name falls back to its letter.
  await setField(page, "nameA", "");
  await expect(page.locator('.component-name[data-end="A"]')).toHaveText("A");
  await menu(page).selectOption("h");
  await expect(field(page, "nameB")).toHaveValue("B");
});

test("Δh follows the typed melting point and entropy", async ({ page }) => {
  await openPanel(page);
  const dhA = page.locator(".parameters output").nth(0);
  await expect(dhA).toHaveText("8 kJ/mol");
  await field(page, "dsA").fill("12.5");
  await expect(dhA).toHaveText("10 kJ/mol");
  await field(page, "TmA").fill("");
  await expect(dhA).toHaveText("—");
});

test("the logo snaps up through the invariants, wraps, and names its target", async ({ page }) => {
  // The Snap button is gone: the logo does its work.
  await expect(page.locator("button.snap")).toHaveCount(0);
  await expect(snap(page)).toHaveAccessibleName("ThermoBRIDGE");
  await menu(page).selectOption("p4");
  // The cut starts at 900 K, between the peritectic (821.1 K) and the monotectic (1131.5 K).
  await expect(snap(page)).toHaveAccessibleDescription("Snap the cut to the monotectic, 1132 K");
  // The tooltip spells out the name above it.
  await expect(snap(page)).toHaveAttribute(
    "title",
    "ThermoBRIDGE: Binary Regular-solution Interactive Diagram Generator for Education\n" +
      "Snap the cut to the monotectic, 1132 K",
  );
  await snap(page).click();
  expect(await cutValue(page)).toBeCloseTo(1131.5, 1);
  await expect(snap(page)).toHaveAccessibleDescription("Snap the cut to the peritectic, 821 K");
  await snap(page).click();
  expect(await cutValue(page)).toBeCloseTo(821.1, 1);
  await expect(page.getByRole("spinbutton", { name: /Cut temperature.*typed value/ })).toHaveValue(
    "821.1",
  );
  await snap(page).click();
  expect(await cutValue(page)).toBeCloseTo(1131.5, 1);
  // The guide lines meet the cut at the monotectic's three points.
  await expect(page.locator(".phase-diagram .bold-value")).toHaveCount(3);

  // In a system without an invariant it does nothing, and says so.
  await menu(page).selectOption("m1");
  await expect(snap(page)).toHaveAttribute("aria-disabled", "true");
  await expect(snap(page)).toHaveAccessibleDescription(
    "This system has no invariant to snap the cut to",
  );
  const before = await cutValue(page);
  // Playwright waits for an aria-disabled button to be enabled; a real click still lands.
  await snap(page).click({ force: true });
  expect(await cutValue(page)).toBe(before);
  await menu(page).selectOption("h");
  await expect(snap(page)).not.toHaveAttribute("aria-disabled");
  await expect(snap(page)).toHaveAccessibleDescription("Snap the cut to the eutectic, 634 K");
});

test("the Metastable toggle shows its state and hides the metastable class", async ({ page }) => {
  const button = page.getByRole("button", { name: "Metastable" });
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".phase-diagram")).toHaveClass(/hide-metastable/);
  await expect(page.locator(".slice-panel")).toHaveClass(/hide-metastable/);
  await button.click();
  await expect(page.locator(".phase-diagram")).not.toHaveClass(/hide-metastable/);
});

test("the main row's controls are all 44 px high, and the buttons at least 44 px wide", async ({
  page,
}) => {
  for (const width of [1280, 600, 412]) {
    await setWidth(page, width);
    const boxes = await page.locator(".main-row > *").evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName, width: r.width, height: r.height, top: r.top };
      }),
    );
    // The System menu, Lever, Metastable, Labels and Share.
    expect(boxes).toHaveLength(5);
    for (const b of boxes) {
      expect(b.height, `${width}`).toBe(44);
      expect(b.top, `${width}`).toBe(boxes[0]!.top);
      if (b.tag === "BUTTON") expect(b.width, `${width}`).toBeGreaterThanOrEqual(44);
    }
    // The menu keeps at least about 9rem.
    expect(boxes[0]!.width, `${width}`).toBeGreaterThanOrEqual(143);
  }
});

test("the readout lists the fields along the cut for screen readers", async ({ page }) => {
  const readout = page.getByRole("region", { name: "Readout" });
  await expect(readout.locator(".readout-heading")).toHaveText(
    "Fields along the cut at 900.0 K, by mole fraction of B",
  );
  await expect(readout.locator("li")).toHaveText([
    "0 to 0.638: L",
    "0.638 to 0.948: L + β",
    "0.948 to 1: β",
  ]);
  await handle(page).focus();
  await page.keyboard.press("PageDown");
  await page.keyboard.press("PageDown");
  await page.keyboard.press("PageDown");
  await expect(readout.locator(".readout-heading")).toContainText("600.0 K");
  await expect(readout.locator("li")).toHaveText([/: α$/, /: α \+ β$/, /: β$/]);
  // Hidden on screen.
  const box = (await readout.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(1);
});
