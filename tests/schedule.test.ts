import { describe, expect, it } from "vitest";
import { perFrame, throttle, type Frames, type Timers } from "../src/ui/schedule";

/** Animation frames that run only when `tick` is called. */
function fakeFrames() {
  const queue = new Map<number, () => void>();
  let next = 1;
  const frames: Frames = {
    request: (run) => {
      queue.set(next, run);
      return next++;
    },
    cancel: (id) => queue.delete(id),
  };
  const tick = () => {
    const runs = [...queue.values()];
    queue.clear();
    for (const run of runs) run();
  };
  return { frames, tick, pending: () => queue.size };
}

/** A clock and timers that move only when `advance` is called. */
function fakeTimers() {
  let now = 0;
  let timers: { at: number; run: () => void }[] = [];
  const api: Timers = {
    now: () => now,
    set: (run, ms) => timers.push({ at: now + ms, run }),
  };
  const advance = (ms: number) => {
    now += ms;
    const due = timers.filter((t) => t.at <= now);
    timers = timers.filter((t) => t.at > now);
    for (const t of due) t.run();
  };
  return { api, advance };
}

describe("perFrame", () => {
  it("applies the latest of many pushes once, at the next frame", () => {
    const { frames, tick, pending } = fakeFrames();
    const applied: number[] = [];
    const batch = perFrame((v: number) => applied.push(v), frames);
    for (const v of [1, 2, 3]) batch.push(v);
    expect(applied).toEqual([]);
    expect(pending()).toBe(1);
    tick();
    expect(applied).toEqual([3]);
    tick();
    expect(applied).toEqual([3]);
  });

  it("applies a queued value at once on flush, and not again at the frame", () => {
    const { frames, tick, pending } = fakeFrames();
    const applied: number[] = [];
    const batch = perFrame((v: number) => applied.push(v), frames);
    batch.push(1);
    batch.push(2);
    batch.flush();
    expect(applied).toEqual([2]);
    expect(pending()).toBe(0);
    tick();
    batch.flush();
    expect(applied).toEqual([2]);
    batch.push(4);
    tick();
    expect(applied).toEqual([2, 4]);
  });
});

describe("throttle", () => {
  it("runs at once after a quiet spell, then once more after a burst", () => {
    const { api, advance } = fakeTimers();
    let runs = 0;
    const call = throttle(() => runs++, 100, api);
    call();
    expect(runs).toBe(1);
    advance(10);
    call();
    advance(10);
    call();
    expect(runs).toBe(1);
    advance(80);
    expect(runs).toBe(2);
    advance(500);
    expect(runs).toBe(2);
    call();
    expect(runs).toBe(3);
  });

  it("runs no more than once per period through a long burst", () => {
    const { api, advance } = fakeTimers();
    let runs = 0;
    const call = throttle(() => runs++, 100, api);
    for (let t = 0; t < 1000; t += 16) {
      call();
      advance(16);
    }
    expect(runs).toBeGreaterThanOrEqual(9);
    expect(runs).toBeLessThanOrEqual(11);
  });
});
