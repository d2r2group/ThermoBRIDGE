// The slice panel's g axis (plan §4 item 2), on its own so that its sweeps run beside the other
// slice tests.

import { describe, expect, it } from "vitest";
import { SOLID } from "../src/physics/gibbs";
import { gDomain, MARGIN_SHARE, MAX_RISE, MIN_DEPTH, slice, sliceXs } from "../src/physics/slice";
import { envelopeOver, fieldsOf, scanOf, sliceOf, SYSTEMS, WIDE, XS } from "./sliceFixtures";

describe("the g axis", () => {
  it("follows the rule of §4 item 2", () => {
    expect(gDomain(-7.5)).toEqual([-7.5 - 0.75, 3.75]);
    // A shallow envelope keeps the least depth.
    expect(gDomain(-0.05)).toEqual([-0.05 - 0.1 * MIN_DEPTH, 0.5 * MIN_DEPTH]);
    expect(gDomain(0)).toEqual([-0.1 * MIN_DEPTH, 0.5 * MIN_DEPTH]);
    // A barrier lifts the top to b + p, at most 20 d, with the margin p = max(0.1 d, 0.06 (b − m)).
    expect(gDomain(-7.5, 5)).toEqual([-7.5 - 0.75, 5.75]);
    expect(gDomain(-7.5, 1)).toEqual([-7.5 - 0.75, 3.75]);
    const p = MARGIN_SHARE * 2;
    expect(gDomain(0, 2)).toEqual([-p, 2 + p]);
    // A capped barrier counts as the cap.
    const cap = MAX_RISE * MIN_DEPTH;
    expect(gDomain(0, 50)).toEqual([-MARGIN_SHARE * cap, cap]);
  });

  it("shows a low-temperature solid's whole curve, unless capped", () => {
    let shown = 0;
    for (const sys of SYSTEMS) {
      const { s, fields } = sliceOf(sys, sys.window.Tmin);
      // Only where the solid is stable at both ends, so that its chord is r.
      const ends = [fields[0]!, fields.at(-1)!];
      if (!ends.every((f) => f.kind === "single" && f.phase === SOLID)) continue;
      const [, hi] = gDomain(s.min, s.barrier);
      const top = Math.max(
        ...s.runs.filter((r) => r.phase === SOLID).flatMap((r) => r.points.map((p) => p.g)),
      );
      const d = Math.max(-s.min, MIN_DEPTH);
      // Under the cap the whole curve fits; at the cap the top is the cap.
      if (hi < MAX_RISE * d) {
        expect(top).toBeLessThan(hi);
        if (top > 0.5 * d) shown++;
      } else expect(hi).toBe(MAX_RISE * d);
    }
    // Some systems' barrier lifts the axis.
    expect(shown).toBeGreaterThan(0);
  });

  it.each(SYSTEMS.map((s) => [s.id, s] as const))(
    "%s: holds the stable envelope at every T and changes continuously with T",
    (_, sys) => {
      const fine = sliceXs(2 * WIDE);
      const { Tmin, Tmax } = sys.window;
      let prev: [number, number, number] | null = null;
      for (let T = Tmin; T <= Tmax; T += 1) {
        const fields = fieldsOf(sys, T);
        const s = slice(sys.params, T, fields, XS);
        const [lo, hi] = gDomain(s.min, s.barrier);
        // The envelope on a grid twice as fine as the panel's never leaves the axis.
        const env = envelopeOver(sys.params, T, fields, fine);
        const envMin = Math.min(...env);
        const envMax = Math.max(...env);
        expect(lo).toBeLessThan(envMin);
        expect(hi).toBeGreaterThan(envMax);
        // A visible gap below the envelope's lowest point, however high a barrier lifts the top.
        expect((envMin - lo) / (hi - lo)).toBeGreaterThan(0.05);
        // The panel's m is the envelope's lowest point to within a hair of the axis's depth.
        expect(s.min - envMin).toBeLessThan(1e-3 * Math.max(-envMin, MIN_DEPTH));
        if (prev) {
          // Under the cap, 20 d, the top moves 20 times as fast as d, and the bottom, with a
          // margin of 0.06 (20 d − m), about 2.3 times as fast as m.
          const dm = Math.abs(s.min - prev[2]);
          expect(Math.abs(lo - prev[0])).toBeLessThan(0.02 + 3 * dm);
          expect(Math.abs(hi - prev[1])).toBeLessThan(0.02 + MAX_RISE * dm);
        }
        prev = [lo, hi, s.min];
      }
    },
  );

  it.each(SYSTEMS.map((s) => [s.id, s] as const))("%s: does not jump across an event", (_, sys) => {
    for (const e of scanOf(sys).events) {
      const domains = [-2e-3, -5e-4, 0, 5e-4, 2e-3]
        .map((dT) => e.T + dT)
        .filter((T) => T >= sys.window.Tmin && T <= sys.window.Tmax)
        .map((T) => {
          const { s } = sliceOf(sys, T);
          return gDomain(s.min, s.barrier);
        });
      for (let k = 1; k < domains.length; k++) {
        expect(Math.abs(domains[k]![0] - domains[k - 1]![0])).toBeLessThan(1e-3);
      }
    }
  });
});
