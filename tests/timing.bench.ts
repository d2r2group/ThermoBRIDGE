// The timings that the unit tests no longer assert (plan §12, CR1) and the α mode's (§9 phase 15),
// run with `npm run bench`.
// No CI step runs them: a shared runner's times say little. On an Apple M5 in November 2026, after
// CR2, `computeDiagram` of P1 took about 49 ms and an auto-window Apply about 57 ms (before CR2:
// 70 and 132 ms); plan §3 asks for under 100 ms on a slow laptop.

import { test } from "vitest";
import { COARSE_STEP } from "../src/physics/events";
import type { Params } from "../src/physics/gibbs";
import { compoundPreset, preset } from "../src/physics/presets";
import { validate } from "../src/physics/validity";
import { autoWindow } from "../src/physics/autoWindow";
import { computeDiagram } from "../src/ui/state";
import { prepareSystem } from "../src/ui/systemFields";
import { AlphaCache, computeAlpha } from "../src/ui/alphaCache";
import {
  ALPHA_COMPOUND,
  alphaSystem,
  alphaWindow,
  DHF_MAX,
  DHF_MIN,
  DHF_STEP,
  DSF_MAX,
  DSF_MIN,
  DSF_STEP,
  XC_STOPS,
  type AlphaPoint,
} from "../src/ui/alphaPoint";

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

// The α mode (plan §9 phase 15). On an Apple M5 in November 2026 the probe gave a median of 19 ms,
// a p95 of 34 ms and a maximum of 67 ms per full diagram, with the nine systems where
// T_m,B = T_m,A rejected; (h)'s full diagram took 24 ms, its preview 11 ms and a cache hit well
// under a microsecond.

/** A seeded generator (mulberry32), so that the probe draws the same systems each run. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("the α mode's probe: computeDiagram over 418 systems", () => {
  const rnd = random(7355);
  const span = (lo: number, hi: number) => lo + (hi - lo) * rnd();
  const systems: Params[] = Array.from(
    { length: 400 },
    () =>
      alphaSystem({
        alphaS: span(-30, 30),
        alphaL: span(-30, 30),
        TmB: span(805, 2400),
        compound: null,
      }).params,
  );
  for (const alphaL of [-30, 0, 30])
    for (const alphaS of [-30, 0, 30])
      for (const TmB of [805, 2400])
        systems.push(alphaSystem({ alphaS, alphaL, TmB, compound: null }).params);
  const times: number[] = [];
  let failed = 0;
  for (const p of systems) {
    const t0 = performance.now();
    try {
      computeDiagram(p, alphaWindow(p.TmB));
      times.push(performance.now() - t0);
    } catch {
      failed++;
    }
  }
  times.sort((a, b) => a - b);
  const at = (q: number) => times[Math.floor(q * (times.length - 1))]!.toFixed(1);
  console.log(
    `computeDiagram over ${times.length} systems (${failed} rejected): median ${at(0.5)} ms,` +
      ` p95 ${at(0.95)} ms, max ${at(1)} ms`,
  );
});

test("the α mode's preview, full diagram and cache", async ({ bench }) => {
  const { params } = alphaSystem({ alphaS: 15, alphaL: 0, TmB: 1200, compound: null });
  const cache = new AlphaCache();
  const point = { alphaS: 15, alphaL: 0, TmB: 1200, compound: null };
  cache.get(point, false);
  let k = 0;
  await bench.compare(
    bench("full diagram, 1 K steps", () => {
      computeDiagram(params, alphaWindow(params.TmB));
    }),
    bench("preview, 4 K steps", () => {
      computeDiagram(params, alphaWindow(params.TmB), undefined, undefined, COARSE_STEP);
    }),
    bench("cache hit", () => {
      cache.get(point, false);
    }),
    // A miss: each run a position not yet cached, previews so that the run stays short.
    bench("cache miss (preview)", () => {
      cache.get({ alphaS: -30 + (k++ % 120) * 0.5, alphaL: 5, TmB: 1200, compound: null }, true);
    }),
  );
});

// The α mode with a line compound (plan §9 phase 19, step 1), on the steps of the six values.

/** A value of [lo, hi] on `step`, at random. */
const onSteps = (rnd: () => number, lo: number, hi: number, step: number) =>
  lo + step * Math.floor(rnd() * (Math.round((hi - lo) / step) + 1));

test("the α mode's probe with a compound: 400 systems on the steps", () => {
  const rnd = random(7355);
  const points: AlphaPoint[] = Array.from({ length: 400 }, () => ({
    alphaS: onSteps(rnd, -30, 30, 0.5),
    alphaL: onSteps(rnd, -30, 30, 0.5),
    TmB: onSteps(rnd, 805, 2400, 5),
    compound: {
      Xc: XC_STOPS[Math.floor(rnd() * XC_STOPS.length)]!,
      dhf: onSteps(rnd, DHF_MIN, DHF_MAX, DHF_STEP),
      dsf: onSteps(rnd, DSF_MIN, DSF_MAX, DSF_STEP),
    },
  }));
  const report = (preview: boolean) => {
    const times: number[] = [];
    const failed: AlphaPoint[] = [];
    for (const p of points) {
      const t0 = performance.now();
      const d = computeAlpha(p, preview);
      if (d) times.push(performance.now() - t0);
      else failed.push(p);
    }
    times.sort((a, b) => a - b);
    const at = (q: number) => times[Math.floor(q * (times.length - 1))]!.toFixed(1);
    console.log(
      `${preview ? "preview" : "full diagram"} over ${points.length} systems with a compound` +
        ` (${failed.length} could not be computed): median ${at(0.5)} ms, p95 ${at(0.95)} ms,` +
        ` max ${at(1)} ms`,
    );
    return failed;
  };
  const full = report(false);
  const preview = report(true);
  const key = (p: AlphaPoint) => JSON.stringify(p);
  const previewKeys = new Set(preview.map(key));
  console.log(
    `failed in both: ${full.filter((p) => previewKeys.has(key(p))).length},` +
      ` full only: ${full.filter((p) => !previewKeys.has(key(p))).length},` +
      ` preview only: ${preview.filter((p) => !full.some((q) => key(q) === key(p))).length}`,
  );
  for (const p of full) console.log("  full failed:", key(p));
});

test("the α mode's diagrams of (h) with c1's compound", async ({ bench }) => {
  const point: AlphaPoint = { alphaS: 15, alphaL: 0, TmB: 1200, compound: ALPHA_COMPOUND };
  const { params, window } = alphaSystem(point);
  const bare = alphaSystem({ ...point, compound: null });
  await bench.compare(
    bench("full diagram, no compound", () => {
      computeDiagram(bare.params, bare.window);
    }),
    bench("full diagram, c1's compound", () => {
      computeDiagram(params, window);
    }),
    bench("preview, no compound", () => {
      computeDiagram(bare.params, bare.window, undefined, undefined, COARSE_STEP);
    }),
    bench("preview, c1's compound", () => {
      computeDiagram(params, window, undefined, undefined, COARSE_STEP);
    }),
  );
});
