import { describe, expect, it } from "vitest";
import { R, type Params } from "../src/physics/gibbs";
import { PANELS, PRESETS } from "../src/physics/presets";
import { DEFAULT_COMPONENTS, type Components } from "../src/ui/state";
import type { SystemSpec } from "../src/ui/systemFile";
import { elementNames, toTdb } from "../src/ui/tdb";

// The TDB export (plan §9 phase 20): every preset and grid system written and its PARAMETER lines
// read back, the element names and their fallbacks, both kinds of compound, and the two
// composition sets.

const spec = (params: Params, components: Components = DEFAULT_COMPONENTS): SystemSpec => ({
  name: "Test",
  components,
  params,
  window: { Tmin: 300, Tmax: 1500 },
  auto: false,
});

/** Each PARAMETER's name with its expression as [c0, c1] of c0 + c1·T, J/mol. */
function parameters(tdb: string): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  for (const m of tdb.matchAll(/^PARAMETER (\S+) 1 (\S+); 10000 N !$/gm)) {
    const [, name, expr] = m as unknown as [string, string, string];
    const linear = /^(-?[\d.e+-]+?)([+-][\d.e+-]+)\*T$/.exec(expr);
    out.set(name, linear ? [Number(linear[1]), Number(linear[2])] : [Number(expr), 0]);
  }
  return out;
}

const close = (got: [number, number] | undefined, want: [number, number]) => {
  expect(got).toBeDefined();
  expect(got![0]).toBeCloseTo(want[0], 6);
  expect(got![1]).toBeCloseTo(want[1], 9);
};

const systems: [string, Params][] = [
  ...Object.entries(PANELS).map(([id, s]) => [id, s.params] as [string, Params]),
  ...PRESETS.map((p) => [p.id, p.params] as [string, Params]),
];

describe("toTdb", () => {
  it.each(systems)("writes %s's parameters", (_, params) => {
    const tdb = toTdb(spec(params), "#x");
    const p = parameters(tdb);
    close(p.get("G(LIQUID,A;0)"), [0, 0]);
    close(p.get("G(LIQUID,B;0)"), [0, 0]);
    close(p.get("G(SOLID,A;0)"), [-params.TmA * params.dsA, params.dsA]);
    close(p.get("G(SOLID,B;0)"), [-params.TmB * params.dsB, params.dsB]);
    close(p.get("L(LIQUID,A,B;0)"), [params.alphaL * 1000, 0]);
    close(p.get("L(SOLID,A,B;0)"), [params.alphaS * 1000, 0]);
    const c = params.compound;
    if (!c) {
      expect(tdb).not.toContain("GAMMA");
      expect(p.size).toBe(6);
      return;
    }
    // The compound at X_c: F(T) = Δh_f − T Δs_f below the line through the pure solids.
    const solidLine = (T: number) =>
      (1 - c.Xc) * params.dsA * (T - params.TmA) + c.Xc * params.dsB * (T - params.TmB);
    const F = (T: number) => c.dhf * 1000 - T * c.dsf;
    if (c.width === "line") {
      expect(tdb).toContain(
        `PHASE GAMMA % 2 ${String(Number((1 - c.Xc).toPrecision(15)))} ${c.Xc} !`,
      );
      expect(tdb).toContain("CONSTITUENT GAMMA :A:B: !");
      const [g0, g1] = p.get("G(GAMMA,A:B;0)")!;
      for (const T of [300, 1000]) expect(g0 + g1 * T).toBeCloseTo(solidLine(T) + F(T), 6);
    } else {
      expect(tdb).toContain("PHASE GAMMA % 1 1 !");
      expect(tdb).toContain("CONSTITUENT GAMMA :A,B: !");
      const [a0, a1] = p.get("G(GAMMA,A;0)")!;
      const [b0, b1] = p.get("G(GAMMA,B;0)")!;
      const [L] = p.get("L(GAMMA,A,B;0)")!;
      expect(L).toBeCloseTo(c.alphaG * 1000, 6);
      for (const T of [300, 1000]) {
        const x = c.Xc;
        const RT = R * 1000 * T;
        const g =
          (1 - x) * (a0 + a1 * T) +
          x * (b0 + b1 * T) +
          L * x * (1 - x) +
          RT * (x * Math.log(x) + (1 - x) * Math.log(1 - x));
        expect(g).toBeCloseTo(solidLine(T) + F(T), 4);
      }
    }
  });

  it("has two composition sets for LIQUID and SOLID, before the phases", () => {
    const tdb = toTdb(spec(PANELS.h.params), "#h");
    const liquid = tdb.indexOf("PHASE LIQUID %L 1 1 !");
    const solid = tdb.indexOf("PHASE SOLID %S 1 1 !");
    const setL = tdb.indexOf(
      "TYPE_DEFINITION L GES AMEND_PHASE_DESCRIPTION LIQUID COMPOSITION_SETS 2 !",
    );
    const setS = tdb.indexOf(
      "TYPE_DEFINITION S GES AMEND_PHASE_DESCRIPTION SOLID COMPOSITION_SETS 2 !",
    );
    expect(Math.min(liquid, solid, setL, setS)).toBeGreaterThan(0);
    expect(Math.max(setL, setS)).toBeLessThan(Math.min(liquid, solid));
  });

  it("names the app, the system, each element's component, the link and the date", () => {
    const system = { ...spec(PANELS.h.params, { A: "Cu", B: "Ni" }), name: "Copper–nickel" };
    const tdb = toTdb(system, "https://x/#1,a", new Date("2026-11-13T12:00:00Z"));
    const header = tdb.split("\n").filter((l) => l.startsWith("$"));
    expect(header.join("\n")).toContain("ThermoBRIDGE");
    expect(header).toContain("$ System: Copper–nickel");
    expect(header).toContain("$ Element CU is component A (Cu)");
    expect(header).toContain("$ Element NI is component B (Ni)");
    expect(header).toContain("$ Link: https://x/#1,a");
    expect(header.join("\n")).toContain("2026-11-13");
    expect(tdb).toContain("ELEMENT CU   BLANK 0 0 0 !");
    expect(tdb).toContain("CONSTITUENT LIQUID :CU,NI: !");
    expect(tdb).toContain("L(SOLID,CU,NI;0)");
    // A line break in a name stays inside its comment.
    const broken = toTdb({ ...system, name: "a\nPHASE X" }, "#");
    expect(broken).not.toMatch(/^PHASE X/m);
    // So does a `!`, which would end a command.
    const bang = toTdb({ ...system, name: "Wow!" }, "https://x/#1,Wow!,A,B");
    expect(bang).toContain("$ System: Wow%21");
    expect(bang).toContain("$ Link: https://x/#1,Wow%21,A,B");
  });

  it("writes a line compound with the element names", () => {
    const params = PRESETS.find((p) => p.params.compound?.width === "line")!.params;
    const tdb = toTdb(spec(params, { A: "Mg", B: "Zn" }), "#");
    expect(tdb).toContain("CONSTITUENT GAMMA :MG:ZN: !");
    expect(tdb).toContain("G(GAMMA,MG:ZN;0)");
  });
});

describe("elementNames", () => {
  it.each([
    [
      { A: "Cu", B: "Ni" },
      { A: "CU", B: "NI" },
    ],
    [
      { A: "A", B: "B" },
      { A: "A", B: "B" },
    ],
    [
      { A: "Aluminium", B: "Zinc" },
      { A: "AL", B: "ZI" },
    ],
    [
      { A: "Ä1", B: "b2" },
      { A: "A", B: "B" },
    ],
    // Empty, or no letters at all.
    [
      { A: "", B: "Ni" },
      { A: "A", B: "NI" },
    ],
    [
      { A: "Cu", B: "12" },
      { A: "CU", B: "B" },
    ],
    [
      { A: "α", B: "β" },
      { A: "A", B: "B" },
    ],
    // Clashing: B falls back; and if B's fallback is A's name, both do.
    [
      { A: "Co", B: "Cobalt" },
      { A: "CO", B: "B" },
    ],
    [
      { A: "B", B: "" },
      { A: "A", B: "B" },
    ],
    [
      { A: "B", B: "A" },
      { A: "B", B: "A" },
    ],
    // Reserved.
    [
      { A: "Va", B: "Ni" },
      { A: "A", B: "NI" },
    ],
    [
      { A: "Fe", B: "vacancy" },
      { A: "FE", B: "B" },
    ],
  ])("%o gives %o", (components, want) => {
    expect(elementNames(components)).toEqual(want);
  });
});
