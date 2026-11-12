// Writes the 18 grid systems, the five presets off the grid and the nine compound presets c1–c9
// (src/physics/presets.ts) as JSON on stdout, with what the app computes for each: its events, the phases it finds just
// below and just above each event, and its tie lines at a few temperatures. scripts/crosscheck.py
// reads this and checks it against pycalphad (plan §9 phases 2 and 12). Run from the project directory:
//   node scripts/exportSystems.mjs > systems.json

// @ts-check

import { fileURLToPath } from "node:url";
import { runnerImport } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
/**
 * A module of the app, compiled by Vite; typed by the caller.
 * @param {string} path
 * @returns {Promise<any>}
 */
const load = async (path) =>
  (await runnerImport(path, { root, configFile: false, logLevel: "silent" })).module;

/** @type {typeof import("../src/physics/presets")} */
const { COMPOUND_PRESETS, PANELS, PRESETS } = await load("/src/physics/presets.ts");
/** @type {typeof import("../src/physics/events")} */
const { scan } = await load("/src/physics/events.ts");
/** @type {typeof import("../src/physics/hull")} */
const { sliceHull } = await load("/src/physics/hull.ts");
/** @type {typeof import("../src/physics/gibbs")} */
const { criticalT } = await load("/src/physics/gibbs.ts");

/**
 * The event checks sit this far below and above each event, K: 0.5 K, and 10 K at a critical
 * point, where a gap 0.5 K below T_c is too shallow for pycalphad's sampling (±0.018 wide in X
 * for the liquid of (e)); the same 10 K that the tie-line comparison leaves out.
 */
const DT = 0.5;
const DT_CRITICAL = 10;
/** Temperatures per system for the tie-line comparison. */
const SAMPLES = 8;

/**
 * The phases of the field that holds X at T, e.g. ["S", "S"] in a solid gap.
 * @param {import("../src/physics/gibbs").Params} params
 * @param {number} X
 * @param {number} T
 */
function phasesAt(params, X, T) {
  for (const f of sliceHull(params, T).fields) {
    if (f.kind === "single" && X >= f.X[0] && X <= f.X[1]) return [f.phase];
    if (f.kind === "tie" && X > f.ends[0].X && X < f.ends[1].X) return f.ends.map((e) => e.phase);
  }
  throw new Error(`X = ${X} outside the hull at ${T} K`);
}

/**
 * The composition at which an event is checked: its middle phase, or just inside a pure end.
 * @param {import("../src/physics/events").DiagramEvent} e
 */
function checkX(e) {
  if (e.kind === "melting") return e.points[0]?.X === 0 ? 1e-5 : 1 - 1e-5;
  return /** @type {import("../src/physics/hull").TieEnd} */ (
    e.points[Math.floor((e.points.length - 1) / 2)]
  ).X;
}

const systems = [
  ...Object.entries(PANELS).map(([id, s]) => ({ id, ...s })),
  ...PRESETS.filter((p) => !(p.id in PANELS) && p.group !== "compound").map((p) => ({
    id: p.id,
    params: p.params,
    window: p.window,
  })),
  ...COMPOUND_PRESETS.map((p) => ({ id: p.id, params: p.params, window: p.window })),
];

const out = systems.map(({ id, params, window }) => {
  const { events } = scan(params, window);
  const eventChecks = events.map((e) => {
    const X = checkX(e);
    const side = (/** @type {number} */ dT) => ({
      T: e.T + dT,
      phases: phasesAt(params, X, e.T + dT),
    });
    const dT = e.kind === "critical" ? DT_CRITICAL : DT;
    // A second pair at twice the distance, which crosscheck.py falls back to (and reports).
    return {
      kind: e.kind,
      T: e.T,
      X,
      below: side(-dT),
      above: side(dT),
      wider: { below: side(-2 * dT), above: side(2 * dT) },
    };
  });
  const criticals = [params.alphaL, params.alphaS].filter((a) => a > 0).map(criticalT);
  const tieChecks = [];
  for (let k = 0; k < SAMPLES; k++) {
    const T = window.Tmin + ((window.Tmax - window.Tmin) * (k + 0.5)) / SAMPLES;
    if (events.some((e) => Math.abs(e.T - T) < 2)) continue;
    if (criticals.some((Tc) => Math.abs(Tc - T) < 10)) continue;
    const ties = sliceHull(params, T).ties.map((t) =>
      t.ends.map((e) => ({ phase: e.phase, X: e.X })),
    );
    tieChecks.push({ T, ties });
  }
  return {
    id,
    params,
    window,
    events: events.map((e) => ({ kind: e.kind, T: e.T, points: e.points })),
    eventChecks,
    tieChecks,
  };
});

process.stdout.write(JSON.stringify(out, null, 1));
