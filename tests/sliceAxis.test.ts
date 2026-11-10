// The slice panel's g axis (plan §4 item 2), on its own so that its sweeps run beside the other
// slice tests.

import { describe, expect, it } from "vitest";
import { gDomain, MIN_DEPTH, slice, sliceXs } from "../src/physics/slice";
import { envelopeOver, fieldsOf, scanOf, sliceOf, SYSTEMS, WIDE, XS } from "./sliceFixtures";

describe("the g axis", () => {
  it("follows the rule of §4 item 2", () => {
    expect(gDomain(-7.5)).toEqual([-7.5 - 0.75, 3.75]);
    // A shallow envelope keeps the least depth.
    expect(gDomain(-0.05)).toEqual([-0.05 - 0.1 * MIN_DEPTH, 0.5 * MIN_DEPTH]);
    expect(gDomain(0)).toEqual([-0.1 * MIN_DEPTH, 0.5 * MIN_DEPTH]);
  });

  it.each(SYSTEMS.map((s) => [s.id, s] as const))(
    "%s: holds the stable envelope at every T and changes continuously with T",
    (_, sys) => {
      const fine = sliceXs(2 * WIDE);
      const { Tmin, Tmax } = sys.window;
      let prev: [number, number] | null = null;
      for (let T = Tmin; T <= Tmax; T += 1) {
        const fields = fieldsOf(sys, T);
        const s = slice(sys.params, T, fields, XS);
        const [lo, hi] = gDomain(s.min);
        // The envelope on a grid twice as fine as the panel's never leaves the axis.
        const env = envelopeOver(sys.params, T, fields, fine);
        const envMin = Math.min(...env);
        const envMax = Math.max(...env);
        expect(lo).toBeLessThan(envMin);
        expect(hi).toBeGreaterThan(envMax);
        // The panel's m is the envelope's lowest point to within a hair of the axis's depth.
        expect(s.min - envMin).toBeLessThan(1e-3 * Math.max(-envMin, MIN_DEPTH));
        if (prev) {
          expect(Math.abs(lo - prev[0])).toBeLessThan(0.02);
          expect(Math.abs(hi - prev[1])).toBeLessThan(0.02);
        }
        prev = [lo, hi];
      }
    },
  );

  it.each(SYSTEMS.map((s) => [s.id, s] as const))("%s: does not jump across an event", (_, sys) => {
    for (const e of scanOf(sys).events) {
      const domains = [-2e-3, -5e-4, 0, 5e-4, 2e-3]
        .map((dT) => e.T + dT)
        .filter((T) => T >= sys.window.Tmin && T <= sys.window.Tmax)
        .map((T) => gDomain(sliceOf(sys, T).s.min));
      for (let k = 1; k < domains.length; k++) {
        expect(Math.abs(domains[k]![0] - domains[k - 1]![0])).toBeLessThan(1e-3);
      }
    }
  });
});
