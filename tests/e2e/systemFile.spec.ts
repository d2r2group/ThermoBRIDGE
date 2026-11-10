import { readFile } from "node:fs/promises";
import { devices, type Page } from "@playwright/test";
import {
  applyButton,
  autoBox,
  boundaries,
  cutValue,
  expect,
  field,
  handle,
  leverToggle,
  menu,
  setWidth,
  test,
  warning,
  X0,
} from "./fixtures";

// The system name, the JSON file and the share link (plan §8 rows 17–19, §9 phase 9).

const nameField = (page: Page) => page.getByRole("textbox", { name: "System name" });
const selected = (page: Page) => menu(page).locator("option:checked");
const shown = (page: Page) => page.locator(".system-label");
const picker = (page: Page) => page.locator('.parameters input[type="file"]');

/** Opens the page (at `hash`, if given) and the Parameters panel. */
async function open(page: Page, hash = "") {
  await page.goto(`./${hash}`);
  await expect(page.locator(".phase-diagram svg")).toBeVisible();
  await page.locator(".parameters summary").click();
}

/** Imports `text` as a file through the hidden picker. */
async function importText(page: Page, text: string, name = "system.json") {
  await picker(page).setInputFiles({
    name,
    mimeType: "application/json",
    buffer: Buffer.from(text),
  });
}

/** Exports the applied system and returns the download's name and text. */
async function exportFile(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export" }).click(),
  ]);
  return {
    name: download.suggestedFilename(),
    text: await readFile((await download.path())!, "utf8"),
  };
}

/** Applies a custom system named "My system", with components Ag and Cu and a typed window. */
async function applyCustom(page: Page) {
  await field(page, "alphaS").fill("20");
  await field(page, "nameA").fill("Ag");
  await field(page, "nameB").fill("Cu");
  await field(page, "Tmax").fill("1600");
  await nameField(page).fill("My system");
  await applyButton(page).click();
  await expect(warning(page)).toBeEmpty();
  await expect(selected(page)).toHaveText("My system");
}

/** Records what Share copies, with `navigator.share` taken away. */
async function stubClipboard(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { copied: string[] };
    w.copied = [];
    Object.defineProperty(navigator, "share", { value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async (text: string) => void w.copied.push(text) },
    });
  });
}
const copied = (page: Page) =>
  page.evaluate(() => (window as unknown as { copied: string[] }).copied);

test("the name field shows the preset's label and follows the menu", async ({ page }) => {
  await open(page);
  await expect(nameField(page)).toHaveValue("Eutectic");
  await expect(nameField(page)).toHaveAttribute("maxlength", "40");
  await menu(page).selectOption("p1");
  await expect(nameField(page)).toHaveValue("Peritectic");
  // Under Apply and its buttons, and above the Solutions fieldset, as wide as it.
  const share = (await page.getByRole("button", { name: "Export" }).boundingBox())!;
  const row = (await page.locator(".parameters .name-row").boundingBox())!;
  const set = (await page.locator(".parameters fieldset").first().boundingBox())!;
  expect(share.y + share.height).toBeLessThanOrEqual(row.y);
  expect(row.y + row.height).toBeLessThanOrEqual(set.y);
  expect(Math.abs(row.width - set.width)).toBeLessThan(1);
});

test("a typed name enables Apply and changes nothing until Apply", async ({ page }) => {
  await open(page);
  await nameField(page).fill("Water");
  await expect(applyButton(page)).toBeEnabled();
  await expect(shown(page)).toHaveText("Eutectic");
  await applyButton(page).click();
  // The name does not change the physics: (h)'s parameters keep (h) selected.
  await expect(menu(page)).toHaveValue("h");
  await expect(shown(page)).toHaveText("Eutectic");
  await expect(applyButton(page)).toBeDisabled();
  await expect(nameField(page)).toHaveValue("Water");

  // On a custom system the Custom option and the closed menu read the name, trimmed.
  await field(page, "alphaS").fill("20");
  await nameField(page).fill("  Wide gap  ");
  await nameField(page).press("Enter");
  await expect(menu(page)).toHaveValue("custom");
  await expect(selected(page)).toHaveText("Wide gap");
  await expect(shown(page)).toHaveText("Wide gap");
  await expect(nameField(page)).toHaveValue("Wide gap");
  // An empty name applies as Custom.
  await nameField(page).fill("");
  await applyButton(page).click();
  await expect(nameField(page)).toHaveValue("Custom");
  await expect(shown(page)).toHaveText("Custom");
  // The menu discards a typed name, and its Custom option reads Custom again after a preset.
  await nameField(page).fill("Unapplied");
  await menu(page).selectOption("c");
  await expect(nameField(page)).toHaveValue("Eutectic, wider gap");
  await expect(menu(page).locator('option[value="custom"]')).toHaveText("Custom");
});

test("an edit of a preset keeps the preset's name, marked as custom", async ({ page }) => {
  await open(page);
  await field(page, "alphaS").fill("20");
  await applyButton(page).click();
  await expect(menu(page)).toHaveValue("custom");
  await expect(nameField(page)).toHaveValue("Eutectic (custom)");
  await expect(shown(page)).toHaveText("Eutectic (custom)");
});

test("Export downloads Eutectic.json, which holds the applied system", async ({ page }) => {
  await open(page);
  // An unapplied edit is not exported.
  await field(page, "alphaS").fill("20");
  const { name, text } = await exportFile(page);
  expect(name).toBe("Eutectic.json");
  expect(JSON.parse(text)).toMatchObject({
    format: "thermobridge-system",
    version: 1,
    name: "Eutectic",
    components: { A: "A", B: "B" },
    params: { TmA: 800, TmB: 1200, dsA: 10, dsB: 10, alphaL: 0, alphaS: 15 },
    window: { Tmin: 300, Tmax: 1500 },
    autoWindow: false,
  });
});

test("an exported custom file, imported after a reload, restores the system and resets the cut", async ({
  page,
}) => {
  await open(page);
  await applyCustom(page);
  const diagram = await boundaries(page);
  const { name, text } = await exportFile(page);
  expect(name).toBe("My_system.json");

  await page.reload();
  await expect(page.locator(".phase-diagram svg")).toBeVisible();
  await page.locator(".parameters summary").click();
  await handle(page).focus();
  await page.keyboard.press("PageUp");
  await importText(page, text, name);
  await expect(warning(page)).toBeEmpty();
  await expect(nameField(page)).toHaveValue("My system");
  await expect(menu(page)).toHaveValue("custom");
  await expect(shown(page)).toHaveText("My system");
  await expect(autoBox(page)).not.toBeChecked();
  await expect(field(page, "alphaS")).toHaveValue("20");
  await expect(field(page, "Tmax")).toHaveValue("1600");
  await expect(page.locator('.component-name[data-end="A"]')).toHaveText("Ag");
  await expect(page.locator('.component-name[data-end="B"]')).toHaveText("Cu");
  expect(await boundaries(page)).toEqual(diagram);
  await expect(applyButton(page)).toBeDisabled();
  // The cut is back in the middle of the window.
  expect(await cutValue(page)).toBe(950);
  // The same file again imports it again.
  await menu(page).selectOption("h");
  await importText(page, text, name);
  await expect(nameField(page)).toHaveValue("My system");
});

test("an imported file that fails validate shows the issues and keeps the plots", async ({
  page,
}) => {
  await open(page);
  const { text } = await exportFile(page);
  const file = JSON.parse(text);
  file.name = "Bad";
  file.params.dsA = -1;
  const before = await boundaries(page);
  await importText(page, JSON.stringify(file));
  await expect(warning(page).locator('li[data-check="entropy"]')).toBeVisible();
  expect(await boundaries(page)).toEqual(before);
  await expect(field(page, "dsA")).toHaveValue("-1");
  await expect(field(page, "dsA")).toHaveAttribute("aria-invalid");
  await expect(nameField(page)).toHaveValue("Bad");
  await expect(applyButton(page)).toBeEnabled();
});

test("a malformed file shows a one-line warning and changes nothing", async ({ page }) => {
  await open(page);
  await field(page, "alphaS").fill("20");
  for (const [text, problem] of [
    ["not json", "it is not JSON"],
    ['{"format": "pterrain-substance"}', 'its format is not "thermobridge-system"'],
  ] as const) {
    await importText(page, text);
    await expect(warning(page)).toHaveText(`Not a ThermoBRIDGE system file: ${problem}.`);
  }
  await expect(field(page, "alphaS")).toHaveValue("20");
  await expect(nameField(page)).toHaveValue("Eutectic");
  await expect(menu(page)).toHaveValue("h");
});

test("a file over 64 KB is refused before it is read", async ({ page }) => {
  await open(page);
  const { text } = await exportFile(page);
  const file = JSON.parse(text);
  file.name = "Large";
  file.params.alphaS = 20;
  // A valid file, padded past the limit with whitespace: only its size refuses it.
  const large = JSON.stringify(file) + " ".repeat(64 * 1024);
  await importText(page, large);
  await expect(warning(page)).toHaveText(
    "Not a ThermoBRIDGE system file: it is larger than 64 KB.",
  );
  await expect(nameField(page)).toHaveValue("Eutectic");
  // Under the limit it is read (the units hold a few two-byte characters).
  await importText(page, JSON.stringify(file).padEnd(63 * 1024));
  await expect(warning(page)).toBeEmpty();
  await expect(nameField(page)).toHaveValue("Large");
});

test("opening #k;T,700;X,0.3 sets the syntectic, the cut and the lever rule, and clears the fragment", async ({
  page,
}) => {
  await open(page, "#k;T,700;X,0.3");
  await expect(menu(page)).toHaveValue("k");
  await expect(nameField(page)).toHaveValue("Syntectic");
  expect(await cutValue(page)).toBe(700);
  await expect(leverToggle(page)).toHaveAttribute("aria-pressed", "true");
  expect(await X0(page)).toBe(0.3);
  expect(new URL(page.url()).hash).toBe("");
  await expect(warning(page)).toBeEmpty();
  // A link without X₀ turns the lever rule off; a cut outside the window is clamped.
  await page.evaluate(() => (location.hash = "#c;T,10"));
  await expect(menu(page)).toHaveValue("c");
  await expect(leverToggle(page)).toHaveAttribute("aria-pressed", "false");
  expect(await cutValue(page)).toBe(300);
});

test("a link to a custom system with a typed window restores it", async ({ page }) => {
  await stubClipboard(page);
  await open(page);
  await applyCustom(page);
  await leverToggle(page).click();
  const cutField = page.getByRole("spinbutton", { name: /Cut temperature.*typed value/ });
  await cutField.fill("912");
  await cutField.press("Enter");
  const diagram = await boundaries(page);
  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  // The live status announces the copy, which the button's new label alone would not.
  await expect(page.getByRole("status").filter({ hasText: "Link copied" })).toHaveCount(1);
  const [link] = await copied(page);
  expect(link).toMatch(/\/#1,My%20system,Ag,Cu,800,1200,10,10,0,20,300,1600;T,912;X,\.5$/);
  await expect(page.getByRole("button", { name: "Share" })).toBeVisible({ timeout: 3000 });
  await expect(page.getByRole("status").filter({ hasText: "Link copied" })).toHaveCount(0);

  // The copied link opens the same view in a new page.
  const other = await page.context().newPage();
  await open(other, new URL(link!).hash);
  await expect(nameField(other)).toHaveValue("My system");
  await expect(shown(other)).toHaveText("My system");
  await expect(autoBox(other)).not.toBeChecked();
  await expect(field(other, "Tmin")).toBeEnabled();
  await expect(field(other, "Tmax")).toHaveValue("1600");
  await expect(field(other, "nameA")).toHaveValue("Ag");
  expect(await cutValue(other)).toBe(912);
  await expect(leverToggle(other)).toHaveAttribute("aria-pressed", "true");
  expect(await X0(other)).toBe(0.5);
  expect(await boundaries(other)).toEqual(diagram);
});

test("a link pasted into an open tab applies through hashchange", async ({ page }) => {
  await open(page);
  const pasted = "#1,Pasted,A,B,800,1600,10,10,5,15;T,1000";
  await page.evaluate((hash) => (location.hash = hash), pasted);
  await expect(nameField(page)).toHaveValue("Pasted");
  await expect(autoBox(page)).toBeChecked();
  await expect(field(page, "TmB")).toHaveValue("1600");
  await expect(menu(page)).toHaveValue("custom");
  await expect.poll(() => cutValue(page)).toBe(1000);
  await expect.poll(() => new URL(page.url()).hash).toBe("");
  // The same link pasted again applies again.
  await field(page, "alphaL").fill("6");
  await applyButton(page).click();
  await page.evaluate((hash) => (location.hash = hash), pasted);
  await expect(field(page, "alphaL")).toHaveValue("5");
});

test("a malformed link warns and leaves the default system", async ({ page }) => {
  await open(page, "#2,x,1");
  await expect(warning(page)).toHaveText("Not a ThermoBRIDGE link: version 2 is not supported.");
  await expect(menu(page)).toHaveValue("h");
  await expect(nameField(page)).toHaveValue("Eutectic");
  expect(new URL(page.url()).hash).toBe("");
  // A link whose system fails `validate` lists the issues.
  await page.evaluate(() => (location.hash = "#1,Bad,A,B,800,1200,-1,10,0,15,300,1500"));
  await expect(warning(page).locator('li[data-check="entropy"]')).toBeVisible();
  await expect(menu(page)).toHaveValue("h");
  await expect(nameField(page)).toHaveValue("Bad");
  await expect(applyButton(page)).toBeEnabled();
});

test("a link that can be neither shared nor copied is shown selected", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
  });
  await open(page);
  await page.getByRole("button", { name: "Share" }).click();
  const link = page.getByRole("textbox", { name: "Share link" });
  await expect(link).toHaveValue(/\/#h;T,900$/);
  await expect(link).toHaveAttribute("readonly");
  await expect(link).toBeFocused();
  expect(await link.evaluate((el: HTMLInputElement) => el.selectionEnd! - el.selectionStart!)).toBe(
    (await link.inputValue()).length,
  );
  // Under Share, in the header, not in the Parameters warning below the plots.
  await expect(warning(page)).toBeEmpty();
  const share = (await page.getByRole("button", { name: "Share" }).boundingBox())!;
  const box = (await link.boundingBox())!;
  const plots = (await page.locator(".plots").boundingBox())!;
  expect(box.y).toBeGreaterThan(share.y + share.height);
  expect(box.x + box.width).toBeLessThanOrEqual(share.x + share.width);
  expect(await page.locator("header .share-fallback").isVisible()).toBe(true);
  expect(plots.y).toBeGreaterThan(share.y);
  // Escape closes it and hands focus back to Share; so does focus moving elsewhere.
  await page.keyboard.press("Escape");
  await expect(link).toBeHidden();
  await expect(page.getByRole("button", { name: "Share" })).toBeFocused();
  await page.getByRole("button", { name: "Share" }).click();
  await expect(link).toBeFocused();
  // A click on its text keeps it open.
  await page.locator(".share-fallback p").click();
  await expect(link).toBeVisible();
  await handle(page).focus();
  await expect(link).toBeHidden();
  await page.getByRole("button", { name: "Share" }).click();
  await page.locator(".slice-panel svg").click();
  await expect(link).toBeHidden();
});

test("Import and Export sit under Apply, as wide as it, and hide with the panel", async ({
  page,
}) => {
  await open(page);
  const buttons = ["Import", "Export"].map((name) => page.getByRole("button", { name }));
  const boxes = await Promise.all(buttons.map(async (b) => (await b.boundingBox())!));
  const apply = (await applyButton(page).boundingBox())!;
  const name = (await page.locator(".parameters .name-row").boundingBox())!;
  for (const box of boxes) {
    expect(box.y).toBeGreaterThanOrEqual(apply.y + apply.height);
    expect(box.y + box.height).toBeLessThanOrEqual(name.y);
    expect(Math.abs(box.y - boxes[0]!.y)).toBeLessThan(1);
    expect(Math.abs(box.height - apply.height)).toBeLessThan(1);
  }
  expect(Math.abs(boxes[0]!.x - apply.x)).toBeLessThan(1);
  expect(Math.abs(boxes[1]!.x + boxes[1]!.width - (apply.x + apply.width))).toBeLessThan(1);
  // Each has an icon, hidden from screen readers, and is named by its text alone; Apply has none.
  for (const button of buttons) {
    await expect(button.locator('svg.icon[aria-hidden="true"]')).toHaveCount(1);
  }
  await expect(applyButton(page).locator("svg")).toHaveCount(0);
  await page.locator(".parameters summary").click();
  for (const button of buttons) await expect(button).toBeHidden();
});

test("Share sits at the main row's end, in reach with the panel closed", async ({ page }) => {
  await page.goto("./");
  const share = page.getByRole("button", { name: "Share" });
  await expect(share).toBeVisible();
  await expect(page.locator(".parameters")).not.toHaveAttribute("open");
  expect(await page.locator(".main-row > *").last().getAttribute("class")).toBe("share-box");
  await expect(share.locator('svg.icon[aria-hidden="true"]')).toHaveCount(1);
  // Icon only with the compact header, still named Share.
  await setWidth(page, 600);
  expect((await share.boundingBox())!.width).toBe(44);
  await expect(share).toHaveAccessibleName("Share");
});

test.describe("on a phone", () => {
  const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = devices["Pixel 7"];
  test.use({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent });

  test("Share opens the share sheet with the link and the name", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { shared: ShareData[] };
      w.shared = [];
      Object.defineProperty(navigator, "share", {
        value: async (data: ShareData) => void w.shared.push(data),
      });
    });
    await open(page);
    await page.getByRole("button", { name: "Share" }).click();
    const shared = () => page.evaluate(() => (window as unknown as { shared: ShareData[] }).shared);
    await expect.poll(shared).toHaveLength(1);
    const [data] = await shared();
    expect(data!.title).toBe("Eutectic");
    expect(data!.url).toMatch(/\/#h;T,900$/);
    await expect(page.getByRole("button", { name: "Share" })).toBeVisible();
  });

  test("a link that can be neither shared nor copied shows above the plots, on screen", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "share", { value: undefined });
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: () => Promise.reject(new Error("denied")) },
      });
    });
    await page.goto("./");
    await page.getByRole("button", { name: "Share" }).click();
    const link = page.getByRole("textbox", { name: "Share link" });
    await expect(link).toBeFocused();
    const box = (await link.boundingBox())!;
    const plots = (await page.locator(".plots").boundingBox())!;
    expect(box.y + box.height).toBeLessThan(plots.y + plots.height / 2);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  });
});
