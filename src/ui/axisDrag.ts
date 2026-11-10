// Dragging a value along one axis of a plot (plan §4.2, §12 CR2), shared by the cut line (T*
// along y) and the lever rule's knob (X₀ along x): a pointer press on a target starts the drag,
// pointer capture keeps it going off the target, and the keyboard steps the value while the
// focus element has focus.

import { MARGIN } from "./geometry";
import { perFrame } from "./schedule";

export interface AxisDragOptions {
  /** The plot's SVG: it captures the pointer, and carries `draggingClass` during a drag. */
  svg: SVGSVGElement;
  /** The elements a pointer press starts a drag on. */
  targets: readonly SVGElement[];
  /** The element a press focuses, and whose key presses step the value. */
  focus: SVGElement;
  axis: "x" | "y";
  /** The value at a plot-area coordinate along `axis`, CSS px. */
  toValue: (px: number) => number;
  /** The value now. */
  value: () => number;
  /** The value after pressing `key`, or null for a key that does not move it. */
  keyStep: (key: string, value: number) => number | null;
  onChange: (value: number) => void;
  /** The class `svg` has during a drag, for the `grabbing` cursor and the lifted look. */
  draggingClass: string;
}

/**
 * Lets the value be dragged and stepped. The grab offset, kept in the value's own units, keeps it
 * from jumping to the pointer when it is grabbed off-centre, even if the plot resizes during the
 * drag. Pointer moves reach `onChange` at most once per animation frame, the latest one winning,
 * and the release is applied at once, so the final position is never dropped.
 */
export function attachAxisDrag({
  svg,
  targets,
  focus,
  axis,
  toValue,
  value,
  keyStep,
  onChange,
  draggingClass,
}: AxisDragOptions): void {
  /** The value under the pointer, before the offset. */
  const pointerValue = (event: PointerEvent) => {
    const box = svg.getBoundingClientRect();
    return toValue(
      axis === "x" ? event.clientX - box.left - MARGIN.left : event.clientY - box.top - MARGIN.top,
    );
  };
  const moves = perFrame(onChange);
  let drag: { pointerId: number; offset: number } | null = null;

  const onDown = (event: PointerEvent) => {
    if (drag) return;
    drag = { pointerId: event.pointerId, offset: value() - pointerValue(event) };
    svg.setPointerCapture(event.pointerId);
    svg.classList.add(draggingClass);
    event.preventDefault();
    // Another drag's target may lie under this one (the lever's knob is on the cut).
    event.stopPropagation();
    focus.focus({ preventScroll: true });
  };
  const onMove = (event: PointerEvent) => {
    if (event.pointerId !== drag?.pointerId) return;
    moves.push(pointerValue(event) + drag.offset);
  };
  const onEnd = (event: PointerEvent) => {
    if (event.pointerId !== drag?.pointerId) return;
    // A release is where the pointer was let go; a cancel keeps the last move.
    if (event.type === "pointerup") moves.push(pointerValue(event) + drag.offset);
    moves.flush();
    drag = null;
    svg.classList.remove(draggingClass);
  };
  for (const target of targets) target.addEventListener("pointerdown", onDown);
  svg.addEventListener("pointermove", onMove);
  svg.addEventListener("pointerup", onEnd);
  svg.addEventListener("pointercancel", onEnd);
  svg.addEventListener("lostpointercapture", onEnd);

  focus.addEventListener("keydown", (event) => {
    const next = keyStep(event.key, value());
    if (next === null) return;
    event.preventDefault();
    onChange(next);
  });
}
