// Timing for the plots (plan §12, CR2): a drag's pointer moves batched to one store update per
// animation frame, and a resize's redraws throttled. The clocks are parameters, so that the logic
// can be tested in Node.

/** The animation-frame calls `perFrame` uses; the browser's by default. */
export interface Frames {
  request(run: () => void): number;
  cancel(id: number): void;
}

const BROWSER_FRAMES: Frames = {
  request: (run) => requestAnimationFrame(run),
  cancel: (id) => cancelAnimationFrame(id),
};

/** A latest-value queue that `perFrame` returns. */
export interface FrameBatch<T> {
  /** Queues `value`, replacing any queued one; it is applied at the next frame. */
  push(value: T): void;
  /** Applies the queued value now, if there is one, and cancels its frame. */
  flush(): void;
}

/** Calls `apply` with the latest pushed value at most once per animation frame. */
export function perFrame<T>(
  apply: (value: T) => void,
  frames: Frames = BROWSER_FRAMES,
): FrameBatch<T> {
  let queued: { value: T } | null = null;
  let frame: number | null = null;
  const flush = () => {
    if (frame !== null) frames.cancel(frame);
    frame = null;
    if (!queued) return;
    const { value } = queued;
    queued = null;
    apply(value);
  };
  return {
    push(value) {
      queued = { value };
      frame ??= frames.request(() => {
        frame = null;
        flush();
      });
    },
    flush,
  };
}

/** The least time between two redraws of a plot while it is being resized, ms. */
export const RESIZE_MS = 100;

/** The timer calls `throttle` uses; the browser's by default. */
export interface Timers {
  now(): number;
  set(run: () => void, ms: number): unknown;
}

const BROWSER_TIMERS: Timers = {
  now: () => performance.now(),
  set: (run, ms) => setTimeout(run, ms),
};

/**
 * `run`, called at most once per `ms`: a call after a quiet spell runs at once, and the calls
 * within `ms` of a run make one more run when the spell is over, so the last call is never lost.
 */
export function throttle(run: () => void, ms: number, timers: Timers = BROWSER_TIMERS): () => void {
  let last = -Infinity;
  let waiting = false;
  const fire = () => {
    last = timers.now();
    run();
  };
  return () => {
    if (waiting) return;
    const wait = last + ms - timers.now();
    if (wait <= 0) {
      fire();
      return;
    }
    waiting = true;
    timers.set(() => {
      waiting = false;
      fire();
    }, wait);
  };
}
