// Moving the diagram's cut line (plan §1, §4.2), adapted from pTerrain's ui/cutDrag.ts: dragging
// it by its 44 px band or its handle, and stepping it from the keyboard while the handle has focus,
// on the drag that the lever's knob shares (axisDrag.ts). ThermoBRIDGE has one cut, at T*, and no
// axis swap.

import { tickStep } from "d3";
import type { PlotWindow } from "../physics/plotWindow";
import { attachAxisDrag } from "./axisDrag";
import { TAt, type PlotSize } from "./geometry";
import type { Store } from "./state";

/**
 * The cut after pressing `key` on the handle, or null for a key that does not move it: arrows
 * step the cut by about a hundredth of the window (a round number of K), Page Up/Down take ten
 * steps, Home/End go to the window's ends. The store clamps the result into the window.
 */
export function cutAfterKey(key: string, T: number, window: PlotWindow): number | null {
  const step = tickStep(window.Tmin, window.Tmax, 100);
  const next: Record<string, number> = {
    ArrowUp: T + step,
    ArrowRight: T + step,
    ArrowDown: T - step,
    ArrowLeft: T - step,
    PageUp: T + 10 * step,
    PageDown: T - 10 * step,
    Home: window.Tmin,
    End: window.Tmax,
  };
  return Object.hasOwn(next, key) ? next[key]! : null;
}

/**
 * Lets the cut be dragged by `targets` inside `svg` and stepped from the keyboard on `handle`
 * (`attachAxisDrag`), with the offset in K. `svg` has the class `cut-dragging` during a drag.
 */
export function attachCutDrag(
  svg: SVGSVGElement,
  targets: readonly SVGElement[],
  handle: SVGGElement,
  store: Store,
  size: () => PlotSize,
): void {
  attachAxisDrag({
    svg,
    targets,
    focus: handle,
    axis: "y",
    toValue: (y) => TAt(y, store.state.window, size()),
    value: () => store.state.cut,
    keyStep: (key, T) => cutAfterKey(key, T, store.state.window),
    onChange: (T) => store.setCut(T),
    draggingClass: "cut-dragging",
  });
}
