// One scan per Apply and per link import (plan §12, CR2): the window rule hands its scan on,
// `checkSystem` returns the scan it validated, and `computeDiagram` takes it.

import { beforeEach, describe, expect, it, vi } from "vitest";

// `scan`, counted. The other modules import it through this module, so every call is seen.
vi.mock("../src/physics/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/physics/events")>();
  return { ...actual, scan: vi.fn(actual.scan) };
});

import { fitWindow } from "../src/physics/autoWindow";
import { scan, subScan, type Scan } from "../src/physics/events";
import type { Params } from "../src/physics/gibbs";
import { PANELS, preset, PRESETS } from "../src/physics/presets";
import { checkSystem } from "../src/physics/validity";
import { computeDiagram, Store } from "../src/ui/state";
import { prepareSystem } from "../src/ui/systemFields";
import { parseLink, toLink } from "../src/ui/systemFile";

const scans = vi.mocked(scan);

beforeEach(() => {
  scans.mockClear();
});

/** What the Parameters panel's Apply does with the fields (systemPanel.ts `applyFields`). */
function apply(store: Store, params: Params, typed: { Tmin: number; Tmax: number }, auto: boolean) {
  const prepared = prepareSystem(params, typed, auto);
  if (!prepared.ok) throw new Error(prepared.issues.map((i) => i.message).join(" "));
  store.setSystem({ params, window: prepared.window }, { auto, scan: prepared.scan });
  return prepared;
}

/** The steps' temperatures and signatures and the events of a scan, for comparing two. */
const essence = (s: Scan) => ({
  steps: s.steps.map((st) => [st.T, st.sig]),
  events: s.events,
});

describe("Apply", () => {
  const store = new Store(preset("h"));

  it("scans once with a typed window", () => {
    scans.mockClear();
    apply(store, preset("p1").params, preset("p1").window, false);
    expect(scans).toHaveBeenCalledTimes(1);
  });

  it("scans once with auto ticked: the window rule's scan, cut to the window", () => {
    // Parameters the rule has not fitted yet in this file.
    const params = { ...preset("p2").params, alphaS: preset("p2").params.alphaS + 0.25 };
    scans.mockClear();
    const prepared = apply(store, params, { Tmin: 0, Tmax: 0 }, true);
    expect(scans).toHaveBeenCalledTimes(1);
    expect(store.state.window).toEqual(prepared.window);
    expect(store.state.diagram.scan.window).toEqual(prepared.window);
  });

  it("scans once to open a link with an automatic window, which parses and applies the system", () => {
    const params = { ...preset("e").params, alphaL: preset("e").params.alphaL + 0.5 };
    const spec = {
      name: "Linked",
      components: { A: "A", B: "B" },
      params,
      window: { Tmin: 0, Tmax: 0 },
      auto: true,
    };
    const link = toLink(spec, { cut: 900 });
    scans.mockClear();
    const parsed = parseLink(link);
    if (!parsed.ok) throw new Error(parsed.problem);
    const { system } = parsed.value;
    apply(store, system.params, system.window, system.auto);
    expect(scans).toHaveBeenCalledTimes(1);
  });

  it("rescans when the given scan is of another system", () => {
    const h = preset("h");
    const other = scan(preset("n").params, preset("n").window);
    scans.mockClear();
    expect(checkSystem(h.params, h.window, other).ok).toBe(true);
    const checked = checkSystem(h.params, h.window, null);
    expect(scans).toHaveBeenCalledTimes(2);
    if (!checked.ok) throw new Error("h is valid");
    scans.mockClear();
    const diagram = computeDiagram(h.params, h.window, checked.scan);
    expect(diagram.scan).toBe(checked.scan);
    computeDiagram(h.params, h.window, other);
    expect(scans).toHaveBeenCalledTimes(1);
  });
});

describe("the window rule's scan", () => {
  it.each([...PRESETS.map((p) => [p.id, p] as const), ...Object.entries(PANELS)])(
    "%s: is the scan of the fitted window, step for step and event for event, and valid",
    (_, sys) => {
      const fit = fitWindow(sys.params);
      expect(fit.scan).not.toBeNull();
      expect(essence(fit.scan!)).toEqual(essence(scan(sys.params, fit.window)));
      const checked = checkSystem(sys.params, fit.window, fit.scan);
      expect(checked).toMatchObject({ ok: true, scan: fit.scan });
      // Every event of the system lies inside the window, and its top is all liquid.
      expect(fit.scan!.steps.at(-1)!.sig).toBe("L");
    },
  );

  it("is not cut out for a window off its 1 K steps, or past its ends", () => {
    const { params } = preset("h");
    const wide = scan(params, { Tmin: 100, Tmax: 1400 });
    expect(subScan(wide, { Tmin: 450.5, Tmax: 1300 })).toBeNull();
    expect(subScan(wide, { Tmin: 500, Tmax: 1500 })).toBeNull();
    expect(subScan(wide, { Tmin: 50, Tmax: 1300 })).toBeNull();
    const cut = subScan(wide, { Tmin: 500, Tmax: 1300 });
    expect(essence(cut!)).toEqual(essence(scan(params, { Tmin: 500, Tmax: 1300 })));
  });

  it("is fitted once for the same parameters, even as a new object", () => {
    const params = { ...preset("m").params, alphaL: preset("m").params.alphaL + 0.125 };
    scans.mockClear();
    const first = fitWindow(params);
    expect(fitWindow({ ...params })).toBe(first);
    expect(scans.mock.calls.length).toBeGreaterThan(0);
    const count = scans.mock.calls.length;
    fitWindow({ ...params });
    expect(scans).toHaveBeenCalledTimes(count);
  });
});
