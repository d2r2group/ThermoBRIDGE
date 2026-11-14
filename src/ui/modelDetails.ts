// Adapted from pTerrain's ui/modelDetails.ts.
//
// The footer and the Model Details overlay (plan §8 row 22): a link to the group's site, a link
// to the source on GitHub and a button that opens a modal <dialog> with the model, condensed from
// plan §2–§3. The math is written in TeX in tagged templates, tex (inline) and display, which
// scripts/renderMath.mjs renders to SVG beforehand (src/assets/math.json), so the page loads no
// math library or font. A template is its own key in math.json, so long formulas stay on one line.
// The preset table is built from presets.ts, so its numbers cannot drift from the model.

import MATH from "../assets/math.json";
import {
  ALPHA_G_MIN,
  ALPHA_LIMIT,
  DHF_LIMITS,
  DSF_LIMITS,
  T_LIMIT,
  XC_LIMITS,
} from "../physics/validity";
import { COARSE_STEP } from "../physics/events";
import { PRESETS, type Preset } from "../physics/presets";
import {
  ALPHA_MAX,
  ALPHA_STEP,
  ALPHA_TMAX,
  ALPHA_TMIN,
  DHF_MAX,
  DHF_MIN,
  DHF_STEP,
  DSF_MAX,
  DSF_MIN,
  TMB_MAX,
  TMB_MIN,
  TMB_STEP,
  XC_STOPS,
} from "./alphaPoint";
import { MARKER_LEGEND, markerSvg } from "./diagram/eventMarkers";
import { signed } from "./format";
import { GLOBE, icon } from "./icons";
import { createOverlay } from "./overlay";
import { createRepoLink } from "./repoLink";

/** A formula as rendered by scripts/renderMath.mjs; `npm run math` adds new ones. */
function rendered(mode: "tex" | "display", strings: TemplateStringsArray): string {
  const svg = (MATH.math as Record<string, string>)[`${mode}:${strings.raw[0]}`];
  if (svg === undefined)
    throw new Error(`ThermoBRIDGE: run \`npm run math\` for ${strings.raw[0]}`);
  return svg;
}

/** Inline math, in TeX. No interpolation: the renderer reads the template from this file. */
function tex(strings: TemplateStringsArray): string {
  return rendered("tex", strings);
}

/** Display math, in TeX, on a line of its own. */
function display(strings: TemplateStringsArray): string {
  return `<div class="equation">${rendered("display", strings)}</div>`;
}

/** The columns of the preset table: each input as the overlay writes it, and its unit, if any. */
const COLUMNS = [
  ["TmB", tex`T_{\mathrm{m,B}}`, "K"],
  ["alphaL", tex`\alpha_\mathrm{l}`, "kJ/mol"],
  ["alphaS", tex`\alpha_\mathrm{s}`, "kJ/mol"],
  ["Xc", tex`X_\mathrm{c}`, ""],
  ["dhf", tex`\Delta h_\mathrm{f}`, "kJ/mol"],
  ["dsf", tex`\Delta s_\mathrm{f}`, "J/(mol·K)"],
  ["alphaG", tex`\alpha_\gamma`, "kJ/mol"],
] as const;

/**
 * A preset's value in the table's column `key`: T_m,B and X_c as they are, the rest signed; the
 * compound's "—" without one, and α_γ "line" for a line compound.
 */
function cellText(p: Preset, key: (typeof COLUMNS)[number][0]): string {
  if (key === "TmB") return String(p.params.TmB);
  if (key === "alphaL" || key === "alphaS") return signed(p.params[key]);
  const c = p.params.compound;
  if (!c) return "—";
  if (key === "Xc") return String(c.Xc);
  if (key === "alphaG" && c.width === "line") return "line";
  return signed(c[key]);
}

/**
 * The presets as an HTML table, one row per preset in menu order, with T_m,B, α_l, α_s and the
 * compound's X_c, Δh_f, Δs_f and α_γ. The inputs every preset shares are given in the text above
 * the table.
 */
export function presetTable(): string {
  const head = COLUMNS.map(
    ([, symbol, unit]) =>
      `<th scope="col">${symbol}${unit ? ` <span class="unit">(${unit})</span>` : ""}</th>`,
  ).join("");
  const rows = PRESETS.map((p) => {
    const cells = COLUMNS.map(([key]) => {
      const text = cellText(p, key);
      return `<td><span class="value" data-preset="${p.id}" data-key="${key}">${text}</span></td>`;
    }).join("");
    return `<tr><th scope="row">${p.label}</th>${cells}</tr>`;
  });
  return (
    '<div class="table-scroll"><table class="preset-table">' +
    `<thead><tr><th scope="col">Preset</th>${head}</tr></thead>` +
    `<tbody>${rows.join("")}</tbody></table></div>`
  );
}

/** The legend of the diagram's event markers, as a table: marker, name, reaction on cooling. */
export function markerLegend(): string {
  const rows = MARKER_LEGEND.map(
    ([style, name, reaction]) =>
      `<tr><td>${markerSvg(style)}</td><th scope="row">${name}</th><td>${reaction}</td></tr>`,
  );
  return (
    '<div class="table-scroll"><table class="preset-table marker-legend">' +
    '<thead><tr><th scope="col">Marker</th><th scope="col">Event</th>' +
    '<th scope="col">On cooling</th></tr></thead>' +
    `<tbody>${rows.join("")}</tbody></table></div>`
  );
}

/**
 * The overlay's body: 1 Gibbs energies, 2 Common tangents and the diagram, 3 An intermediate
 * compound, 4 The slice panel, 5 The α mode, 6 Presets, 7 Limits, 8 Numerics, and a note on how
 * it was made.
 */
export function modelDetailsHtml(): string {
  return `
<section>
  <h3>Gibbs energies</h3>
  <p>The system has two components, A and B, and two phases, liquid and solid, each a regular
  solution, and optionally an intermediate compound (below). The pure liquids are the reference, so ${tex`g^\circ_{\mathrm{l},i} = 0`} at every
  ${tex`T`}. With a constant entropy of fusion ${tex`\Delta s_i`} and no
  ${tex`\Delta c_p`} of fusion, the pure solids lie at</p>
  ${display`\Delta g^\circ_i(T) = g^\circ_{\mathrm{s},i} - g^\circ_{\mathrm{l},i} = \Delta s_i\,(T - T_{\mathrm{m},i}), \qquad i = \mathrm{A}, \mathrm{B},`}
  <p>so ${tex`\Delta h_i = T_{\mathrm{m},i}\,\Delta s_i`}. With ${tex`X = X_\mathrm{B}`}, the
  molar Gibbs energies of the two phases are</p>
  ${display`\begin{aligned} g_\mathrm{l}(X, T) &= \alpha_\mathrm{l}\,X(1 - X) + g_\mathrm{id}(X, T), \\ g_\mathrm{s}(X, T) &= (1 - X)\,\Delta g^\circ_\mathrm{A} + X\,\Delta g^\circ_\mathrm{B} + \alpha_\mathrm{s}\,X(1 - X) + g_\mathrm{id}(X, T), \end{aligned}`}
  <p>with the ideal mixing term</p>
  ${display`g_\mathrm{id}(X, T) = RT\,\left[X \ln X + (1 - X) \ln(1 - X)\right].`}
  <p>The interaction parameter ${tex`\alpha`} is independent of ${tex`T`}. With
  ${tex`\alpha > 0`} unlike neighbours are favoured less than like ones, a tendency to unmix;
  with ${tex`\alpha < 0`} they are favoured more. A phase with ${tex`\alpha > 0`} has, on its
  own, a miscibility gap below its critical point</p>
  ${display`T_\mathrm{c} = \frac{\alpha}{2R}, \qquad X_\mathrm{c} = \tfrac{1}{2},`}
  <p>1804 K for ${tex`\alpha = 30`} kJ/mol. The linear terms of ${tex`g_\mathrm{s}`} do not move
  its gap, so both domes are symmetric. The curvature</p>
  ${display`g'' = -2\alpha + \frac{RT}{X(1 - X)}`}
  <p>vanishes on the spinodal, ${tex`X(1 - X) = RT/(2\alpha)`}, drawn dotted on the diagram.</p>
</section>
<section>
  <h3>Common tangents and the diagram</h3>
  <p>The chemical potentials at a point of a curve are where its tangent meets the two sides of
  the plot:</p>
  ${display`\mu_\mathrm{A} = g - X g', \qquad \mu_\mathrm{B} = g + (1 - X)\, g'.`}
  <p>Two compositions are in equilibrium when they share a tangent, so that both
  ${tex`\mu_\mathrm{A}`} and ${tex`\mu_\mathrm{B}`} are equal there. At each ${tex`T`} the
  stable state is the lower convex envelope of ${tex`g_\mathrm{l}`} and ${tex`g_\mathrm{s}`}
  (and of the compound, when there is one):
  where it follows a curve, one phase is stable; where it follows a common tangent, a mixture of
  the two phases at its touching points. Those touching points, traced over ${tex`T`}, are the
  boundaries of the diagram: liquidus, solidus and solvus.</p>
  <p>Three phases are in equilibrium when one tangent touches all three, which fixes
  ${tex`T`} as well: an invariant. On cooling, a liquid between two solids gives a
  <em>eutectic</em> (L → α + β), a liquid between a solid and a second liquid a
  <em>monotectic</em> (L₁ → S + L₂), a solid that forms from a liquid and a solid on either side
  a <em>peritectic</em> (L + β → α), and one that forms from two liquids a <em>syntectic</em>
  (L₁ + L₂ → S). Where an L + S tie line shrinks to a point inside the diagram, the liquidus and
  solidus touch at a melting dip or peak (a congruent minimum or maximum).</p>
  <p>For an overall composition ${tex`X_0`} on a tie line from ${tex`X_1`} to ${tex`X_2`}, the
  lever rule gives the share of each phase:</p>
  ${display`f_1 = \frac{X_2 - X_0}{X_2 - X_1}, \qquad f_2 = \frac{X_0 - X_1}{X_2 - X_1}.`}
</section>
<section>
  <h3>An intermediate compound</h3>
  <p>An optional third phase ${tex`\gamma`} sits at the composition ${tex`X_\mathrm{c}`}. It is
  measured from the line through the pure solids,
  ${tex`r_\mathrm{s}(X, T) = (1 - X)\,\Delta g^\circ_\mathrm{A} + X\,\Delta g^\circ_\mathrm{B}`},
  and at ${tex`X_\mathrm{c}`} lies</p>
  ${display`F(T) = \Delta h_\mathrm{f} - T\,\Delta s_\mathrm{f}`}
  <p>below it, with ${tex`\Delta h_\mathrm{f}`} and ${tex`\Delta s_\mathrm{f}`} its
  enthalpy and entropy of formation from the pure solids. A <em>line compound</em> (a
  daltonide) has no composition range: it is one point, at ${tex`r_\mathrm{s}(X_\mathrm{c}, T) + F(T)`}, drawn as
  a vertical line on the diagram and named by its formula (AB for ${tex`X_\mathrm{c} = 1/2`},
  AB₂ for 2/3). A <em>compound with a range</em> (a berthollide), named ${tex`\gamma`}, is a third regular
  solution with ${tex`\alpha_\gamma < 0`},</p>
  ${display`g_\gamma(X, T) = (1 - X)\,(\Delta g^\circ_\mathrm{A} + a) + X\,(\Delta g^\circ_\mathrm{B} + b) + \alpha_\gamma\,X(1 - X) + g_\mathrm{id}(X, T),`}
  <p>whose end members</p>
  ${display`\begin{aligned} a(T) &= \Delta h_\mathrm{f} - \alpha_\gamma X_\mathrm{c}^2 - T\,\bigl[\Delta s_\mathrm{f} + R \ln(1 - X_\mathrm{c})\bigr], \\ b(T) &= \Delta h_\mathrm{f} - \alpha_\gamma (1 - X_\mathrm{c})^2 - T\,\bigl[\Delta s_\mathrm{f} + R \ln X_\mathrm{c}\bigr] \end{aligned}`}
  <p>put the minimum of ${tex`g_\gamma - r_\mathrm{s}`} at ${tex`X_\mathrm{c}`}, with the value
  ${tex`F(T)`}. A more negative ${tex`\alpha_\gamma`} gives a narrower field, and the line
  compound is its limit. This ${tex`\gamma`} is a random solution, a stand-in for an ordered
  compound: its curvature at ${tex`X_\mathrm{c}`},
  ${tex`-2\alpha_\gamma + RT/\bigl(X_\mathrm{c}(1 - X_\mathrm{c})\bigr)`}, takes the place of
  the stiffness that a sublattice model of the ordering would give.</p>
  <p>With the compound, one tangent can touch the solid twice and ${tex`\gamma`} once, so
  invariants without liquid appear. On cooling: a <em>eutectoid</em> (γ → α + β), a
  <em>peritectoid</em> (α + β → γ), a <em>monotectoid</em> (α₂ → α₁ + γ) and a
  <em>metatectic</em> (β → L + γ). The compound melts congruently, at a maximum, or
  incongruently, at a peritectic (L + β → γ), and it can dissolve into a solid without a gap at a
  <em>congruent transformation</em>, marked by an open diamond. Beside the compound the solid
  is α on A's side and β on B's side when it has a miscibility gap, stable or not, and α on both
  sides when it has none.</p>
  <p>On the diagram a marker sits on each invariant's middle phase, the one that splits or forms
  on cooling: ▼ where one phase splits into two, ▲ where two form one, coloured by the name's
  prefix, filled for a <em>-tectic</em>, with liquid, and open for a <em>-tectoid</em>, all
  solid. The critical and congruent points are marked in the lines' colour, filled where the
  liquid takes part. With the cut on an invariant, the three touching points in the slice panel
  carry the same marker, and the area under their tangent is hatched in its colour.</p>
  ${markerLegend()}
</section>
<section>
  <h3>The slice panel</h3>
  <p>Subtracting a straight line in ${tex`X`} from both curves keeps every common tangent, every
  touching point and which curve is lower. The panel plots</p>
  ${display`\Delta g^{M{,}r}(X, T) = g(X, T) - r(X, T),`}
  <p>for each phase, with ${tex`r`} the line through the lower of the two pure phases at each
  end,</p>
  ${display`r(X, T) = (1 - X) \min(0, \Delta g^\circ_\mathrm{A}) + X \min(0, \Delta g^\circ_\mathrm{B}).`}
  <p>The ${tex`r`} in the superscript marks the reference. The Gibbs energy of mixing
  ${tex`\Delta g^M`} of a phase is measured from the pure components in that same phase;
  ${tex`\Delta g^{M{,}r}`} is measured from ${tex`r`}, the pure components in whichever phase
  is stable at ${tex`T`}, the same reference for both curves. The two agree for a phase whose own pure components are the stable
  ones at both ends: for the liquid above both melting points, and for the solid below both.
  Otherwise the curve lies above its own ${tex`\Delta g^M`} by a straight line in
  ${tex`X`}, ${tex`x_i\,|\Delta g^\circ_i|`} for each end ${tex`i`} where the other phase is
  stable, with ${tex`x_\mathrm{A} = 1 - X`} and
  ${tex`x_\mathrm{B} = X`}.</p>
  <p>Each ${tex`\min`} picks whichever pure phase is stable at ${tex`T`}, so ${tex`r`} is chosen
  such that the stable envelope is pinned at 0: the stable phase at each end, ${tex`X = 0`} and
  ${tex`X = 1`}, sits at exactly 0, and the envelope bows below 0 in between. Against the pure
  liquids instead, the solid's curve and its tangents would tilt by
  ${tex`\Delta g^\circ_\mathrm{B} - \Delta g^\circ_\mathrm{A}`}, and a shallow tangent would be
  hard to see. The ${tex`\Delta g^{M{,}r}`} axis is fitted to the cut: with ${tex`m`} the
  lowest point of the envelope and ${tex`d = \max(|m|, 0.2\ \mathrm{kJ/mol})`}, it runs from
  ${tex`m - 0.1\,d`} to ${tex`0.5\,d`}, so the construction stays readable at every
  temperature, though depths cannot be compared between cuts.</p>
</section>
<section>
  <h3>The α mode</h3>
  <p>The α mode moves through the systems of one pair of components rather than through one
  system. It keeps the presets' components, ${tex`T_{\mathrm{m,A}} = 800`} K,
  ${tex`\Delta s_\mathrm{A} = \Delta s_\mathrm{B} = 10`} J/(mol·K). Only
  ${tex`\alpha_\mathrm{s}`} and ${tex`\alpha_\mathrm{l}`}, from −${ALPHA_MAX} to +${ALPHA_MAX}
  kJ/mol in steps of ${ALPHA_STEP}, and ${tex`T_{\mathrm{m,B}}`}, from ${TMB_MIN} to ${TMB_MAX} K
  in steps of ${TMB_STEP} K, change, and, with <i>Line Compound</i> ticked, a line compound's
  ${tex`X_\mathrm{c}`}, on the ${XC_STOPS.length} stops with whole-number formulas from A₉B to
  AB₉, ${tex`\Delta h_\mathrm{f}`}, from −${-DHF_MIN} to +${DHF_MAX} kJ/mol, and
  ${tex`\Delta s_\mathrm{f}`}, from −${-DSF_MIN} to +${DSF_MAX} J/(mol·K), both in steps of
  ${DHF_STEP}. ${tex`\Delta h_\mathrm{f}`} alone gives congruent and incongruent melting;
  ${tex`\Delta s_\mathrm{f}`} adds the eutectoid, the peritectoid and the congruent
  transformations; ${tex`X_\mathrm{c} \ne \tfrac{1}{2}`} the metatectic and the monotectoid.
  ${tex`\Delta s_\mathrm{f}`} stays below ${tex`\Delta s_\mathrm{A}`} and
  ${tex`\Delta s_\mathrm{B}`}, so the compound always melts. A compound with a range is not
  used in the α mode, and is dropped on entering it. ${tex`T_{\mathrm{m,B}}`} stays above
  ${tex`T_{\mathrm{m,A}}`}, so B is the higher-melting component, as in every preset; with the
  two melting points equal the diagram cannot be computed. Peritectics need the melting points
  far apart: on the axes from about 1800 K, off them from about 1000 K with both α positive.
  The window runs from ${ALPHA_TMIN} K to ${ALPHA_TMAX} K, which holds every liquid dome on the
  pad, or to 100 K above ${tex`T_{\mathrm{m,B}}`} where that is higher. It changes with
  ${tex`T_{\mathrm{m,B}}`} only, so the knob moves through diagrams on one scale; a melting
  peak above the window's top, with ${tex`\alpha_\mathrm{l}`} positive and
  ${tex`\alpha_\mathrm{s}`} negative, is cut off. While the knob moves,
  a coarser diagram, scanned every ${COARSE_STEP} K, is drawn without its field labels and
  points' names; the full diagram replaces it once the knob rests.</p>
</section>
<section>
  <h3>Exporting</h3>
  <p><i>TDB</i> saves the system as a CALPHAD database in J/mol: the pure liquids are the
  reference, the pure solids lie at ${tex`G = -\Delta h_i + \Delta s_i T`} with
  ${tex`\Delta h_i = T_{\mathrm{m},i}\,\Delta s_i`}, and each ${tex`\alpha`} is the zeroth
  Redlich–Kister term ${tex`L(\varphi, \mathrm{A}, \mathrm{B}; 0)`} of LIQUID or SOLID, each
  with two composition sets for a miscibility gap. A line compound is a stoichiometric GAMMA
  with sites ${tex`1 - X_\mathrm{c}`} and ${tex`X_\mathrm{c}`}; a compound with a range is a
  substitutional GAMMA whose end members lie above the pure solids so that its curve passes
  ${tex`\Delta h_\mathrm{f} - T\,\Delta s_\mathrm{f}`} below them at
  ${tex`X_\mathrm{c}`}. The elements are named from the components (upper-cased, at most two
  letters, else A and B); the file's header maps them back and holds the share link. The file
  was checked with pycalphad; other programs have not been tried. <i>Figure</i> saves three SVG
  or PNG images in the light theme: both plots as on screen, the diagram alone with its
  ${tex`X_\mathrm{B}`} numbers, and the slice panel alone with its ${tex`X_\mathrm{B}`} axis
  at the bottom and the touching points' values under it; the single plots leave out the
  guide lines. The SVG names Lato and keeps its text as text; the PNG, at 3× the size,
  embeds it. Each export is a ZIP with the system's JSON file, which Import opens; each file
  carries the share link, with the cut and ${tex`X_0`}. With <i>Series of cuts</i> ticked,
  the images are saved at each distinct cut, from the top of the window down: one in the middle
  of each band of temperatures between the melting, critical and congruent points and the
  invariants, over which the phases along the cut stay the same, and one at each invariant. In the α mode both export the system
  as the Δg<sup>M</sup> mode would show it.</p>
</section>
<section>
  <h3>Presets</h3>
  <p>The presets are grouped by what the solutions do. With both ideal the diagram is a lens.
  With an ideal solid and a non-ideal liquid the solid still mixes fully, and the lens has a
  melting dip below both melting points or a melting peak above them. A solid miscibility gap
  gives a dome below such a dip, as in Au–Ni, or, where it meets the solidus, a eutectic,
  which turns peritectic as the melting points move apart. A liquid miscibility gap as well
  adds a monotectic above a eutectic or peritectic, or a syntectic, where the solid lies
  between the two liquids. The last nine add an intermediate compound, at
  ${tex`X_\mathrm{c} = 1/2`} to the Eutectic, the Syntectic or the Ideal lens, in the
  Metatectic at 0.75 with ${tex`T_{\mathrm{m,B}} = 1800`} K, and in the Monotectoid at 0.9
  beside the Syntectic's solid dome: a line compound unless ${tex`\alpha_\gamma`} is given. Every preset has
  ${tex`T_{\mathrm{m,A}} = 800`} K and
  ${tex`\Delta s_\mathrm{A} = \Delta s_\mathrm{B} = 10`} J/(mol·K).</p>
  ${presetTable()}
  <p>The computed diagrams of the presets and of an 18-system grid of α pairs (seven of the
  presets among them) were cross-checked against pycalphad 0.11.2 (November 2026).</p>
</section>
<section>
  <h3>Limits</h3>
  <ul>
    <li>Both phases are symmetric regular solutions with ${tex`T`}-independent
    ${tex`\alpha`}, with at most one intermediate compound and no second solid structure.
    Without the compound a tangent touches the solid's curve at most twice, so every invariant
    involves the liquid; the eutectoids, peritectoids, monotectoids and metatectics need the
    compound. A compound with a range is a random solution standing in for an ordered one; there
    are no sublattice models.</li>
    <li>Syntectics appear only where the liquid's gap rises far above both melting points,
    as in the Syntectic preset.</li>
    <li>With equal entropies of fusion, a peritectic stays within about 100 K above
    ${tex`T_{\mathrm{m,A}}`}. Subregular solutions would be needed for peritectics midway between
    the melting points.</li>
    <li>Metastable miscibility domes are not drawn. The metastable lines are the
    boundaries with liquid at one end (L + S, and L + γ with a compound) carried past each
    invariant, dashed, and the spinodals, dotted: below the liquidus
    only, and the solid's only in fields without liquid.</li>
    <li>An edited system is applied only if it passes these checks:
      <ul>
        <li>${tex`T_{\mathrm{m,A}}`}, ${tex`T_{\mathrm{m,B}}`}, ${tex`\Delta s_\mathrm{A}`} and
        ${tex`\Delta s_\mathrm{B}`} are positive, the melting points lie below ${T_LIMIT} K, and
        ${tex`T_\mathrm{max}`} does not exceed it.</li>
        <li>${tex`\alpha_\mathrm{l}`} and ${tex`\alpha_\mathrm{s}`} lie between −${ALPHA_LIMIT}
        and +${ALPHA_LIMIT} kJ/mol.</li>
        <li>${tex`0 < T_\mathrm{min} < T_\mathrm{max}`}, and the window holds both melting
        points.</li>
        <li>A compound lies at ${XC_LIMITS[0]} ≤ ${tex`X_\mathrm{c}`} ≤ ${XC_LIMITS[1]}, with
        ${tex`\Delta h_\mathrm{f}`} between −${-DHF_LIMITS[0]} and +${DHF_LIMITS[1]} kJ/mol,
        ${tex`\Delta s_\mathrm{f}`} between −${-DSF_LIMITS[0]} and +${DSF_LIMITS[1]} J/(mol·K)
        and below
        ${tex`(1 - X_\mathrm{c})\,\Delta s_\mathrm{A} + X_\mathrm{c}\,\Delta s_\mathrm{B}`},
        so that it melts, and, with a range, ${tex`\alpha_\gamma`} between −${-ALPHA_G_MIN} and
        0 kJ/mol and ${tex`a, b > 0`} across the window, so that pure ${tex`\gamma`} never
        undercuts a pure solid.</li>
        <li>The whole diagram can be computed: every tie line converges and every event is
        classified. Two events within ${tex`10^{-3}`} K of each other cannot be told apart, and
        such a system is rejected.</li>
      </ul>
    </li>
    <li>Solubilities below ${tex`10^{-9}`} are drawn at the edge and written as
    “&lt; 10⁻⁹”.</li>
  </ul>
</section>
<section>
  <h3>Numerics</h3>
  <p>Both curves are sampled on about 1200 compositions: 800 evenly spaced in
  ${tex`\ln\bigl(X/(1 - X)\bigr)`}, which resolves small solubilities near the pure ends, and
  400 evenly spaced in ${tex`X`}, which resolves the middle. At each ${tex`T`} the lower convex
  hull of the two curves is found by the monotone chain. A hull edge that skips grid points is a candidate tie line: it is
  kept only if Newton's method on the two equal-${tex`\mu`} equations converges to two distinct
  compositions with both curves above the tangent between them, since near a critical point
  rounding alone makes the hull skip points. A gap within one phase is solved in closed form,
  ${tex`\ln\bigl(X/(1 - X)\bigr) = \alpha\,(2X - 1)/RT`}.</p>
  <p>The window is scanned in 1 K steps. Where the sequence of fields changes, the step is
  bisected and the kind of change gives the event: an invariant, from a three-phase Newton
  solve to ${tex`10^{-6}`} K; a critical point at ${tex`\alpha/(2R)`}; a melting dip or peak, from
  ${tex`g_\mathrm{l} = g_\mathrm{s}`} and ${tex`g'_\mathrm{l} = g'_\mathrm{s}`}; or a melting
  point. The tie lines' ends, linked between events, are the boundaries. Each L + S tie line is
  continued past its invariant by Newton steps until it reaches the window's edge or a pure
  component, or an end enters its phase's spinodal.</p>
</section>
<p class="disclaimer">Claude Opus 5.5 (Anthropic) was used in developing this app, in close
iteration under the author's supervision.</p>`;
}

/**
 * The footer after the plots and their controls: a link to d2r2group.com, with a globe, the
 * GitHub link, the Model Details button, which opens the overlay, and the copyright line. Esc, the
 * × button and a click on the backdrop close it, and focus returns to the button.
 */
export function createFooter(container: HTMLElement): void {
  const footer = document.createElement("footer");
  footer.className = "site-footer";
  const link = document.createElement("a");
  link.href = "https://d2r2group.com";
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.innerHTML = `${icon(GLOBE, 14)}d2r2group.com`;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "model-details-button";
  // g(X, T) as a small formula left of the label; hidden from screen readers, so the name stays
  // "Model Details".
  const formula = tex`g(X, T)`;
  button.innerHTML = `<span class="button-math" aria-hidden="true">${formula}</span>Model Details`;
  button.title = "Open how the model works, with its equations and the preset data";
  // The glyphs that every formula references, drawn once, outside the dialog, so that the
  // button's formula has them while the dialog is closed.
  const glyphs = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  glyphs.classList.add("math-glyphs");
  glyphs.setAttribute("aria-hidden", "true");
  glyphs.innerHTML = MATH.defs;
  const copyright = document.createElement("span");
  copyright.className = "copyright";
  copyright.textContent = "2026 © Peter Schindler";
  footer.append(link, createRepoLink(), button, copyright, glyphs);

  container.append(footer);
  createOverlay(container, button, "model-details", "Model details", modelDetailsHtml());
}
