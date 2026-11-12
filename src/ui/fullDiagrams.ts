// The α mode's full diagrams, computed off the page's thread (plan §9 phase 15, step 3): a Web
// Worker (alphaWorker.ts) computes the full diagram of each position the knob reaches, while the
// page draws the previews, so that the full diagram is ready, or nearly, when the knob stops.
// One request runs at a time; while it runs, a newer request replaces any that waits, so the
// worker never falls behind the knob. The result of every request that ran is handed on, to be
// cached; `createAlphaDrag` draws it only if it is still the knob's position.

import { computeAlpha, type Cached } from "./alphaCache";
import { quantise, type AlphaPoint } from "./alphaPoint";
import { named, type NameRules } from "../physics/fields";
import type { Diagram } from "./state";

/** A diagram as the worker posts it: plain data, the naming's rules in place of its function. */
export type PostedDiagram = Omit<Diagram, "naming"> & { naming: NameRules };

/** The worker's reply to a request for the full diagram of `point`. */
export interface Reply {
  point: AlphaPoint;
  diagram: PostedDiagram | null;
}

/** `diagram` as plain data, for `postMessage`. */
export function toPosted({ naming, ...rest }: Diagram): PostedDiagram {
  return { ...rest, naming: { solid: naming.solid, compound: naming.compound } };
}

/** The diagram of a posted one. */
export function fromPosted({ naming, ...rest }: PostedDiagram): Diagram {
  return { ...rest, naming: named(naming) };
}

/** Where the requests go: a Web Worker, or an inline stand-in. */
export interface Channel {
  send(point: AlphaPoint): void;
  /** Set by `createFullDiagrams`: called with each reply. */
  onReply: ((reply: Reply) => void) | null;
}

export interface FullDiagrams {
  /** Asks for the full diagram of `p` (rounded to the steps). */
  request(p: AlphaPoint): void;
}

/**
 * The full diagrams through `channel`, each reply handed to `onResult`. At most one request is
 * with the channel at a time; one more waits, replaced by each newer request.
 */
export function createFullDiagrams(
  onResult: (p: AlphaPoint, diagram: Cached) => void,
  channel: Channel = workerChannel(),
): FullDiagrams {
  let running = false;
  let waiting: AlphaPoint | null = null;
  // The next request goes out first, so that a listener that throws in `onResult` does not stop
  // the queue.
  channel.onReply = ({ point, diagram }) => {
    const next = waiting;
    waiting = null;
    running = next !== null;
    if (next) channel.send(next);
    onResult(point, diagram && fromPosted(diagram));
  };
  return {
    request(p) {
      const point = quantise(p);
      if (running) {
        waiting = point;
        return;
      }
      running = true;
      channel.send(point);
    },
  };
}

/**
 * A channel that computes on the page's thread, after the current task: where module workers are
 * not available, and in Node.
 */
export function inlineChannel(): Channel {
  const channel: Channel = {
    onReply: null,
    send(point) {
      setTimeout(() => {
        const diagram = computeAlpha(point, false);
        channel.onReply?.({ point, diagram: diagram && toPosted(diagram) });
      }, 0);
    },
  };
  return channel;
}

/**
 * A channel to a Web Worker running alphaWorker.ts, or `inlineChannel` where there is none. An
 * error in the worker answers its request with null, as for a system that cannot be computed, so
 * that the requests after it still run.
 */
export function workerChannel(): Channel {
  if (typeof Worker === "undefined") return inlineChannel();
  const worker = new Worker(new URL("./alphaWorker.ts", import.meta.url), { type: "module" });
  let sent: AlphaPoint | null = null;
  const channel: Channel = {
    onReply: null,
    send(point) {
      sent = point;
      worker.postMessage(point);
    },
  };
  worker.onmessage = ({ data }: MessageEvent<Reply>) => channel.onReply?.(data);
  worker.onerror = (event) => {
    event.preventDefault();
    console.warn(`ThermoBRIDGE: the diagram worker failed: ${event.message}`);
    if (sent) channel.onReply?.({ point: sent, diagram: null });
  };
  return channel;
}
