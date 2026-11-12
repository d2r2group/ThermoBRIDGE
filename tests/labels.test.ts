import { describe, expect, it } from "vitest";
import { fields as naming } from "../src/physics/fields";
import { sliceHull } from "../src/physics/hull";
import { TAt, type PlotSize } from "../src/ui/geometry";
import { rowHulls } from "../src/ui/regions";
import {
  fieldLabels,
  LABEL_CELL,
  labelCandidates,
  MIN_CLEARANCE,
  placeLabels,
  type FieldLabel,
} from "../src/ui/fieldLabels";
import { formatX } from "../src/ui/format";
import {
  KNOB_CLEARANCE,
  placeInvariantT,
  polylineMeetsBox,
  spreadApart,
} from "../src/ui/textLayout";
import { scanOf, SYSTEMS, type TestSystem } from "./sliceFixtures";

describe("formatX", () => {
  it("gives three decimals away from the pure ends", () => {
    expect(formatX(0.0871)).toBe("0.087");
    expect(formatX(0.5)).toBe("0.500");
    expect(formatX(0.9129)).toBe("0.913");
    expect(formatX(0.001)).toBe("0.001");
    expect(formatX(0.999)).toBe("0.999");
  });

  it("gives a power of ten within 0.001 of an end, so it never rounds to 0 or 1", () => {
    expect(formatX(4.12e-5)).toBe("4.1·10⁻⁵");
    expect(formatX(9.96e-4)).toBe("1.0·10⁻³");
    expect(formatX(1 - 4.12e-5)).toBe("1 − 4.1·10⁻⁵");
    expect(formatX(0.9996)).toBe("1 − 4.0·10⁻⁴");
  });

  it("reports solubilities below the grid's reach as < 10⁻⁹ (plan §2.2)", () => {
    expect(formatX(3e-11)).toBe("< 10⁻⁹");
    expect(formatX(1 - 3e-11)).toBe("> 1 − 10⁻⁹");
    expect(formatX(2e-9)).toBe("2.0·10⁻⁹");
  });
});

describe("spreadApart", () => {
  it("leaves values that do not overlap where they are", () => {
    expect(spreadApart([10, 100, 60], [20, 20, 20], 4)).toEqual([10, 100, 60]);
  });

  it("pushes two values apart by the same amount each, so they no longer overlap", () => {
    const [a, b] = spreadApart([100, 110], [30, 30], 4) as [number, number];
    expect(a).toBeCloseTo(105 - 17, 9);
    expect(b).toBeCloseTo(105 + 17, 9);
  });

  it("keeps a chain of values apart, in their order, and inside the bounds", () => {
    const xs = [50, 52, 54, 300];
    const widths = [40, 30, 40, 40];
    const placed = spreadApart(xs, widths, 6, [0, 320]);
    for (let k = 1; k < xs.length; k++) {
      const gap = placed[k]! - placed[k - 1]! - 0.5 * (widths[k]! + widths[k - 1]!);
      expect(gap).toBeGreaterThanOrEqual(6 - 1e-9);
    }
    expect(placed[0]! - 20).toBeGreaterThanOrEqual(0);
    expect(placed[3]! + 20).toBeLessThanOrEqual(320);
  });
});

/** Lato Bold at 14 px is about 8 px a character; half of that is the label's half-width. */
const halfWidth = (name: string) => 4 * name.length;
/** The row hulls at the label raster's own rows, as the diagram's raster gives them at 1 px rows. */
const hullsOf = (sys: TestSystem, size: PlotSize) =>
  rowHulls(sys.params, sys.window, Math.round(size.height / LABEL_CELL));
const namingOf = (sys: TestSystem) => naming(sys.params, sys.window, scanOf(sys));
const labelsOf = (sys: TestSystem, size: PlotSize): FieldLabel[] =>
  fieldLabels(sys.window, namingOf(sys), size, hullsOf(sys, size), halfWidth);

/** The name of the field at plot-area (x, y), from the hull at that row's T. */
function nameAt(sys: TestSystem, size: PlotSize, x: number, y: number): string {
  const T = TAt(y, sys.window, size);
  const X = x / size.width;
  const hull = sliceHull(sys.params, T);
  const named = naming(sys.params, sys.window, scanOf(sys)).name(hull);
  const k = hull.fields.findIndex((f) =>
    f.kind === "single" ? X >= f.X[0] && X <= f.X[1] : X >= f.ends[0].X && X <= f.ends[1].X,
  );
  return named[k]!.name;
}

describe("fieldLabels", () => {
  const SIZES: PlotSize[] = [
    { width: 700, height: 350 },
    { width: 300, height: 160 },
  ];

  it.each(SYSTEMS.map((s) => [s.id, s] as const))(
    "%s: each label lies in its own field, at least 10 px from its edge",
    (_, sys) => {
      for (const size of SIZES) {
        for (const l of labelsOf(sys, size)) {
          expect(l.clearance).toBeGreaterThanOrEqual(Math.max(MIN_CLEARANCE, halfWidth(l.name)));
          expect(nameAt(sys, size, l.x, l.y)).toBe(l.name);
          for (let k = 0; k < 32; k++) {
            const a = (2 * Math.PI * k) / 32;
            const x = l.x + MIN_CLEARANCE * Math.cos(a);
            const y = l.y + MIN_CLEARANCE * Math.sin(a);
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(size.width);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThanOrEqual(size.height);
            expect(nameAt(sys, size, x, y), `${l.name} at ${k}`).toBe(l.name);
          }
        }
      }
    },
  );

  const byId = new Map(SYSTEMS.map((s) => [s.id, s]));
  const names = (id: string) => labelsOf(byId.get(id)!, SIZES[0]!).map((l) => l.name);

  it("labels a field type once per connected field: both L + S fields of a eutectic", () => {
    expect(names("(a)").sort()).toEqual(["L", "L + α", "L + β"]);
    // (l): a minimum, whose two L + S lobes have the same name.
    expect(names("(l)").filter((n) => n === "L + S")).toHaveLength(2);
  });

  it("uses the names of plan §4 item 1", () => {
    expect(names("(h)")).toEqual(expect.arrayContaining(["L", "L + β", "α", "β", "α + β"]));
    expect(names("(k)")).toEqual(expect.arrayContaining(["L₁ + L₂", "L + α", "α", "α₁ + α₂"]));
    expect(names("(n)").sort()).toEqual(["L", "S"]);
  });

  it("colours one-phase labels by phase and leaves two-phase ones to --fg", () => {
    for (const l of labelsOf(byId.get("(h)")!, SIZES[0]!)) {
      if (l.kind === "single") expect(l.phase).toBe(l.name === "L" ? "L" : "S");
      else expect(l.phase).toBeUndefined();
    }
  });

  it("gives no label to a field too small for its name", () => {
    const sys = byId.get("(h)")!;
    const wide = (name: string) => (name === "α" ? 1000 : halfWidth(name));
    const ls = fieldLabels(sys.window, namingOf(sys), SIZES[0]!, hullsOf(sys, SIZES[0]!), wide);
    expect(ls.map((l) => l.name)).not.toContain("α");
    expect(ls.map((l) => l.name)).toContain("β");
  });
});

describe("labelCandidates", () => {
  const size = { width: 700, height: 350 };
  const sys = SYSTEMS.find((s) => s.id === "(h)")!;

  it("hold everything but the names' widths, so a font swap places them again unchanged", () => {
    const candidates = labelCandidates(sys.window, namingOf(sys), size, hullsOf(sys, size));
    const wider = (name: string) => 6 * name.length;
    for (const w of [halfWidth, wider]) {
      expect(placeLabels(candidates, w)).toEqual(
        fieldLabels(sys.window, namingOf(sys), size, hullsOf(sys, size), w),
      );
    }
  });

  it("read the raster's finer row hulls, each label still in its own field", () => {
    // The diagram passes the bitmap's rows, two per CSS px at most (regions.ts MAX_DPR).
    const fine = rowHulls(sys.params, sys.window, 2 * size.height);
    const labels = fieldLabels(sys.window, namingOf(sys), size, fine, halfWidth);
    expect(labels.map((l) => l.name).sort()).toEqual(
      labelsOf(sys, size)
        .map((l) => l.name)
        .sort(),
    );
    for (const l of labels) expect(nameAt(sys, size, l.x, l.y)).toBe(l.name);
  });

  it("keep clear of the α mode's caption box, each label still in its own field", () => {
    const hulls = hullsOf(sys, size);
    const free = labelCandidates(sys.window, namingOf(sys), size, hulls);
    const liquid = free.find((c) => c.name === "L")!;
    // A box over the liquid's label, from the plot area's top-left corner.
    const keepOut = { width: liquid.x + 60, height: liquid.y + 20 };
    const kept = labelCandidates(sys.window, namingOf(sys), size, hulls, keepOut);
    const moved = kept.find((c) => c.name === "L")!;
    expect(moved.x >= keepOut.width || moved.y >= keepOut.height).toBe(true);
    expect(moved.cells).toBeLessThan(liquid.cells);
    for (const c of kept) {
      expect(c.x >= keepOut.width || c.y >= keepOut.height).toBe(true);
      expect(nameAt(sys, size, c.x, c.y)).toBe(c.name);
    }
  });
});

describe("placeInvariantT", () => {
  const size = { width: 600, height: 300 };

  it("puts the text above and to the left of the line's right end when nothing is in the way", () => {
    expect(placeInvariantT(400, 150, 30, size, [])).toEqual({ x: 397, y: 144, anchor: "end" });
  });

  it("moves below the line, then to its right, when a boundary crosses the text", () => {
    // A boundary rising to the left from the right end, as the solidus above a peritectic.
    const rising: [number, number][][] = [
      [
        [400, 150],
        [380, 100],
      ],
    ];
    expect(placeInvariantT(400, 150, 30, size, rising)).toMatchObject({ y: 161, anchor: "end" });
    const both: [number, number][][] = [
      ...rising,
      [
        [400, 150],
        [380, 200],
      ],
    ];
    expect(placeInvariantT(400, 150, 30, size, both)).toMatchObject({ x: 403, anchor: "start" });
  });

  it("keeps clear of the cut's knob at the right edge", () => {
    const spot = placeInvariantT(600, 150, 30, size, []);
    expect(spot.anchor).toBe("end");
    expect(spot.x).toBeLessThanOrEqual(size.width - KNOB_CLEARANCE);
  });
});

describe("polylineMeetsBox", () => {
  const box: [number, number, number, number] = [0, 0, 10, 10];
  it("finds a segment that crosses, ends in or lies inside the box", () => {
    expect(
      polylineMeetsBox(
        [
          [-5, 5],
          [15, 5],
        ],
        box,
      ),
    ).toBe(true);
    expect(
      polylineMeetsBox(
        [
          [5, 5],
          [20, 20],
        ],
        box,
      ),
    ).toBe(true);
    expect(
      polylineMeetsBox(
        [
          [2, 2],
          [3, 3],
        ],
        box,
      ),
    ).toBe(true);
  });
  it("misses one that passes by", () => {
    expect(
      polylineMeetsBox(
        [
          [-5, 12],
          [15, 12],
        ],
        box,
      ),
    ).toBe(false);
    expect(
      polylineMeetsBox(
        [
          [11, -5],
          [20, 5],
        ],
        box,
      ),
    ).toBe(false);
  });
});
