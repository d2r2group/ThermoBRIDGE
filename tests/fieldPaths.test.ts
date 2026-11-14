import { describe, expect, it } from "vitest";
import { bands } from "../src/physics/boundaries";
import { fieldAreas } from "../src/physics/fieldAreas";
import { PRESETS } from "../src/physics/presets";
import { FIELD_TOLERANCE, fieldPaths, fieldRings, simplify, type Px } from "../src/ui/fieldPaths";
import { xOf, yOf } from "../src/ui/geometry";
import { phasesKind } from "../src/ui/regions";

// The figure export's field paths (plan §9 phase 21): shared edges, the simplification's
// tolerance, one path per kind, and their size.

const SIZE = { width: 720, height: 360 };

/** The distance from p to the polyline `line`. */
function toPolyline([x, y]: Px, line: readonly Px[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax, ay] = line[i]!;
    const [bx, by] = line[i + 1]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return line.length === 1 ? Math.hypot(x - line[0]![0], y - line[0]![1]) : best;
}

describe("simplify", () => {
  it("keeps the ends and drops what lies within the tolerance", () => {
    const line: Px[] = [
      [0, 0],
      [1, 0.1],
      [2, -0.1],
      [3, 2],
      [4, 0],
    ];
    expect(simplify(line)).toEqual([
      [0, 0],
      [2, -0.1],
      [3, 2],
      [4, 0],
    ]);
    expect(simplify(line, 3)).toEqual([
      [0, 0],
      [4, 0],
    ]);
  });
});

describe.each(PRESETS.map((p) => [p.id, p] as const))(
  "%s at 720 × 360",
  (_, { params, window }) => {
    const areas = fieldAreas(bands(params, window));
    const rings = fieldRings(areas, window, SIZE);

    it("shares the vertices of each shared edge", () => {
      areas.forEach((a, k) => {
        areas.forEach((b, j) => {
          if (a.right === b.left) expect(rings[j]!.left).toBe(rings[k]!.right);
        });
      });
    });

    it("stays within 0.25 px of the boundary, and 0.33 px after rounding", () => {
      const round = ([x, y]: Px): Px => [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
      for (const area of areas) {
        for (const edge of [area.left, area.right]) {
          const px = edge.map((p): Px => [xOf(p.X, SIZE), yOf(p.T, window, SIZE)]);
          const simple = simplify(px);
          const rounded = simple.map(round);
          for (const p of px) {
            expect(toPolyline(p, simple)).toBeLessThanOrEqual(FIELD_TOLERANCE + 1e-9);
            expect(toPolyline(p, rounded)).toBeLessThanOrEqual(0.25 + Math.SQRT2 * 0.05 + 1e-9);
          }
        }
      }
    });

    it("writes one path per kind present, under 10 KB in all", () => {
      const paths = fieldPaths(areas, window, SIZE);
      const kinds = [...new Set(areas.map((a) => phasesKind(a.phases)))];
      expect(paths.map((p) => p.kind).sort()).toEqual(kinds.sort());
      for (const { d } of paths) expect(d).toMatch(/^(M[-\d.]+,[-\d.]+L[-\d., ]+Z)+$/);
      expect(paths.reduce((n, p) => n + p.d.length, 0)).toBeLessThan(10_000);
    });
  },
);
