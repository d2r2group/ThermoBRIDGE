// The timings that the unit tests no longer assert (plan §12, CR1), run with `npm run bench`.
// No CI step runs them: a shared runner's times say little. On an Apple M5 in November 2026, after
// CR2, `computeDiagram` of P1 took about 49 ms and an auto-window Apply about 57 ms (before CR2:
// 70 and 132 ms); plan §3 asks for under 100 ms on a slow laptop.

import { test } from "vitest";
import { compoundPreset, preset } from "../src/physics/presets";
import { validate } from "../src/physics/validity";
import { autoWindow } from "../src/physics/autoWindow";
import { computeDiagram } from "../src/ui/state";
import { prepareSystem } from "../src/ui/systemFields";

// P1 has the widest window (2200 K), so it is among the slowest presets.
const { params, window } = preset("p1");
// `fitWindow` keeps its last result, so the auto-window Apply alternates between P1 and a copy
// with α_s a hair higher, which fits the same window, to fit it anew each time as Apply would.
const variants = [params, { ...params, alphaS: params.alphaS + 1e-9 }];
let k = 0;

test("Apply of P1", async ({ bench }) => {
  await bench.compare(
    // The store's full calculation: the scan, the boundaries, the names, the metastable
    // extensions and the spinodals.
    bench("computeDiagram", () => {
      computeDiagram(params, window);
    }),
    // What Apply with *auto* ticked runs: the window rule, whose scan the checks and the
    // calculation take over.
    bench("auto-window Apply", () => {
      const p = variants[k++ % 2]!;
      const prepared = prepareSystem(p, window, true);
      if (!prepared.ok) throw new Error("P1 is valid");
      computeDiagram(p, prepared.window, prepared.scan);
    }),
  );
});

test("computeDiagram with a compound", async ({ bench }) => {
  // c3 has the third curve (plan §9 phase 12); c6 the tallest window of the compound presets.
  const c3 = compoundPreset("c3");
  const c6 = compoundPreset("c6");
  await bench.compare(
    bench("P1, no compound", () => {
      computeDiagram(params, window);
    }),
    bench("c3, compound with a range", () => {
      computeDiagram(c3.params, c3.window);
    }),
    bench("c6, line compound, 1600 K window", () => {
      computeDiagram(c6.params, c6.window);
    }),
  );
});

test("a melting point far above the 5000 K cap is rejected before any scan", async ({ bench }) => {
  const hot = { ...params, TmB: 1e6 };
  await bench("autoWindow and validate, T_m,B = 10⁶ K", () => {
    validate(hot, autoWindow(hot));
  }).run();
});
