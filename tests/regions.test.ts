import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { sliceHull } from "../src/physics/hull";
import { PRESETS, preset, type PresetId } from "../src/physics/presets";
import {
  checkerColour,
  fieldKind,
  parseHex,
  RasterCache,
  REGION_KINDS,
  regionRaster,
  rowHulls,
  rowHullsOf,
  rowT,
  type RegionKind,
} from "../src/ui/regions";
import { computeDiagram } from "../src/ui/state";

const COLS = 200;
const ROWS = 120;

/** The raster's kind at (X, T) for a preset, on a COLS × ROWS grid. */
function kindAt(kinds: Uint8Array, id: PresetId, X: number, T: number): RegionKind {
  const { Tmin, Tmax } = preset(id).window;
  const c = Math.min(COLS - 1, Math.floor(X * COLS));
  const r = Math.min(ROWS - 1, Math.floor(((Tmax - T) / (Tmax - Tmin)) * ROWS));
  return REGION_KINDS[kinds[r * COLS + c]!]!;
}

// Points well inside one field of each preset (plan §2.1), as [X_B, T, kind]. S + S is a solid gap
// (α + β or α₁ + α₂) and L + L a liquid gap (L₁ + L₂); C is the compound γ, and L + C and S + C
// its two-phase fields (§9 phase 13). A line compound's own field has no width, so no pixel.
const SAMPLES: Record<PresetId, [number, number, RegionKind][]> = {
  n: [
    [0.5, 500, "S"],
    [0.5, 1400, "L"],
    [0.37, 950, "L+S"],
  ],
  m: [
    [0.3, 500, "S"],
    [0.3, 1400, "L"],
    [0.28, 750, "L"],
    [0.65, 850, "L+S"],
  ],
  o: [
    [0.5, 500, "S"],
    [0.5, 1400, "L"],
    [0.2, 1050, "L+S"],
    [0.9, 1250, "L+S"],
  ],
  c: [
    [0.5, 400, "S+S"],
    [0.3, 650, "L"],
    [0.04, 750, "L+S"],
    [0.7, 850, "L+S"],
    [0.5, 1400, "L"],
  ],
  h: [
    [0.01, 450, "S"],
    [0.5, 450, "S+S"],
    [0.99, 450, "S"],
    [0.02, 650, "S"],
    [0.75, 850, "L+S"],
    [0.3, 1000, "L"],
  ],
  e: [
    [0.5, 500, "S+S"],
    [0.5, 950, "L+S"],
    [0.5, 1150, "L+L"],
    [0.5, 1400, "L"],
  ],
  k: [
    [0.5, 500, "S+S"],
    [0.8, 1000, "S"],
    [0.3, 1050, "L+S"],
    [0.5, 1550, "L+L"],
    [0.5, 1870, "L"],
  ],
  p1: [
    [0.5, 500, "S+S"],
    [0.1, 1500, "L"],
    [0.5, 1500, "L+S"],
    [0.95, 1500, "S"],
  ],
  p2: [
    [0.5, 500, "S+S"],
    [0.05, 1200, "L"],
    [0.5, 1200, "L+S"],
  ],
  p3: [
    [0.5, 500, "S+S"],
    [0.5, 1200, "L+S"],
    [0.95, 1200, "S"],
  ],
  p4: [
    [0.5, 500, "S+S"],
    [0.5, 950, "L+S"],
    [0.5, 1150, "L+L"],
    [0.5, 1400, "L"],
  ],
  m1: [
    [0.5, 250, "S+S"],
    [0.5, 420, "S"],
    [0.39, 600, "L"],
    [0.7, 600, "L+S"],
    [0.5, 1300, "L"],
  ],
  c1: [
    [0.25, 500, "S+C"],
    [0.75, 500, "S+C"],
    [0.3, 900, "L+C"],
    [0.75, 900, "S+C"],
    [0.55, 1000, "L+C"],
    [0.5, 1300, "L"],
  ],
  c2: [
    [0.25, 500, "S+C"],
    [0.27, 720, "L"],
    [0.45, 720, "L+C"],
    [0.7, 720, "S+C"],
    [0.7, 900, "L+S"],
  ],
  c3: [
    [0.2, 600, "S+C"],
    [0.5, 600, "C"],
    [0.8, 600, "S+C"],
    [0.3, 900, "L+C"],
    [0.5, 900, "C"],
  ],
  c4: [
    [0.5, 350, "S+S"],
    [0.25, 500, "S+C"],
    [0.75, 650, "S+C"],
    [0.3, 1000, "L"],
  ],
  c5: [
    [0.25, 350, "S+C"],
    [0.5, 520, "S+S"],
    [0.31, 650, "L"],
  ],
  c6: [
    [0.25, 500, "S+C"],
    [0.25, 1000, "L+C"],
    [0.75, 1300, "L+C"],
    [0.98, 1300, "L"],
  ],
  c7: [
    [0.25, 500, "S+C"],
    [0.75, 500, "S+C"],
    [0.5, 750, "S"],
    [0.25, 1000, "L"],
  ],
  c8: [
    [0.3, 600, "S+C"],
    [0.3, 1200, "L+C"],
    [0.85, 1200, "S+C"],
    [0.3, 1500, "L+S"],
    [0.56, 1600, "S"],
    [0.65, 1600, "S+C"],
    [0.8, 1750, "S"],
    [0.5, 1950, "L"],
  ],
  c9: [
    [0.5, 780, "S+C"],
    [0.95, 780, "S+C"],
    [0.2, 870, "S"],
    [0.5, 870, "S+S"],
    [0.7, 895, "S"],
    [0.3, 1000, "L+S"],
    [0.8, 1000, "S"],
    [0.3, 1250, "L+S"],
  ],
};

describe("regionRaster", () => {
  const rasters = new Map(
    PRESETS.map((p) => [p.id, regionRaster(rowHulls(p.params, p.window, ROWS), COLS)] as const),
  );

  it.each(PRESETS.map((p) => p.id))("has the right field at sample points of (%s)", (id) => {
    const kinds = rasters.get(id)!;
    for (const [X, T, kind] of SAMPLES[id]) {
      expect(kindAt(kinds, id, X, T), `${id} at X_B = ${X}, ${T} K`).toBe(kind);
    }
  });

  it.each(PRESETS.map((p) => p.id))(
    "gives every pixel of (%s) the field of the hull at its centre",
    (id) => {
      const { params, window } = preset(id);
      const kinds = rasters.get(id)!;
      for (let r = 0; r < ROWS; r += 7) {
        const { fields } = sliceHull(params, rowT(r, ROWS, window));
        for (let c = 0; c < COLS; c++) {
          const X = (c + 0.5) / COLS;
          const f = fields.find((g) => X <= (g.kind === "single" ? g.X[1] : g.ends[1].X))!;
          expect(REGION_KINDS[kinds[r * COLS + c]!]).toBe(fieldKind(f));
        }
      }
    },
  );

  it("shares one computation of the row hulls per diagram and row count", () => {
    const { params, window } = preset("h");
    const diagram = computeDiagram(params, window);
    const hulls = rowHullsOf(diagram, ROWS);
    expect(rowHullsOf(diagram, ROWS)).toBe(hulls);
    expect(rowHullsOf(computeDiagram(params, window), ROWS)).not.toBe(hulls);
    expect(rowHullsOf(diagram, ROWS + 1)).not.toBe(hulls);
    const rasters = new RasterCache();
    const kinds = rasters.get(hulls, COLS);
    expect(rasters.get(hulls, COLS)).toBe(kinds);
    expect(kinds).toEqual(regionRaster(rowHulls(params, window, ROWS), COLS));
  });

  it("names each kind of field by its phases", () => {
    const h = sliceHull(preset("e").params, 1150);
    expect(h.fields.map(fieldKind)).toEqual(["L", "L+L", "L", "L+S", "S"]);
    // c1 at 1000 K: L + AB on both sides of AB, then L + β.
    const c1 = sliceHull(preset("c1").params, 1000);
    expect(c1.fields.map(fieldKind)).toEqual(["L", "L+C", "C", "L+C", "L", "L+S", "S"]);
    const c3 = sliceHull(preset("c3").params, 600);
    expect(c3.fields.map(fieldKind)).toEqual(["S", "S+C", "C", "S+C", "S"]);
  });

  it("runs from the window's top row to its bottom", () => {
    const window = { Tmin: 300, Tmax: 1500 };
    expect(rowT(0, 100, window)).toBeCloseTo(1494, 9);
    expect(rowT(99, 100, window)).toBeCloseTo(306, 9);
  });
});

describe("the region colours", () => {
  // The tokens' part of style.css, and every other part for the scheme check.
  const styles = new URL("../src/styles/", import.meta.url);
  const css = readFileSync(new URL("tokens.css", styles), "utf8");
  const all = readdirSync(styles)
    .map((name) => readFileSync(new URL(name, styles), "utf8"))
    .join("\n");
  /** The custom properties set in the block that starts at `selector`. */
  const block = (selector: string) => {
    const start = css.indexOf(selector);
    const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
    return Object.fromEntries(
      [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]]),
    );
  };

  it("are light until the theme button chooses dark, with no block for the system's scheme", () => {
    expect(all).not.toContain("prefers-color-scheme");
    expect(block(':root[data-theme="dark"]')["--bg"]).toBeDefined();
  });

  it("give the compound pTerrain's apricot, and its curve the darker shade in the light theme", () => {
    const light = block(":root {");
    const dark = block(':root[data-theme="dark"]');
    expect(light["--phase-compound"]).toBe("#f2a07b");
    expect(light["--curve-compound"]).toBe("#ca7c59");
    expect(dark["--curve-compound"]).toBe("#f2a07b");
  });

  it("define a second shade of each phase for the gap checkerboards, in both themes", () => {
    const light = block(":root {");
    const dark = block(':root[data-theme="dark"]');
    const lum = (hex: string) => parseHex(hex).reduce((s, v) => s + v, 0);
    for (const phase of ["solid", "liquid", "compound"]) {
      const base = light[`--phase-${phase}`]!;
      // Lighter in the light theme, darker in the dark one (plan §4.1).
      expect(lum(light[`--phase-${phase}-alt`]!)).toBeGreaterThan(lum(base));
      expect(lum(dark[`--phase-${phase}-alt`]!)).toBeLessThan(lum(base));
    }
  });

  it("pair the d2r2 purple with a lighter tint here and a darker shade in the dark theme", () => {
    const light = block(":root {");
    const dark = block(':root[data-theme="dark"]');
    const lum = (hex: string) => parseHex(hex).reduce((s, v) => s + v, 0);
    expect(light["--phase-purple"]).toBe("var(--d2r2)");
    expect(lum(light["--phase-purple-alt"]!)).toBeGreaterThan(lum(light["--d2r2"]!));
    expect(lum(dark["--phase-purple-alt"]!)).toBeLessThan(lum(dark["--d2r2"]!));
  });
});

describe("checkerColour", () => {
  it("alternates 8 px squares from the origin", () => {
    expect([0, 7.9, 8, 16].map((x) => checkerColour(x, 0, false))).toEqual([0, 0, 1, 0]);
    expect(checkerColour(0, 8, false)).toBe(1);
    expect(checkerColour(8, 8, false)).toBe(0);
  });

  it("turns them 45° into diamonds for L + γ", () => {
    // Along the diagonal x = y the cells change every 8 px of distance, 8 / √2 px in x.
    const along = [1, 5, 6, 11].map((t) => checkerColour(t, t, true));
    expect(along).toEqual([0, 0, 1, 1]);
    // Across the row y = 4, one diamond spans |x| < 4 and the next begins past it.
    expect([-3, 0, 3, 6].map((x) => checkerColour(x, 4, true))).toEqual([0, 0, 0, 1]);
  });
});

describe("parseHex", () => {
  it("reads #rrggbb in either case", () => {
    expect(parseHex(" #0aFf10 ")).toEqual([10, 255, 16]);
  });

  it("falls back to grey with a warning, rather than throwing in a store listener", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseHex("rgb(1, 2, 3)")).toEqual([128, 128, 128]);
    expect(parseHex("")).toEqual([128, 128, 128]);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
