import { describe, expect, it } from "vitest";
import { INVARIANT_KINDS, scan, type DiagramEvent } from "../src/physics/events";
import { PRESETS } from "../src/physics/presets";
import { fieldsAt, invariantAt } from "../src/physics/cut";
import { touchingXs } from "../src/physics/slice";
import {
  invariantTouches,
  MARKER_LEGEND,
  markedPointsOf,
  markerPath,
  markerPoint,
  markerStyle,
  markerTitle,
} from "../src/ui/diagram/eventMarkers";
import { pointLabel } from "../src/ui/diagram/pointLabels";

// The diagram's event markers: shape by reaction, colour by prefix, fill by suffix, and a preset
// that shows each.

const events = new Map(PRESETS.map((p) => [p.id, scan(p.params, p.window).events] as const));
const all = [...events.values()].flat();
const style = (kind: string, phase = "L") =>
  markerStyle({ kind, T: 500, points: [{ phase, X: 0.5 }] } as unknown as DiagramEvent);

describe("the event markers", () => {
  it("give each kind its shape, prefix colour and fill", () => {
    expect(
      Object.fromEntries(
        INVARIANT_KINDS.map((k) => {
          const s = style(k)!;
          return [k, `${s.shape} ${s.family} ${s.open ? "open" : "filled"}`];
        }),
      ),
    ).toEqual({
      eutectic: "down eu filled",
      eutectoid: "down eu open",
      monotectic: "down mono filled",
      monotectoid: "down mono open",
      metatectic: "down meta filled",
      peritectic: "up peri filled",
      peritectoid: "up peri open",
      syntectic: "up syn filled",
    });
    expect(style("critical", "L")).toEqual({ shape: "circle", family: "point", open: false });
    expect(style("critical", "S")).toEqual({ shape: "circle-dot", family: "point", open: true });
    expect(style("minimum")).toEqual({ shape: "diamond", family: "point", open: false });
    expect(style("maximum")).toEqual({ shape: "diamond", family: "point", open: false });
    expect(style("congruent")).toEqual({ shape: "diamond", family: "point", open: true });
    expect(style("melting")).toBeNull();
  });

  it("are all shown by some preset, and are all in the legend", () => {
    const key = (e: DiagramEvent) => JSON.stringify(markerStyle(e));
    const shown = new Set(markedPointsOf(all).map(key));
    const legend = new Set(MARKER_LEGEND.map(([s]) => JSON.stringify(s)));
    expect(shown).toEqual(legend);
    for (const kind of INVARIANT_KINDS)
      expect(
        all.some((e) => e.kind === kind),
        kind,
      ).toBe(true);
  });

  it("sit on an invariant's middle phase, the one that splits or forms", () => {
    const eutectic = events.get("h")!.find((e) => e.kind === "eutectic")!;
    expect(markerPoint(eutectic).phase).toBe("L");
    const monotectoid = events.get("c9")!.find((e) => e.kind === "monotectoid")!;
    expect(markerPoint(monotectoid)).toEqual(monotectoid.points[1]);
    expect(markerPoint(monotectoid).X).toBeCloseTo(0.708, 3);
    const peritectic = events.get("p1")!.find((e) => e.kind === "peritectic")!;
    expect(markerPoint(peritectic).phase).toBe("S");
  });

  it("are named in their tooltips", () => {
    const find = (id: Parameters<typeof events.get>[0], kind: string) =>
      events.get(id)!.find((e) => e.kind === kind)!;
    expect(markerTitle(find("h", "eutectic"))).toBe("eutectic, 634 K");
    expect(markerTitle(find("c9", "critical"))).toBe("critical point of the solid, 902 K");
    expect(markerTitle(find("k", "syntectic"))).toBe("syntectic, 1357 K");
    expect(markerTitle(find("c7", "congruent"))).toBe("congruent transformation, 685 K");
    // The Labels button writes the tooltip on the diagram, capitalised.
    expect(pointLabel(find("h", "eutectic"))).toBe("Eutectic, 634 K");
    expect(pointLabel(find("c9", "critical"))).toBe("Critical point of the solid, 902 K");
  });

  it("point ▼ down and ▲ up about the point", () => {
    expect(markerPath("down")).toMatch(/^M0,6\.5L/);
    expect(markerPath("up")).toMatch(/^M0,-6\.5L/);
  });

  it("replace the cut's plain markers only where it touches all three of an invariant's phases", () => {
    const evs = events.get("h")!;
    const eutectic = evs.find((e) => e.kind === "eutectic")!;
    const { params } = PRESETS.find((p) => p.id === "h")!;
    expect(invariantAt(evs, eutectic.T + 5e-4)).toBe(eutectic);
    expect(invariantAt(evs, eutectic.T + 0.01)).toBeNull();
    const at = touchingXs(fieldsAt(params, eutectic.T, evs));
    expect([...invariantTouches(at, eutectic)].map((t) => t.phase)).toEqual(["S", "L", "S"]);
    // Two of the three, as off the invariant, are not enough.
    expect(invariantTouches(at.slice(0, 2), eutectic).size).toBe(0);
    expect(invariantTouches(at, null).size).toBe(0);
  });
});
