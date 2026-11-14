import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PRESETS } from "../src/physics/presets";
import { signed } from "../src/ui/format";
import { modelDetailsHtml, presetTable } from "../src/ui/modelDetails";

/** The values the table shows, by preset and key, read back from its HTML. */
function tableValues(html: string): Map<string, string> {
  const cells = html.matchAll(/data-preset="(\w+)" data-key="(\w+)">([^<]*)</g);
  return new Map([...cells].map(([, id, key, text]) => [`${id}.${key}`, text!]));
}

/** "+15", "−10" or "0" back to a number. */
const parseSigned = (text: string) => Number(text.replace("−", "-"));

describe("model details", () => {
  it("shows every preset in menu order with its T_m,B, α and compound as presets.ts has them", () => {
    const html = presetTable();
    const shown = tableValues(html);
    expect(shown.size).toBe(PRESETS.length * 7);
    for (const p of PRESETS) {
      expect(Number(shown.get(`${p.id}.TmB`)), p.id).toBe(p.params.TmB);
      expect(parseSigned(shown.get(`${p.id}.alphaL`)!), p.id).toBe(p.params.alphaL);
      expect(parseSigned(shown.get(`${p.id}.alphaS`)!), p.id).toBe(p.params.alphaS);
      const c = p.params.compound;
      const compound = ["dhf", "dsf", "alphaG"].map((key) => shown.get(`${p.id}.${key}`));
      if (!c) expect([shown.get(`${p.id}.Xc`), ...compound], p.id).toEqual(["—", "—", "—", "—"]);
      else {
        expect(Number(shown.get(`${p.id}.Xc`)), p.id).toBe(c.Xc);
        expect(
          compound.slice(0, 2).map((t) => parseSigned(t!)),
          p.id,
        ).toEqual([c.dhf, c.dsf]);
        expect(compound[2], p.id).toBe(c.width === "line" ? "line" : signed(c.alphaG));
      }
      // The inputs the text gives once for all presets.
      expect([p.params.TmA, p.params.dsA, p.params.dsB], p.id).toEqual([800, 10, 10]);
    }
    const rows = [...html.matchAll(/<th scope="row">([^<]*)<\/th>/g)].map(([, label]) => label);
    expect(rows).toEqual(PRESETS.map((p) => p.label));
  });

  it("holds the nine sections, with the table, and the development note", () => {
    const html = modelDetailsHtml();
    const headings = [...html.matchAll(/<h3>([^<]*)<\/h3>/g)].map(([, h]) => h);
    expect(headings).toEqual([
      "Gibbs energies",
      "Common tangents and the diagram",
      "An intermediate compound",
      "The slice panel",
      "The α mode",
      "Exporting",
      "Presets",
      "Limits",
      "Numerics",
    ]);
    expect(html).toContain(presetTable());
    expect(html).toMatch(/class="disclaimer">Claude Opus 5\.5/);
  });

  it("has every formula rendered, from its current TeX", () => {
    // Exits non-zero, and so throws, when src/assets/math.json is out of date.
    const script = fileURLToPath(new URL("../scripts/renderMath.mjs", import.meta.url));
    expect(() =>
      execFileSync(process.execPath, [script, "--check"], { stdio: "pipe" }),
    ).not.toThrow();
    expect(modelDetailsHtml()).toContain("<svg");
  });
});
