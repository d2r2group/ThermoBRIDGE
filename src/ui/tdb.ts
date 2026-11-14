// The system as a CALPHAD database (plan §9 phase 20), ported from `tdb()` and `gamma()` in
// scripts/crosscheck.py: pure liquids as the reference, pure solids at G = −Δh + Δs·T, the
// regular solutions as the zeroth Redlich–Kister terms, and a compound as a stoichiometric or a
// substitutional GAMMA, all in J/mol. No DOM here.

import { R } from "../physics/gibbs";
import type { Components } from "./state";
import type { SystemSpec } from "./systemFile";

/** Element names that a TDB file reserves: the electron gas and the vacancy. */
const RESERVED = new Set(["VA", "/-"]);

/**
 * The element names for the two components: each name's letters (after NFKD, so *Ä* gives `A`),
 * upper-cased and cut to two. A name that leaves none, or is reserved, falls back to `A` or `B`,
 * and so does B's if it is A's; if a fallback is then the other's name, both fall back.
 */
export function elementNames(components: Components): { A: string; B: string } {
  const own = (name: string) => {
    const letters = name
      .normalize("NFKD")
      .replace(/[^A-Za-z]/g, "")
      .toUpperCase()
      .slice(0, 2);
    return letters && !RESERVED.has(letters) ? letters : null;
  };
  const A = own(components.A) ?? "A";
  let B = own(components.B);
  if (B === null || B === A) B = "B";
  return A === B ? { A: "A", B: "B" } : { A, B };
}

/** A number as the database writes it: the shortest form of its value to 15 figures. */
function num(x: number): string {
  return String(Number(x.toPrecision(15)));
}

/** c0 + c1·T as a TDB expression. */
function linear(c0: number, c1: number): string {
  const slope = num(c1);
  return `${num(c0)}${slope.startsWith("-") ? "" : "+"}${slope}*T`;
}

/** The gas constant, J/(mol·K). */
const R_J = R * 1000;

/** One PARAMETER line, valid from 1 K to 10 000 K. */
const parameter = (name: string, expression: string) =>
  `PARAMETER ${name} 1 ${expression}; 10000 N !`;

/**
 * A comment line. TDB comments run to the end of the line, so line breaks become spaces, and a
 * reader may end a command at `!` before it strips comments, so `!` is written `%21` (as in a URL,
 * so the link still opens).
 */
const comment = (text: string) => `$ ${text.replace(/[\r\n]+/g, " ").replaceAll("!", "%21")}`;

/**
 * The database of `system`, with a header that names the app, the system, the component of each
 * element, the share link and the date. LIQUID and SOLID each have two composition sets, so
 * that a program that needs them finds a miscibility gap.
 */
export function toTdb(system: SystemSpec, link: string, date = new Date()): string {
  const { params, components } = system;
  const { A, B } = elementNames(components);
  const dhA = params.TmA * params.dsA;
  const dhB = params.TmB * params.dsB;
  const lines = [
    comment("ThermoBRIDGE: Binary Regular-solution Interactive Diagram Generator for Education"),
    comment(`System: ${system.name}`),
    comment(`Element ${A} is component A (${components.A})`),
    comment(`Element ${B} is component B (${components.B})`),
    comment(`Link: ${link}`),
    comment(`Exported ${date.toISOString().slice(0, 10)}; energies in J/mol`),
    "",
    "ELEMENT /-   ELECTRON_GAS 0 0 0 !",
    "ELEMENT VA   VACUUM 0 0 0 !",
    `ELEMENT ${A.padEnd(4)} BLANK 0 0 0 !`,
    `ELEMENT ${B.padEnd(4)} BLANK 0 0 0 !`,
    "",
    "TYPE_DEFINITION % SEQ * !",
    "TYPE_DEFINITION L GES AMEND_PHASE_DESCRIPTION LIQUID COMPOSITION_SETS 2 !",
    "TYPE_DEFINITION S GES AMEND_PHASE_DESCRIPTION SOLID COMPOSITION_SETS 2 !",
    "",
    "PHASE LIQUID %L 1 1 !",
    `CONSTITUENT LIQUID :${A},${B}: !`,
    "PHASE SOLID %S 1 1 !",
    `CONSTITUENT SOLID :${A},${B}: !`,
    "",
    parameter(`G(LIQUID,${A};0)`, "0"),
    parameter(`G(LIQUID,${B};0)`, "0"),
    parameter(`G(SOLID,${A};0)`, linear(-dhA, params.dsA)),
    parameter(`G(SOLID,${B};0)`, linear(-dhB, params.dsB)),
    parameter(`L(LIQUID,${A},${B};0)`, num(params.alphaL * 1000)),
    parameter(`L(SOLID,${A},${B};0)`, num(params.alphaS * 1000)),
  ];
  const c = params.compound;
  if (c) {
    const { Xc } = c;
    const dhf = c.dhf * 1000;
    lines.push("");
    if (c.width === "line") {
      // γ at X_c lies Δh_f − T Δs_f below the line through the pure solids.
      const g0 = -(1 - Xc) * dhA - Xc * dhB + dhf;
      const g1 = (1 - Xc) * params.dsA + Xc * params.dsB - c.dsf;
      lines.push(
        `PHASE GAMMA % 2 ${num(1 - Xc)} ${num(Xc)} !`,
        `CONSTITUENT GAMMA :${A}:${B}: !`,
        parameter(`G(GAMMA,${A}:${B};0)`, linear(g0, g1)),
      );
    } else {
      // A third regular solution whose end members lie a(T) and b(T) above the pure solids, so
      // that its curve at X_c lies F(T) below the line through them (plan §9 phase 12).
      const alpha = c.alphaG * 1000;
      const a0 = dhf - alpha * Xc ** 2;
      const a1 = -(c.dsf + R_J * Math.log(1 - Xc));
      const b0 = dhf - alpha * (1 - Xc) ** 2;
      const b1 = -(c.dsf + R_J * Math.log(Xc));
      lines.push(
        "PHASE GAMMA % 1 1 !",
        `CONSTITUENT GAMMA :${A},${B}: !`,
        parameter(`G(GAMMA,${A};0)`, linear(-dhA + a0, params.dsA + a1)),
        parameter(`G(GAMMA,${B};0)`, linear(-dhB + b0, params.dsB + b1)),
        parameter(`L(GAMMA,${A},${B};0)`, num(alpha)),
      );
    }
  }
  return `${lines.join("\n")}\n`;
}
