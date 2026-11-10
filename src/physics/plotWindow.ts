// The temperature range that the diagram is computed and drawn over (plan §2.2, §3), in a module
// of its own so that the window rule (autoWindow.ts) and the checks (validity.ts) can share it
// with the modules they import without a cycle.

/** The temperature range of the diagram, K. */
export interface PlotWindow {
  Tmin: number;
  Tmax: number;
}
