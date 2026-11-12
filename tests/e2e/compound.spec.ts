import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import {
  applyButton,
  diagram,
  expect,
  field,
  menu,
  setCut,
  slicePanel,
  test,
  warning,
} from "./fixtures";

// The intermediate compound on screen (plan §9 phase 13): the Compound fieldset, the compound
// presets, a link with a compound, and its drawing in both plots.

const compoundBox = (page: Page) =>
  page.getByRole("checkbox", { name: "Add compound", exact: true });
const width = (page: Page, label: "Line" | "Range") =>
  page.getByRole("radio", { name: `Compound width: ${label}` });
const compoundLabel = (page: Page) => diagram(page).locator(".compound-label text");
/** The stable boundaries that trace an end of a tie line at the compound. */
const compoundBoundaries = (page: Page) =>
  diagram(page).locator('path.boundary.stable[data-phases*="C"]');

async function openPanel(page: Page) {
  await page.locator(".parameters summary").click();
  await expect(field(page, "alphaL")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(page.locator(".phase-diagram svg")).toBeVisible();
});

test("the Compound fieldset: the box, the Width, Apply and a warning", async ({ page }) => {
  await openPanel(page);
  // Unticked at first, with its fields disabled.
  await expect(compoundBox(page)).not.toBeChecked();
  for (const name of ["Xc", "dhf", "dsf", "alphaG"]) await expect(field(page, name)).toBeDisabled();
  await expect(width(page, "Line")).toBeDisabled();
  const legend = page.locator(".parameters fieldset.compound legend");
  await expect(legend).toHaveText("Intermediate Compound (Daltonide)");

  // Ticked, the line's fields open and α_γ stays shut until Range.
  await compoundBox(page).check();
  await expect(applyButton(page)).toBeEnabled();
  for (const name of ["Xc", "dhf", "dsf"]) await expect(field(page, name)).toBeEnabled();
  await expect(width(page, "Line")).toBeChecked();
  await expect(field(page, "alphaG")).toBeDisabled();
  await page.locator(".segmented label", { hasText: "Range" }).click();
  await expect(width(page, "Range")).toBeChecked();
  await expect(legend).toHaveText("Intermediate Compound (Berthollide)");
  await expect(field(page, "alphaG")).toBeEnabled();
  await expect(field(page, "alphaG")).toHaveValue("-150");

  // Nothing changes until Apply; then (h) with the default range compound is c3.
  await expect(compoundBoundaries(page)).toHaveCount(0);
  await applyButton(page).click();
  await expect(applyButton(page)).toBeDisabled();
  await expect(menu(page)).toHaveValue("c3");
  await expect(diagram(page).locator('.field-label[data-phase="C"]')).toHaveText("γ");

  // An X_c out of range is refused, its field marked, and the plots keep c3.
  await field(page, "Xc").fill("0.99");
  await field(page, "Xc").press("Enter");
  await expect(warning(page).locator('li[data-check="compoundX"]')).toHaveText(
    "X_c must lie between 0.05 and 0.95.",
  );
  await expect(field(page, "Xc")).toHaveAttribute("aria-invalid");
  await expect(field(page, "dhf")).not.toHaveAttribute("aria-invalid");
  await expect(menu(page)).toHaveValue("c3");

  // Unticking the box drops the compound on Apply: back to (h), named as a custom system.
  await compoundBox(page).uncheck();
  await expect(field(page, "Xc")).toBeDisabled();
  await expect(field(page, "Xc")).not.toHaveAttribute("aria-invalid");
  await applyButton(page).click();
  await expect(warning(page)).toBeEmpty();
  await expect(compoundBoundaries(page)).toHaveCount(0);
  await expect(diagram(page).locator('.field-label[data-phase="C"]')).toHaveCount(0);
});

test("c1 from the menu: the line, its name beside it, and its point in the slice", async ({
  page,
}) => {
  await menu(page).selectOption("c1");
  await expect(page.locator(".system-label")).toHaveText("Congruent compound");
  // The vertical line at X_c, and AB beside it, in the compound's curve colour.
  await expect(compoundBoundaries(page)).not.toHaveCount(0);
  await expect(compoundLabel(page)).toHaveText("AB");
  await expect(compoundLabel(page)).toHaveCSS("fill", "rgb(202, 124, 89)");
  const label = (await compoundLabel(page).boundingBox())!;
  const area = (await diagram(page).locator(".frame").boundingBox())!;
  expect(label.x).toBeGreaterThan(area.x + area.width / 2);
  // L + AB and AB + β fields and the eutectic temperatures.
  const names = await diagram(page).locator(".field-labels > text").allTextContents();
  expect(names).toEqual(expect.arrayContaining(["L + AB", "AB + β", "α + AB"]));
  // The cut starts at 900 K, where AB is stable: a solid vertical line from the panel's top down
  // to its point, where one marker, one guide and one bold value serve both tangents.
  const line = slicePanel(page).locator(".compound-line");
  await expect(line).toHaveClass(/stable/);
  await expect(line).toHaveCSS("stroke", "rgb(202, 124, 89)");
  // No circle of its own on the envelope: the touching point's marker is there.
  await expect(slicePanel(page).locator(".compound-end")).toHaveCount(0);
  await expect(line).toHaveAttribute("y1", "0");
  const end = Number(await line.getAttribute("y2"));
  const marker = slicePanel(page).locator(".markers circle.touch-marker.stable").nth(1);
  expect(Number(await marker.getAttribute("cy"))).toBeCloseTo(end, 6);
  expect(Number(await marker.getAttribute("cx"))).toBeCloseTo(
    Number(await line.getAttribute("x1")),
    6,
  );
  await expect(diagram(page).locator(".bold-value text")).toHaveCount(3);
  await expect(diagram(page).locator(".bold-value text").nth(1)).toHaveText("0.500");
  await expect(slicePanel(page).locator(".guides line.guide.stable")).toHaveCount(3);
  await expect(slicePanel(page).locator(".markers circle.touch-marker.stable")).toHaveCount(3);
  // Above its melting point, dashed, and hidden with the metastable branches.
  await setCut(page, 1100);
  await expect(line).toHaveClass(/metastable/);
  await expect(line).toHaveCSS("stroke-dasharray", "6px, 4px");
  // With a small open circle at its end.
  const end1100 = slicePanel(page).locator(".compound-end");
  await expect(end1100).toHaveCount(1);
  await expect(end1100).toHaveAttribute("cy", (await line.getAttribute("y2"))!);
  await expect(end1100).toHaveCSS("fill", "rgb(255, 255, 255)");
  await expect(end1100).toHaveCSS("stroke", "rgb(202, 124, 89)");
  await page.getByRole("button", { name: "Metastable" }).click();
  await expect(line).toBeHidden();
  await expect(end1100).toBeHidden();
  // The Compound fieldset follows the preset.
  await openPanel(page);
  await expect(compoundBox(page)).toBeChecked();
  await expect(width(page, "Line")).toBeChecked();
  await expect(field(page, "dhf")).toHaveValue("-6");
  await menu(page).selectOption("h");
  await expect(compoundBox(page)).not.toBeChecked();
});

test("c3 from the menu: γ's field, its curve and the lever rule's names", async ({ page }) => {
  await menu(page).selectOption("c3");
  await setCut(page, 600);
  await expect(diagram(page).locator('.field-label[data-phase="C"]')).toHaveText("γ");
  await expect(compoundLabel(page)).toHaveCount(0);
  await expect(slicePanel(page).locator('.curve.stable[data-phase="C"]')).toHaveCount(1);
  await expect(slicePanel(page).locator('.curve[data-phase="C"]').first()).toHaveCSS(
    "stroke",
    "rgb(202, 124, 89)",
  );
  await expect(slicePanel(page).locator('.shade[data-kind="C"]')).toHaveCount(1);
  await expect(slicePanel(page).locator('.shade[data-kind="S+C"]')).toHaveCount(2);
  await expect(slicePanel(page).locator(".compound-line")).toHaveCount(0);
  await page.getByRole("button", { name: "Lever rule" }).click();
  await page.getByRole("spinbutton", { name: /Overall composition.*typed value/ }).fill("0.3");
  await page.getByRole("spinbutton", { name: /Overall composition.*typed value/ }).press("Enter");
  await expect(page.locator(".lever-phases .lever-phase")).toHaveText(["α", "γ"]);
});

test("c7 from the menu: the congruent transformation's marker, and one α above it", async ({
  page,
}) => {
  await menu(page).selectOption("c7");
  await expect(diagram(page).locator('.event-point[data-kind="congruent"]')).toHaveCount(1);
  await expect(diagram(page).locator("line.invariant")).toHaveCount(0);
  await setCut(page, 1000);
  await expect(page.locator(".readout .fields li")).toHaveText([/: L$/, /: L \+ α$/, /: α$/]);
});

test("a shared link with ;C opens its compound, with real subscripts for a decimal formula", async ({
  page,
}) => {
  await page.goto("./#1,Mine,A,B,800,1200,10,10,0,15,300,1500;C,.43,-6,0,l;T,600");
  await expect(compoundLabel(page)).toHaveText("A0.57B0.43");
  await expect(compoundLabel(page).locator("tspan.sub")).toHaveText(["0.57", "0.43"]);
  await expect(page.locator(".readout .fields li").nth(2)).toHaveText("at 0.430: A 0.57 B 0.43");
  await openPanel(page);
  await expect(compoundBox(page)).toBeChecked();
  await expect(field(page, "Xc")).toHaveValue("0.43");
  await expect(menu(page)).toHaveValue("custom");
});

test("axe finds no violations with the Compound fieldset open", async ({ page }) => {
  await openPanel(page);
  await compoundBox(page).check();
  await page.locator(".segmented label", { hasText: "Range" }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await menu(page).selectOption("c1");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
