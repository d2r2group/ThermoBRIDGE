import { describe, expect, it } from "vitest";
import { boundaries } from "../src/physics/boundaries";
import {
  scan as scanAnew,
  type DiagramEvent,
  type EventKind,
  type Scan,
} from "../src/physics/events";
import { fields } from "../src/physics/fields";
import { criticalT, type Params } from "../src/physics/gibbs";
import type { PlotWindow } from "../src/physics/plotWindow";
import { sliceHull } from "../src/physics/hull";
import {
  DEFAULT_PRESET,
  PANELS,
  preset,
  PRESETS,
  type PanelId,
  type PresetId,
} from "../src/physics/presets";
import { checkParams, checkSystem, validate, type ValidityCheck } from "../src/physics/validity";

/** The scan of a system, once per system in this file: most tests here read the same ones. */
const scans = new Map<string, Scan>();
function scan(params: Params, window: PlotWindow): Scan {
  const key = JSON.stringify([params, window]);
  let s = scans.get(key);
  if (!s) scans.set(key, (s = scanAnew(params, window)));
  return s;
}
const events = (params: Params, window: PlotWindow) => scan(params, window).events;

const kinds = (evs: DiagramEvent[], ...want: EventKind[]) =>
  evs.filter((e) => want.includes(e.kind));
const INVARIANTS: EventKind[] = ["eutectic", "monotectic", "peritectic", "syntectic"];
const invariants = (evs: DiagramEvent[]) => kinds(evs, ...INVARIANTS);
const evOf = (id: PanelId | PresetId) =>
  id in PANELS
    ? events(PANELS[id as PanelId].params, PANELS[id as PanelId].window)
    : events(preset(id as PresetId).params, preset(id as PresetId).window);

describe("the α grid", () => {
  // The main feature of each grid system as the model computes it (plan §2.1): (i) has a
  // congruent minimum and a peritectic 3.9 K above it, and the invariant of (k) has the solid
  // between the two liquids, a syntectic.
  const main: Record<PanelId, EventKind[]> = {
    a: ["eutectic"],
    b: ["eutectic"],
    c: ["eutectic"],
    d: ["eutectic"],
    e: ["eutectic", "monotectic"],
    f: ["eutectic"],
    g: ["eutectic"],
    h: ["eutectic"],
    i: ["minimum", "peritectic"],
    j: ["monotectic", "maximum"],
    k: ["syntectic"],
    l: ["minimum"],
    m: ["minimum"],
    n: [],
    o: ["maximum"],
    p: ["minimum"],
    q: ["maximum"],
    r: ["maximum"],
  };

  it.each(Object.keys(main) as PanelId[])("(%s) shows its main feature", (id) => {
    const evs = evOf(id).filter((e) => e.kind !== "melting" && e.kind !== "critical");
    expect(evs.map((e) => e.kind)).toEqual(main[id]);
    // Both pure components melt inside every window, at their T_m exactly.
    expect(kinds(evOf(id), "melting").map((e) => e.T)).toEqual([800, 1200]);
  });

  it("pins every panel's events as a regression snapshot", () => {
    const round = (x: number, d: number) => Number(x.toFixed(d));
    const all = Object.fromEntries(
      (Object.keys(PANELS) as PanelId[]).map((id) => [
        id,
        evOf(id).map(
          (e) =>
            `${e.kind} ${round(e.T, 3)} K: ${e.points.map((p) => `${p.phase} ${round(p.X, 4)}`).join(", ")}`,
        ),
      ]),
    );
    expect(all).toMatchSnapshot();
  });

  it("reproduces the computed features of plan §2.1", () => {
    const T = (id: PanelId, kind: EventKind) => kinds(evOf(id), kind).map((e) => e.T);
    expect(T("c", "eutectic")[0]).toBeCloseTo(610.9, 1);
    expect(T("d", "eutectic")[0]).toBeCloseTo(733.9, 1);
    expect(T("h", "eutectic")[0]).toBeCloseTo(634.2, 1);
    expect(T("e", "eutectic")[0]).toBeCloseTo(788.9, 1);
    expect(T("e", "monotectic")[0]).toBeCloseTo(1088.7, 1);
    expect(T("e", "critical")[0]).toBeCloseTo(1202.7, 1);
    expect(T("k", "critical")).toEqual([criticalT(15), criticalT(30)]);
    expect(T("k", "syntectic")[0]).toBeCloseTo(1357.4, 1);
    expect(T("m", "minimum")[0]).toBeCloseTo(710, 6);
    expect(T("o", "maximum")[0]).toBeCloseTo(1290, 6);
    expect(T("q", "maximum")[0]).toBeCloseTo(1205, 6);
    expect(T("r", "maximum")[0]).toBeCloseTo(1401.7, 1);
  });

  it("separates the two events of (i) although they lie 4 K apart, 1.1 K below T_m,A", () => {
    const evs = evOf("i");
    const [min] = kinds(evs, "minimum");
    const [per] = kinds(evs, "peritectic");
    expect(min!.T).toBeCloseTo(795, 6);
    expect(min!.points[0]!.X).toBeCloseTo(0.1, 6);
    expect(per!.T).toBeCloseTo(798.87, 2);
    expect(800 - per!.T).toBeCloseTo(1.13, 2);
  });
});

describe("further systems", () => {
  it.each([
    ["p1", 845.8],
    ["p2", 859.1],
    ["p3", 875.8],
  ] as const)("%s has exactly one invariant, a peritectic near %f K", (id, T) => {
    const inv = invariants(evOf(id));
    expect(inv.map((e) => e.kind)).toEqual(["peritectic"]);
    expect(inv[0]!.T).toBeCloseTo(T, 1);
    // The liquid at one end of the tie line, the solid that forms in the middle.
    expect(inv[0]!.points.map((p) => p.phase)).toEqual(["L", "S", "S"]);
  });

  it("turns (h)'s eutectic into a peritectic as T_m,B rises", () => {
    const kindAt = (TmB: number) =>
      invariants(events({ ...PANELS.h.params, TmB }, { Tmin: 300, Tmax: TmB + 100 })).map(
        (e) => e.kind,
      );
    expect(kindAt(1200)).toEqual(["eutectic"]);
    expect(kindAt(1600)).toEqual(["eutectic"]);
    expect(kindAt(2400)).toEqual(["peritectic"]);
  });

  it("Peritectic and monotectic has a peritectic and above it a monotectic", () => {
    const inv = invariants(evOf("p4"));
    expect(inv.map((e) => e.kind)).toEqual(["peritectic", "monotectic"]);
    expect(inv[0]!.T).toBeCloseTo(821.1, 1);
    expect(inv[1]!.T).toBeCloseTo(1131.5, 1);
  });

  it("Melting dip over a solid gap has no invariant: a minimum over a stable solid critical point", () => {
    const evs = evOf("m1");
    expect(invariants(evs)).toEqual([]);
    const [crit] = kinds(evs, "critical");
    const [min] = kinds(evs, "minimum");
    expect(crit!.points[0]!.phase).toBe("S");
    expect(crit!.T).toBe(criticalT(6));
    expect(crit!.T).toBeCloseTo(360.8, 1);
    expect(min!.T).toBeGreaterThan(crit!.T);
    expect(min!.T).toBeCloseTo(456.0, 1);
  });

  it("Melting dip over a solid gap with α_s = +8 kJ/mol turns into a eutectic near 413 K", () => {
    const { params, window } = preset("m1");
    const inv = invariants(events({ ...params, alphaS: 8 }, window));
    expect(inv.map((e) => e.kind)).toEqual(["eutectic"]);
    expect(inv[0]!.T).toBeCloseTo(412.6, 1);
  });
});

describe("boundaries", () => {
  it("run up in T between events and meet at the events", () => {
    for (const p of PRESETS) {
      const s = scan(p.params, p.window);
      const bs = boundaries(p.params, p.window, s);
      const temps = new Set([p.window.Tmin, p.window.Tmax, ...s.events.map((e) => e.T)]);
      for (const b of bs) {
        for (let k = 1; k < b.points.length; k++) {
          expect(b.points[k]!.T).toBeGreaterThan(b.points[k - 1]!.T);
        }
        expect(temps.has(b.points[0]!.T)).toBe(true);
        expect(temps.has(b.points[b.points.length - 1]!.T)).toBe(true);
      }
    }
  });

  it("close a dome at a stable critical point", () => {
    const { params, window } = PANELS.k;
    const dome = boundaries(params, window, scan(params, window)).filter(
      (b) => b.phases[0] === "S" && b.phases[1] === "S",
    );
    // The dome runs from the window's floor to its top, split at T_m,A = 800 K by that event.
    const tops = dome.map((b) => b.points[b.points.length - 1]!).filter((pt) => pt.T > 800);
    expect(dome).toHaveLength(4);
    expect(tops).toHaveLength(2);
    for (const top of tops) {
      expect(top.X).toBe(0.5);
      expect(top.T).toBe(criticalT(15));
    }
  });

  it("end each liquidus at a pure melting point", () => {
    const { params, window } = PANELS.h;
    const ends = boundaries(params, window, scan(params, window)).flatMap((b) => [
      b.points[0]!,
      b.points[b.points.length - 1]!,
    ]);
    expect(ends).toContainEqual({ X: 0, T: 800 });
    expect(ends).toContainEqual({ X: 1, T: 1200 });
  });
});

describe("names", () => {
  const namingOf = (params: Params, window: PlotWindow) =>
    fields(params, window, scan(params, window));
  const solidOf = (p: { params: Params; window: PlotWindow }) => namingOf(p.params, p.window).solid;
  const sys = (id: PanelId | PresetId) =>
    id in PANELS ? PANELS[id as PanelId] : preset(id as PresetId);

  it("names the solid α/β, α₁/α₂ or S as plan §4 item 1 sets out", () => {
    for (const id of ["h", "i", "p1", "p2", "p3", "p4"] as const)
      expect(solidOf(sys(id))).toBe("alphaBeta");
    for (const id of ["j", "k", "m1"] as const) expect(solidOf(sys(id))).toBe("alpha12");
    expect(solidOf(sys("n"))).toBe("S");
  });

  it("names a liquid gap L₁ + L₂", () => {
    for (const id of ["e", "k", "p4"] as const) {
      const { params, window } = sys(id);
      const naming = namingOf(params, window);
      const names = scan(params, window).steps.flatMap((s) =>
        naming.name(s.hull).map((f) => f.name),
      );
      expect(names).toContain("L₁ + L₂");
    }
  });

  it("names the fields of (h) along a cut through both L + S fields", () => {
    const { params, window } = PANELS.h;
    const named = namingOf(params, window).name(sliceHull(params, 700));
    expect(named.map((f) => f.name)).toEqual(["α", "L + α", "L", "L + β", "β"]);
    const tie = named[1]!;
    expect(tie.kind === "tie" && tie.ends.map((e) => e.name)).toEqual(["α", "L"]);
    expect(
      namingOf(params, window)
        .name(sliceHull(params, 500))
        .map((f) => f.name),
    ).toEqual(["α", "α + β", "β"]);
  });

  it("names the gap of a stable solid dome α₁ + α₂ and the solid α", () => {
    const { params, window } = PANELS.k;
    const named = namingOf(params, window).name(sliceHull(params, 700));
    expect(named.map((f) => f.name)).toEqual(["α", "α₁ + α₂", "α"]);
  });
});

describe("presets", () => {
  it("are 21 in five groups, seven from the grid, the compound's last, the eutectic the default", () => {
    expect(PRESETS.map((p) => `${p.group} ${p.id}`)).toEqual([
      "ideal n",
      "solid-solution m",
      "solid-solution o",
      "solid-gap m1",
      "solid-gap h",
      "solid-gap c",
      "solid-gap p1",
      "solid-gap p2",
      "solid-gap p3",
      "liquid-gap e",
      "liquid-gap p4",
      "liquid-gap k",
      ...["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "c9"].map((id) => `compound ${id}`),
    ]);
    expect(PRESETS.filter((p) => p.id in PANELS)).toHaveLength(7);
    expect(DEFAULT_PRESET).toBe("h");
    expect(preset("h").label).toBe("Eutectic");
    expect(preset("m1").label).toBe("Melting dip over a solid gap");
  });

  it("all pass the checks of validate, as do all 18 grid systems", () => {
    // On the scans the other tests share; `checkSystem` would scan the same system again.
    for (const p of [...PRESETS, ...Object.values(PANELS)])
      expect(checkSystem(p.params, p.window, scan(p.params, p.window))).toMatchObject({ ok: true });
  });
});

describe("validate", () => {
  const { params, window } = PANELS.h;
  const checks = (p: Partial<Params>, w: Partial<PlotWindow> = {}): ValidityCheck[] =>
    validate({ ...params, ...p }, { ...window, ...w }).map((i) => i.check);

  it("rejects parameters that break each check", () => {
    expect(checks({ TmA: Number.NaN })).toEqual(["finite"]);
    expect(checks({ TmA: -800 })).toContain("meltingPoint");
    expect(checks({ dsB: 0 })).toEqual(["entropy"]);
    expect(checks({ alphaL: 61 })).toEqual(["alpha"]);
    expect(checks({ alphaS: -60.5 })).toEqual(["alpha"]);
    expect(checks({}, { Tmin: 0 })).toEqual(["Tmin"]);
    expect(checks({}, { Tmax: 200 })).toEqual(["window", "meltingInWindow"]);
    expect(checks({}, { Tmax: 1100 })).toEqual(["meltingInWindow"]);
    expect(checks({}, { Tmin: 800 })).toEqual(["meltingInWindow"]);
  });

  it("keeps the melting points below 5000 K and T_max at most 5000 K, with one issue for both", () => {
    expect(checks({}, { Tmax: 5001 })).toEqual(["maxT"]);
    expect(checks({ TmB: 5001 }, { Tmax: 5100 })).toEqual(["maxT"]);
    expect(checks({ TmB: 5001 }, { Tmax: 5000 })).toEqual(["maxT", "meltingInWindow"]);
    expect(checks({ TmB: 4900 }, { Tmax: 5000 })).toEqual([]);
    // A melting point at the cap could never lie strictly inside a window that ends there.
    expect(checks({ TmB: 5000 }, { Tmax: 5000 })).toEqual(["maxT", "meltingInWindow"]);
    expect(checkParams({ ...params, TmB: 5000 }).map((i) => i.check)).toEqual(["maxT"]);
  });

  it("names the fields each check fails on, for the Parameters panel to mark", () => {
    const fields = (p: Partial<Params>, w: Partial<PlotWindow> = {}) =>
      validate({ ...params, ...p }, { ...window, ...w }).map((i) => [i.check, i.fields]);
    expect(fields({ TmA: Number.NaN, dsB: Number.NaN })).toEqual([["finite", ["TmA", "dsB"]]]);
    expect(fields({}, { Tmax: Number.NaN })).toEqual([["finite", ["Tmax"]]]);
    expect(fields({ TmA: -800 })).toContainEqual(["meltingPoint", ["TmA"]]);
    expect(fields({ dsA: 0, dsB: -1 })).toEqual([["entropy", ["dsA", "dsB"]]]);
    expect(fields({ alphaS: -60.5 })).toEqual([["alpha", ["alphaS"]]]);
    expect(fields({}, { Tmin: 0 })).toEqual([["Tmin", ["Tmin"]]]);
    expect(fields({}, { Tmax: 200 })).toEqual([
      ["window", ["Tmax"]],
      ["meltingInWindow", ["Tmin", "Tmax"]],
    ]);
    // One issue for the cap, naming every number that breaks it.
    expect(fields({ TmB: 5001 }, { Tmax: 5100 })).toEqual([["maxT", ["TmB", "Tmax"]]]);
    expect(fields({}, { Tmax: 5001 })).toEqual([["maxT", ["Tmax"]]]);
    expect(
      fields(
        { TmA: 1934.22, TmB: 440.34, dsA: 17.24, dsB: 14.02, alphaL: 26.88, alphaS: 47.78 },
        { Tmin: 100, Tmax: 2134 },
      ),
    ).toEqual([["computed", []]]);
  });

  it("accepts the edges of the α range", () => {
    expect(checks({ alphaL: 60, alphaS: -60 })).toEqual([]);
  });

  it("rejects a system whose events cannot be separated", () => {
    // A eutectic within 1e-3 K of T_m,B, where the solid dissolves about 1e-10 of A.
    expect(
      checks(
        { TmA: 1934.22, TmB: 440.34, dsA: 17.24, dsB: 14.02, alphaL: 26.88, alphaS: 47.78 },
        { Tmin: 100, Tmax: 2134 },
      ),
    ).toEqual(["computed"]);
  });
});
