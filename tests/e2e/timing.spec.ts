// What a redraw costs in the browser (plan §9 phase 15), over the 100 systems of `dragPath`, each
// timed from the call to the painted frame, at 1× and 2× device pixels and with and without
// Chrome's 4× CPU throttle: the store recomputing each system as Apply does, and the α mode's
// path (alphaDrag.ts) with a fresh cache, the Web Worker and the slice panel hidden: the preview at
// each position, and at every fifth, where the knob stops, the time to the full diagram. Then the
// same with the real pad (phase 17): the mouse drags the knob round the circle, and each drawn
// diagram is timed from the pointer move it follows. Each runs without a compound and with c1's line
// compound (phase 19), which the pad keeps from the c1 preset the page opens at. Run by hand, not
// in CI:
//
//   npm run build && TIMING=1 npx playwright test timing --workers=1
//
// It prints the median, p95 and maximum per configuration.

import type { Page } from "@playwright/test";
import type { Params } from "../../src/physics/gibbs";
import type { createAlphaDrag } from "../../src/ui/alphaDrag";
import type { computeDiagram, Store } from "../../src/ui/state";
import { ALPHA_COMPOUND } from "../../src/ui/alphaPoint";
import { dragPath } from "../dragPath";
import { test } from "./fixtures";

test.skip(!process.env.TIMING, "run by hand with TIMING=1");
test.setTimeout(600_000);

interface Times {
  /** `computeDiagram` alone, ms. */
  compute: number[];
  /** The store's `setSystem`, recomputing, to the painted frame, ms. */
  recompute: number[];
  /** The α mode's preview of a new position to the painted frame, ms. */
  preview: number[];
  /** From a move where the knob then stops to its full diagram's painted frame, ms. */
  stop: number[];
  failed: number;
}

/** What main.ts puts on the page at `?timing`. */
interface Hook {
  thermobridge: {
    store: Store;
    computeDiagram: typeof computeDiagram;
    createAlphaDrag: typeof createAlphaDrag;
  };
}

async function timeDrag(page: Page, path: Params[]): Promise<Times> {
  return page.evaluate(async (path) => {
    const { store, computeDiagram, createAlphaDrag } = (globalThis as unknown as Hook).thermobridge;
    // The α mode's window at the path's T_m,B of 1200 K (alphaPoint.ts `alphaWindow`).
    const window = { Tmin: 100, Tmax: 1900 };
    const painted = () =>
      new Promise<void>((done) => requestAnimationFrame(() => setTimeout(done, 0)));
    const out = { compute: [], recompute: [], preview: [], stop: [], failed: 0 } as Times;
    /** The time from `run` to the painted frame after it, ms. */
    const timed = async (run: () => void, into: number[]) => {
      const t0 = performance.now();
      run();
      await painted();
      into.push(performance.now() - t0);
    };
    await painted();
    for (const params of path) {
      const t0 = performance.now();
      try {
        computeDiagram(params, window);
        out.compute.push(performance.now() - t0);
      } catch {
        out.failed++;
      }
    }
    for (const params of path) {
      try {
        await timed(() => store.setSystem({ params, window }, { name: "Custom" }), out.recompute);
      } catch {
        /* counted above */
      }
    }
    // The α mode hides the slice panel (§9 phase 16), which then draws nothing.
    document.querySelector<HTMLElement>(".slice-panel")!.style.display = "none";
    await painted();
    const drag = createAlphaDrag(store);
    const isFull = (p: Params) => {
      const { diagram, params } = store.state;
      return diagram.scan.step === 1 && params.alphaS === p.alphaS && params.alphaL === p.alphaL;
    };
    for (const [i, p] of path.entries()) {
      const point = {
        alphaS: p.alphaS,
        alphaL: p.alphaL,
        TmB: p.TmB,
        compound: p.compound ?? null,
      };
      if (i % 5 !== 0) {
        await timed(() => drag.move(point), out.preview);
        continue;
      }
      const t0 = performance.now();
      drag.move(point);
      while (!isFull(p)) {
        await painted();
        if (performance.now() - t0 > 10_000) throw new Error("no full diagram");
      }
      await painted();
      out.stop.push(performance.now() - t0);
    }
    return out;
  }, path);
}

/**
 * Drags the knob with the mouse through `path`, resting at every fifth position until its full
 * diagram is painted. Each diagram drawn while moving is timed from the latest pointer move to its
 * painted frame, and each rest from the move to the full diagram's painted frame.
 */
async function timePad(page: Page, path: Params[]): Promise<{ preview: number[]; stop: number[] }> {
  const box = (await page.locator(".alpha-pad svg").boundingBox())!;
  const at = (p: Params) => ({
    x: box.x + ((p.alphaS + 30) / 60) * box.width,
    y: box.y + ((30 - p.alphaL) / 60) * box.height,
  });
  await page.evaluate(() => {
    const { store } = (globalThis as unknown as Hook).thermobridge;
    const log = { lastMove: 0, drawn: [] as { ms: number; full: boolean }[] };
    Object.assign(globalThis, { padLog: log });
    document
      .querySelector(".alpha-pad svg")!
      .addEventListener("pointermove", (e) => (log.lastMove = e.timeStamp));
    store.subscribe((state, prev) => {
      if (state.diagram === prev.diagram) return;
      const from = log.lastMove;
      const full = state.diagram.scan.step === 1;
      requestAnimationFrame(() =>
        setTimeout(() => log.drawn.push({ ms: performance.now() - from, full }), 0),
      );
    });
  });
  const first = at(path[0]!);
  const knob = (await page.locator(".alpha-knob-face").boundingBox())!;
  await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x, first.y, { steps: 4 });
  const out = { preview: [] as number[], stop: [] as number[] };
  type Log = { drawn: { ms: number; full: boolean }[] };
  const take = () =>
    page.evaluate(() => {
      const log = (globalThis as unknown as { padLog: Log }).padLog;
      return log.drawn.splice(0);
    });
  await take();
  for (const [i, p] of path.entries()) {
    const { x, y } = at(p);
    await page.mouse.move(x, y);
    if (i % 5 !== 0) continue;
    // Rest until the full diagram is painted.
    const t0 = Date.now();
    let drawn: { ms: number; full: boolean }[] = [];
    while (!drawn.some((d) => d.full)) {
      drawn = drawn.concat(await take());
      if (Date.now() - t0 > 10_000) throw new Error("no full diagram");
      await page.waitForTimeout(20);
    }
    for (const d of drawn) (d.full ? out.stop : out.preview).push(d.ms);
  }
  await page.mouse.up();
  return out;
}

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
  return `${at(0.5).toFixed(0)} / ${at(0.95).toFixed(0)} / ${s[s.length - 1]!.toFixed(0)}`;
};

for (const [what, compound, fragment] of [
  ["no compound", null, ""],
  ["c1's compound", ALPHA_COMPOUND, "#c1"],
] as const) {
  for (const dpr of [1, 2]) {
    test.describe(`${what}, ${dpr}× device pixels`, () => {
      test.use({ deviceScaleFactor: dpr });
      for (const throttle of [1, 4]) {
        test(`CPU ${throttle}×`, async ({ page }) => {
          await page.goto(`./?timing${fragment}`);
          await page.locator(".phase-diagram svg").waitFor();
          if (throttle > 1) {
            const cdp = await page.context().newCDPSession(page);
            await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
          }
          const t = await timeDrag(page, dragPath(100, 1200, compound));
          console.log(
            `${what}, DPR ${dpr}, CPU ${throttle}×, median / p95 / max ms (${t.failed} failed):` +
              ` compute ${stats(t.compute)}, recompute ${stats(t.recompute)},` +
              ` preview ${stats(t.preview)}, stop to full ${stats(t.stop)}`,
          );
        });

        test(`CPU ${throttle}×, the pad`, async ({ page }) => {
          await page.goto(`./?timing${fragment}`);
          await page.getByRole("radio", { name: "Alpha" }).check();
          if (throttle > 1) {
            const cdp = await page.context().newCDPSession(page);
            await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
          }
          const t = await timePad(page, dragPath(100, 1200, compound));
          console.log(
            `${what}, DPR ${dpr}, CPU ${throttle}×, the pad, median / p95 / max ms:` +
              ` move to preview ${stats(t.preview)} (${t.preview.length} drawn of 100 moves),` +
              ` stop to full ${stats(t.stop)}`,
          );
        });
      }
    });
  }
}
