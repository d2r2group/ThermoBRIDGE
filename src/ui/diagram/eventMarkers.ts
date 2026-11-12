// The diagram's event markers: one per invariant, critical point, congruent minimum or maximum
// and congruent transformation. An invariant's marker sits on its middle phase, the one that
// splits or forms on cooling; its shape gives the reaction (▼ one phase into two, ▲ two into
// one), its colour the name's prefix (eu-, mono-, meta-, peri-, syn-), and its fill the suffix:
// filled for -tectic, with liquid, open for -tectoid, all solid. The other points are in the
// boundary colour, filled where the liquid takes part: ● a liquid's critical point, ⊙ a solid's,
// ◆ a congruent minimum or maximum, ◇ a congruent transformation.

import { select } from "d3";
import { LIQUID } from "../../physics/gibbs";
import type { DiagramEvent, EventKind } from "../../physics/events";
import type { TieEnd } from "../../physics/hull";
import { formatInvariantT } from "../format";
import type { Layer } from "../marks";

export type MarkerShape = "down" | "up" | "circle" | "circle-dot" | "diamond";
/** The invariants' name prefixes, which give their colours; "point" for the other events. */
export type MarkerFamily = "eu" | "mono" | "meta" | "peri" | "syn" | "point";
/** The invariants' families, each with a `--invariant-${family}` colour. */
export const INVARIANT_FAMILIES = ["eu", "mono", "meta", "peri", "syn"] as const;

export interface MarkerStyle {
  shape: MarkerShape;
  family: MarkerFamily;
  /** Open (filled with the background) when no liquid takes part. */
  open: boolean;
}

const EVENT_STYLES: Partial<Record<EventKind, MarkerStyle>> = {
  eutectic: { shape: "down", family: "eu", open: false },
  eutectoid: { shape: "down", family: "eu", open: true },
  monotectic: { shape: "down", family: "mono", open: false },
  monotectoid: { shape: "down", family: "mono", open: true },
  metatectic: { shape: "down", family: "meta", open: false },
  peritectic: { shape: "up", family: "peri", open: false },
  peritectoid: { shape: "up", family: "peri", open: true },
  syntectic: { shape: "up", family: "syn", open: false },
  minimum: { shape: "diamond", family: "point", open: false },
  maximum: { shape: "diamond", family: "point", open: false },
  congruent: { shape: "diamond", family: "point", open: true },
};

/** An event's marker, or null for one without (a pure component's melting point). */
export function markerStyle(e: DiagramEvent): MarkerStyle | null {
  if (e.kind === "critical") {
    return e.points[0]?.phase === LIQUID
      ? { shape: "circle", family: "point", open: false }
      : { shape: "circle-dot", family: "point", open: true };
  }
  return EVENT_STYLES[e.kind] ?? null;
}

/** The events that get a marker, in their order. */
export function markedPointsOf(events: readonly DiagramEvent[]): DiagramEvent[] {
  return events.filter((e) => markerStyle(e) !== null);
}

/** Where an event's marker goes: an invariant's middle phase, else its first point. */
export function markerPoint(e: DiagramEvent): TieEnd {
  return (e.points.length === 3 ? e.points[1] : e.points[0])!;
}

/** The marker's size, CSS px: the circle's radius, the triangle's and the diamond's half-height. */
const SIZE: Record<MarkerShape, number> = {
  circle: 4,
  "circle-dot": 4.5,
  down: 6.5,
  up: 6.5,
  diamond: 5.5,
};
/** The radius of ⊙'s centre dot, CSS px. */
const DOT_R = 1.25;

const circle = (r: number) => `M${-r},0A${r},${r} 0 1,0 ${r},0A${r},${r} 0 1,0 ${-r},0Z`;

/** The marker's outline about its point, which is the triangle's centroid. */
export function markerPath(shape: MarkerShape): string {
  const r = SIZE[shape];
  const f = (v: number) => Number(v.toFixed(3));
  switch (shape) {
    case "circle":
    case "circle-dot":
      return circle(r);
    case "diamond":
      return `M0,${-r}L${f(r * 0.8)},0L0,${r}L${f(-r * 0.8)},0Z`;
    default: {
      const s = shape === "down" ? 1 : -1;
      const w = f((r * Math.sqrt(3)) / 2);
      return `M0,${f(s * r)}L${w},${f((-s * r) / 2)}L${-w},${f((-s * r) / 2)}Z`;
    }
  }
}

/** The centre dot drawn over the outline: ⊙'s, or none. */
export function markerDotPath(shape: MarkerShape): string {
  return shape === "circle-dot" ? circle(DOT_R) : "";
}

const POINT_NAMES: Partial<Record<EventKind, string>> = {
  minimum: "congruent minimum",
  maximum: "congruent maximum",
  congruent: "congruent transformation",
};

/** The marker's tooltip: "eutectic, 634 K", "critical point of the liquid, 1804 K". */
export function markerTitle(e: DiagramEvent): string {
  const name =
    e.kind === "critical"
      ? `critical point of the ${e.points[0]?.phase === LIQUID ? "liquid" : "solid"}`
      : (POINT_NAMES[e.kind] ?? e.kind);
  return `${name}, ${formatInvariantT(e.T)}`;
}

/**
 * One marker per datum in `layer`, as a group of class `event-point ${cls}` at (x, y), with the
 * event's kind and its style's family and fill as data attributes, holding its halo, its mark,
 * ⊙'s dot (empty for other shapes) and its tooltip (empty without `title`).
 */
export function joinEventMarkers<T>(
  layer: Layer,
  cls: string,
  data: readonly T[],
  style: (d: T) => MarkerStyle,
  x: (d: T) => number,
  y: (d: T) => number,
  attrs: (d: T) => { kind: string; title?: string },
): void {
  layer
    .selectAll<SVGGElement, T>(`g.${cls}`)
    .data(data)
    .join((enter) => {
      const g = enter.append("g").attr("class", `event-point ${cls}`);
      g.append("title");
      g.append("path").attr("class", "halo");
      g.append("path").attr("class", "mark");
      g.append("path").attr("class", "dot");
      return g;
    })
    .each(function (d) {
      const s = style(d);
      const { kind, title } = attrs(d);
      const g = select(this)
        .attr("data-kind", kind)
        .attr("data-family", s.family)
        .attr("data-open", s.open)
        .attr("transform", `translate(${x(d)},${y(d)})`);
      g.select("title").text(title ?? "");
      g.selectAll(".halo, .mark").attr("d", markerPath(s.shape));
      g.select(".dot").attr("d", markerDotPath(s.shape));
    });
}

/**
 * The touching points among `touches` that are the invariant's three phases, in its order, when
 * all three are there (the cut draws its three-phase tangent); else none.
 */
export function invariantTouches<T extends { X: number; phase: string }>(
  touches: readonly T[],
  inv: DiagramEvent | null,
): Set<T> {
  if (!inv) return new Set();
  const found = inv.points.map((p) =>
    touches.find((t) => t.phase === p.phase && Math.abs(t.X - p.X) < 1e-9),
  );
  return found.every((t) => t !== undefined) ? new Set(found as T[]) : new Set();
}

/** The marker as a small inline SVG, for the legend in Model Details. */
export function markerSvg(style: MarkerStyle): string {
  return (
    '<svg class="event-marker-key" viewBox="-9 -9 18 18" aria-hidden="true">' +
    `<g class="event-point" data-family="${style.family}" data-open="${style.open}">` +
    `<path class="halo" d="${markerPath(style.shape)}"/>` +
    `<path class="mark" d="${markerPath(style.shape)}"/>` +
    `<path class="dot" d="${markerDotPath(style.shape)}"/></g></svg>`
  );
}

/** The legend's rows: the marker's style, the event's name and its reaction on cooling. */
export const MARKER_LEGEND: readonly [MarkerStyle, string, string][] = [
  [EVENT_STYLES.eutectic!, "eutectic", "L → α + β"],
  [EVENT_STYLES.eutectoid!, "eutectoid", "γ → α + β"],
  [EVENT_STYLES.monotectic!, "monotectic", "L₁ → S + L₂"],
  [EVENT_STYLES.monotectoid!, "monotectoid", "α₂ → α₁ + γ"],
  [EVENT_STYLES.metatectic!, "metatectic", "β → L + γ"],
  [EVENT_STYLES.peritectic!, "peritectic", "L + β → α"],
  [EVENT_STYLES.peritectoid!, "peritectoid", "α + β → γ"],
  [EVENT_STYLES.syntectic!, "syntectic", "L₁ + L₂ → S"],
  [
    { shape: "circle", family: "point", open: false },
    "critical point of the liquid",
    "L → L₁ + L₂",
  ],
  [
    { shape: "circle-dot", family: "point", open: true },
    "critical point of the solid",
    "α → α₁ + α₂",
  ],
  [EVENT_STYLES.minimum!, "congruent minimum or maximum", "L → S at one composition"],
  [EVENT_STYLES.congruent!, "congruent transformation", "S ⇄ γ at one composition"],
];
