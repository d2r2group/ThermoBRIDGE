import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The stylesheets as text (plan §9 phase 11): one corner radius, the tokens' contrast, and the
// header and layout switching on the page's width.

const stylesDir = new URL("../src/styles/", import.meta.url);
const sheets = readdirSync(stylesDir)
  .filter((name) => name.endsWith(".css"))
  .map((name) => ({ name, css: readFileSync(new URL(name, stylesDir), "utf8") }));
const sheet = (name: string) => sheets.find((s) => s.name === name)!.css;

/** The custom properties declared in the block whose selector is exactly `selector`. */
function tokens(selector: string): Record<string, string> {
  const css = sheet("tokens.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const start = css.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]));
}

/** WCAG 2 contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("corner radius", () => {
  it("is one 4 px token", () => {
    expect(tokens(":root")["--radius"]).toBe("4px");
  });

  it("is the token (or 0, on a joined edge) on every rounded box", () => {
    const radii = sheets.flatMap(({ name, css }) =>
      [...css.matchAll(/border(?:-[a-z]+)*-radius:\s*([^;]+);/g)].map((m) => ({
        name,
        value: m[1]!,
      })),
    );
    expect(radii.length).toBeGreaterThan(5);
    for (const { name, value } of radii) {
      for (const part of value.trim().split(/\s+/))
        expect(["var(--radius)", "0"], name).toContain(part);
    }
  });
});

describe("palette", () => {
  const light = tokens(":root");
  const dark = { ...light, ...tokens(':root[data-theme="dark"]') };

  it("takes pTerrain's neutral greys and warning", () => {
    expect([light["--bg"], light["--fg"], light["--muted"], light["--warning"]]).toEqual([
      "#ffffff",
      "#000000",
      "#666666",
      "#bb4e1b",
    ]);
    expect([dark["--bg"], dark["--fg"], dark["--muted"], dark["--warning"]]).toEqual([
      "#111111",
      "#f2f2f2",
      "#999999",
      "#f0804c",
    ]);
    for (const theme of [light, dark]) {
      expect(theme["--boundary"]).toBe(theme["--fg"]);
      expect(theme["--cut"]).toBe(theme["--fg"]);
      expect(theme["--boundary-metastable"]).toBe(theme["--muted"]);
    }
  });

  it.each([
    ["light", light],
    ["dark", dark],
  ])("keeps text at 4.5 : 1 and the curves at 3 : 1 on the %s background", (_, theme) => {
    const bg = theme["--bg"]!;
    for (const key of ["--fg", "--muted", "--warning", "--d2r2"]) {
      expect(contrast(theme[key]!, bg), key).toBeGreaterThanOrEqual(4.5);
    }
    for (const key of [
      "--curve-solid",
      "--curve-liquid",
      "--curve-compound",
      "--boundary-metastable",
    ]) {
      expect(contrast(theme[key]!, bg), key).toBeGreaterThanOrEqual(3);
    }
    // The colours that also outline the open -tectoid markers.
    for (const key of ["--invariant-eu", "--invariant-mono", "--invariant-peri"]) {
      expect(contrast(theme[key]!, bg), key).toBeGreaterThanOrEqual(3);
    }
  });

  it("gives the five invariant prefixes five distinct colours, off the phase palette", () => {
    const keys = ["eu", "mono", "meta", "peri", "syn"].map((p) => `--invariant-${p}`);
    const colours = keys.map((k) => light[k]);
    expect(new Set(colours).size).toBe(5);
    for (const phase of ["--phase-solid", "--phase-liquid", "--phase-compound"]) {
      expect(colours).not.toContain(light[phase]);
    }
  });
});

describe("header and layout breakpoints", () => {
  it("go by the page's width, in #app's container, not the window's", () => {
    expect(sheet("header.css")).toMatch(/#app\s*{\s*container:\s*app\s*\/\s*inline-size;/);
    const header = sheet("header.css");
    expect(header).not.toMatch(/@media[^{]*width/);
    expect(header).toContain("@container app (max-width: 58.95rem)");
    expect(header).toContain("@container app (max-width: 42.9rem)");
    // The footer's tightening stays a media query; the plots' height fit follows the header.
    expect(sheet("layout.css")).toMatch(
      /@container app \(max-width: 42\.9rem\) {\s*\.layout {\s*--plots-chrome: 234px;/,
    );
  });
});
