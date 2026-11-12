// The α mode's speed (plan §9 phase 15): the coarse scan of the preview, the cache of diagrams,
// the queue of full diagrams for the Web Worker, and the path each move takes to the store.

import { describe, expect, it } from "vitest";
import { COARSE_STEP, scan } from "../src/physics/events";
import { PANELS } from "../src/physics/presets";
import { AlphaCache, computeAlpha, Lru } from "../src/ui/alphaCache";
import { alphaSystem, quantise, samePoint, type AlphaPoint } from "../src/ui/alphaPoint";
import { createAlphaDrag, SETTLE_MS, type Timeouts } from "../src/ui/alphaDrag";
import {
  createFullDiagrams,
  fromPosted,
  toPosted,
  type Channel,
  type Reply,
} from "../src/ui/fullDiagrams";
import { isPreview, labelsWait, Store } from "../src/ui/state";

/** A position that cannot be computed: T_m,B = T_m,A (phase 15's probe). */
const REJECTED: AlphaPoint = { alphaS: 0, alphaL: 0, TmB: 800, compound: null };
const H: AlphaPoint = { alphaS: 15, alphaL: 0, TmB: 1200, compound: null };
const O: AlphaPoint = { alphaS: 0, alphaL: 10, TmB: 1200, compound: null };

describe("the coarse scan", () => {
  it.each(Object.entries(PANELS))(
    "finds (%s)'s events within a 4 K step of the full scan's",
    (_, { params, window }) => {
      const full = scan(params, window).events;
      const coarse = scan(params, window, COARSE_STEP).events;
      expect(coarse.map((e) => e.kind)).toEqual(full.map((e) => e.kind));
      coarse.forEach((e, i) => expect(Math.abs(e.T - full[i]!.T)).toBeLessThan(COARSE_STEP));
    },
  );
});

describe("the α mode's systems", () => {
  it("rounds positions to the knob's 0.5 kJ/mol and the slider's 5 K", () => {
    expect(quantise({ alphaS: 14.8, alphaL: -0.2, TmB: 1203, compound: null })).toEqual({
      alphaS: 15,
      alphaL: 0,
      TmB: 1205,
      compound: null,
    });
    expect(
      Object.is(quantise({ alphaS: -0.1, alphaL: 0, TmB: 1200, compound: null }).alphaS, 0),
    ).toBe(true);
  });

  it("rounds a compound to X_c's stops and the 0.5 steps of Δh_f and Δs_f", () => {
    expect(quantise({ ...H, compound: { Xc: 0.3, dhf: -6.2, dsf: 1.3 } }).compound).toEqual({
      Xc: 1 / 3,
      dhf: -6,
      dsf: 1.5,
    });
    expect(
      Object.is(quantise({ ...H, compound: { Xc: 0.5, dhf: -0.1, dsf: 0 } }).compound!.dhf, 0),
    ).toBe(true);
  });

  it("compares positions with their compounds", () => {
    const c = { Xc: 0.5, dhf: -6, dsf: 0 };
    expect(samePoint({ ...H, compound: c }, { ...H, compound: { ...c } })).toBe(true);
    expect(samePoint(H, { ...H })).toBe(true);
    expect(samePoint(H, { ...H, compound: c })).toBe(false);
    expect(samePoint({ ...H, compound: c }, { ...H, compound: { ...c, Xc: 0.75 } })).toBe(false);
    expect(samePoint({ ...H, compound: c }, { ...H, compound: { ...c, dhf: -5.5 } })).toBe(false);
    expect(samePoint({ ...H, compound: c }, { ...H, compound: { ...c, dsf: 0.5 } })).toBe(false);
    expect(samePoint(H, { ...H, TmB: 1205 })).toBe(false);
  });

  it("keeps T_m,A and both Δs, with no compound, in a window that follows T_m,B only", () => {
    const { params, window } = alphaSystem(H);
    expect(params).toEqual({
      TmA: 800,
      TmB: 1200,
      dsA: 10,
      dsB: 10,
      alphaL: 0,
      alphaS: 15,
      compound: null,
    });
    expect(window).toEqual({ Tmin: 100, Tmax: 1900 });
    expect(alphaSystem({ ...H, alphaS: -30, alphaL: 30 }).window).toEqual(window);
    expect(alphaSystem({ ...H, TmB: 1800 }).window).toEqual({ Tmin: 100, Tmax: 1900 });
    expect(alphaSystem({ ...H, TmB: 1805 }).window).toEqual({ Tmin: 100, Tmax: 2000 });
    expect(alphaSystem({ ...H, TmB: 2400 }).window).toEqual({ Tmin: 100, Tmax: 2500 });
  });
});

describe("Lru", () => {
  it("drops the least recently used entry past its capacity", () => {
    const lru = new Lru<string, number>(2);
    lru.set("a", 1);
    lru.set("b", 2);
    expect(lru.get("a")).toBe(1);
    lru.set("c", 3);
    expect([lru.has("a"), lru.has("b"), lru.has("c")]).toEqual([true, false, true]);
    expect(lru.size).toBe(2);
  });
});

describe("AlphaCache", () => {
  it("keys positions by their rounded values, previews apart from full diagrams", () => {
    expect(AlphaCache.key({ alphaS: 14.9, alphaL: 0.1, TmB: 1201, compound: null }, false)).toBe(
      AlphaCache.key(H, false),
    );
    expect(AlphaCache.key(H, true)).not.toBe(AlphaCache.key(H, false));
    expect(AlphaCache.key(O, false)).not.toBe(AlphaCache.key(H, false));
  });

  it("keys a compound by its three values, and none by a dash", () => {
    const c = { Xc: 1 / 3, dhf: -6, dsf: 0 };
    expect(AlphaCache.key(H, false)).toBe("15,0,1200,-,f");
    expect(AlphaCache.key({ ...H, compound: c }, true)).toBe(`15,0,1200,${1 / 3},-6,0,p`);
    expect(AlphaCache.key({ ...H, compound: { ...c, Xc: 0.3, dhf: -6.1 } }, true)).toBe(
      AlphaCache.key({ ...H, compound: c }, true),
    );
    expect(AlphaCache.key({ ...H, compound: { ...c, dsf: 0.5 } }, false)).not.toBe(
      AlphaCache.key({ ...H, compound: c }, false),
    );
  });

  it("computes a compound's diagram, with the compound named", () => {
    const diagram = new AlphaCache(2).get({ ...H, compound: { Xc: 0.5, dhf: -6, dsf: 0 } }, true);
    expect(diagram?.naming.compound?.name).toBe("AB");
  });

  it("computes each position once, a preview in 4 K steps", () => {
    const cache = new AlphaCache(4);
    const full = cache.get(H, false)!;
    expect(cache.get({ ...H, alphaS: 15.1 }, false)).toBe(full);
    expect(isPreview(full)).toBe(false);
    const preview = cache.get(H, true)!;
    expect(isPreview(preview)).toBe(true);
    expect(preview.scan.step).toBe(COARSE_STEP);
  });

  it("evicts the least recently used diagram", () => {
    const cache = new AlphaCache(1);
    const h = cache.get(H, true);
    cache.get(O, true);
    expect(cache.has(H, true)).toBe(false);
    expect(cache.get(H, true)).not.toBe(h);
  });

  it("stores a position that cannot be computed, so that it is not tried again", () => {
    expect(computeAlpha(REJECTED, false)).toBeNull();
    expect(computeAlpha(REJECTED, true)).toBeNull();
    const cache = new AlphaCache(4);
    expect(cache.get(REJECTED, false)).toBeNull();
    expect(cache.has(REJECTED, false)).toBe(true);
  });
});

describe("the worker's diagrams", () => {
  it("cross as plain data and name the same fields", () => {
    const d = computeAlpha(H, false)!;
    const posted = structuredClone(toPosted(d));
    const back = fromPosted(posted);
    expect(back.scan.events).toEqual(d.scan.events);
    const hull = d.scan.steps[100]!.hull;
    expect(back.naming.name(hull)).toEqual(d.naming.name(hull));
  });
});

/** A channel whose replies are sent only when `reply` is called, oldest request first. */
function fakeChannel() {
  const sent: AlphaPoint[] = [];
  const channel: Channel = {
    onReply: null,
    send: (point) => sent.push(point),
  };
  const reply = () => {
    const point = sent.shift()!;
    const diagram = computeAlpha(point, false);
    const r: Reply = { point, diagram: diagram && toPosted(diagram) };
    channel.onReply!(r);
  };
  return { channel, sent, reply };
}

describe("createFullDiagrams", () => {
  it("runs one request at a time, and of those that wait only the newest", () => {
    const { channel, sent, reply } = fakeChannel();
    const done: AlphaPoint[] = [];
    const full = createFullDiagrams((p) => done.push(p), channel);
    full.request(H);
    full.request({ ...H, alphaS: 16 });
    full.request(O);
    expect(sent).toEqual([H]);
    reply();
    expect(sent).toEqual([O]);
    reply();
    expect(done).toEqual([H, O]);
    expect(sent).toEqual([]);
  });
});

/** Timeouts that run only when `advance` is called. */
function fakeTimeouts() {
  let now = 0;
  let next = 1;
  const queue = new Map<number, { at: number; run: () => void }>();
  const timeouts: Timeouts = {
    set: (run, ms) => {
      queue.set(next, { at: now + ms, run });
      return next++;
    },
    clear: (id) => queue.delete(id as number),
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [id, t] of [...queue]) {
      if (t.at > now) continue;
      queue.delete(id);
      t.run();
    }
  };
  return { timeouts, advance };
}

describe("createAlphaDrag", () => {
  const setup = () => {
    const store = new Store(alphaSystem({ alphaS: 0, alphaL: 0, TmB: 1200, compound: null }));
    const { channel, sent, reply } = fakeChannel();
    const { timeouts, advance } = fakeTimeouts();
    const computed: boolean[] = [];
    const drag = createAlphaDrag(store, {
      cache: new AlphaCache(8),
      timeouts,
      channel,
      onComputed: (ok) => computed.push(ok),
    });
    const at = () => ({ alphaS: store.state.params.alphaS, alphaL: store.state.params.alphaL });
    return { store, drag, sent, reply, advance, computed, at };
  };

  it("draws the preview at once and the full diagram once the knob rests", () => {
    const { store, drag, reply, advance, at } = setup();
    drag.move(H);
    expect(at()).toEqual({ alphaS: 15, alphaL: 0 });
    expect(isPreview(store.state.diagram)).toBe(true);
    reply();
    // Not yet: the knob has not rested.
    expect(isPreview(store.state.diagram)).toBe(true);
    advance(SETTLE_MS);
    expect(isPreview(store.state.diagram)).toBe(false);
  });

  it("draws the full diagram when it comes after the rest, or at once on release", () => {
    const { store, drag, reply, advance } = setup();
    drag.move(H);
    advance(SETTLE_MS);
    expect(isPreview(store.state.diagram)).toBe(true);
    reply();
    expect(isPreview(store.state.diagram)).toBe(false);
    drag.move(O);
    drag.release();
    reply();
    expect(isPreview(store.state.diagram)).toBe(false);
    expect(store.state.params.alphaL).toBe(10);
  });

  it("never draws a superseded request's diagram", () => {
    const { store, drag, sent, reply, advance, at } = setup();
    drag.move(H);
    drag.move({ ...H, alphaS: 20 });
    drag.move(O);
    expect(sent).toEqual([H]);
    advance(SETTLE_MS);
    const before = store.state.diagram;
    reply();
    // H's full diagram is cached, not drawn: the knob is at O.
    expect(store.state.diagram).toBe(before);
    expect(at()).toEqual({ alphaS: 0, alphaL: 10 });
    expect(sent).toEqual([O]);
    reply();
    expect(isPreview(store.state.diagram)).toBe(false);
    expect(at()).toEqual({ alphaS: 0, alphaL: 10 });
  });

  it("draws a cached full diagram at once, without asking the worker", () => {
    const { store, drag, sent, reply, advance } = setup();
    drag.move(H);
    reply();
    advance(SETTLE_MS);
    const full = store.state.diagram;
    drag.move(O);
    drag.move(H);
    expect(store.state.diagram).toBe(full);
    expect(sent).toEqual([O]);
  });

  it("holds the labels of a cached full diagram until the knob rests or is released", () => {
    const { store, drag, reply, advance } = setup();
    drag.move(H);
    expect(labelsWait(store.state)).toBe(true);
    reply();
    advance(SETTLE_MS);
    expect(labelsWait(store.state)).toBe(false);
    drag.move(O);
    // A full diagram from the cache mid-drag waits like a preview, so the labels do not flash.
    drag.move(H);
    expect(isPreview(store.state.diagram)).toBe(false);
    expect(labelsWait(store.state)).toBe(true);
    advance(SETTLE_MS);
    expect(labelsWait(store.state)).toBe(false);
    drag.move(O);
    drag.move(H);
    drag.release();
    expect(labelsWait(store.state)).toBe(false);
  });

  it("shows the last full diagram's labels at a rest on a position that cannot be computed", () => {
    const { store, drag, reply, advance } = setup();
    drag.move(H);
    reply();
    advance(SETTLE_MS);
    drag.move(REJECTED);
    expect(labelsWait(store.state)).toBe(true);
    advance(SETTLE_MS);
    expect(labelsWait(store.state)).toBe(false);
  });

  it("keeps the last diagram for a position that cannot be computed", () => {
    const { store, drag, reply, computed, advance } = setup();
    drag.move(H);
    reply();
    advance(SETTLE_MS);
    const kept = store.state.diagram;
    computed.length = 0;
    drag.move(REJECTED);
    expect(store.state.diagram).toBe(kept);
    reply();
    advance(SETTLE_MS);
    expect(store.state.diagram).toBe(kept);
    expect(computed).toEqual([false, false]);
  });

  it("changes nothing once it is no longer active, as after leaving the α mode", () => {
    const store = new Store(alphaSystem({ alphaS: 0, alphaL: 0, TmB: 1200, compound: null }));
    const { channel, reply } = fakeChannel();
    const { timeouts, advance } = fakeTimeouts();
    let active = true;
    const drag = createAlphaDrag(store, {
      cache: new AlphaCache(8),
      timeouts,
      channel,
      active: () => active,
    });
    drag.move(H);
    expect(store.state.params.alphaS).toBe(15);
    active = false;
    const kept = store.state.diagram;
    reply();
    advance(SETTLE_MS);
    drag.move(O);
    expect(store.state.diagram).toBe(kept);
  });
});
