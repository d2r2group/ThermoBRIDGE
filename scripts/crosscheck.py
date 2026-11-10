"""Cross-checks ThermoBRIDGE's phase diagrams against pycalphad (plan §9 phases 2 and 12).

Every system of the app is exactly a CALPHAD system: pure liquids as the reference, pure solids
at G = -dh + ds*T, and the regular solution as the zeroth Redlich-Kister term. A line compound is
a stoichiometric phase GAMMA (A)_{1-Xc}(B)_{Xc}, and a compound with a range a substitutional
GAMMA whose end members lie a(T) and b(T) above the pure solids. This script runs
scripts/exportSystems.mjs, writes each system as a TDB database, and checks with pycalphad

- each event: the phases at the event's composition 0.5 K below and above it (10 K at a critical
  point) must be the app's. Close to an invariant pycalphad's minimiser can miss the stable
  phases; a check that fails there is repeated at twice the distance and, if it then agrees,
  reported as a note rather than a failure;
- the tie lines at a few temperatures: pycalphad's phase compositions at each tie line's middle
  must match the app's ends within 1e-3.

It is a development check, run by hand and not in CI. From the ThermoBRIDGE directory:

    uvx --with pycalphad python scripts/crosscheck.py

It exits with status 1 if any check fails.
"""

import datetime
import json
import pathlib
import subprocess
import sys
import warnings

import numpy as np
import pycalphad
from pycalphad import Database, equilibrium
from pycalphad import variables as v

HERE = pathlib.Path(__file__).resolve().parent
COMPONENTS = ["A", "B", "VA"]
SHORT = {"LIQUID": "L", "SOLID": "S", "GAMMA": "C"}
# The gas constant, J/(mol K), as in src/physics/gibbs.ts.
R = 8.314462618
# Composition sets closer than this are one phase, and phases with less than this amount absent.
SAME_X = 1e-4
MIN_NP = 1e-8
X_TOL = 1e-3


def phases(params):
    """The phases of the system's database."""
    return ["LIQUID", "SOLID"] + (["GAMMA"] if params.get("compound") else [])


def linear(c0, c1):
    """c0 + c1*T as a TDB expression."""
    return f"{c0!r}{c1:+.17g}*T"


def gamma(params):
    """The compound's lines of the TDB database (plan §9 phase 12, CALPHAD form)."""
    c = params.get("compound")
    if not c:
        return ""
    dha = params["TmA"] * params["dsA"]
    dhb = params["TmB"] * params["dsB"]
    xc, dhf, dsf = c["Xc"], c["dhf"] * 1000, c["dsf"]
    if c["width"] == "line":
        g0 = -(1 - xc) * dha - xc * dhb + dhf
        g1 = (1 - xc) * params["dsA"] + xc * params["dsB"] - dsf
        return f"""PHASE GAMMA % 2 {1 - xc!r} {xc!r} !
CONSTITUENT GAMMA :A:B: !
PARAMETER G(GAMMA,A:B;0) 1 {linear(g0, g1)}; 10000 N !
"""
    alpha = c["alphaG"] * 1000
    a0 = dhf - alpha * xc**2
    a1 = -(dsf + R * np.log(1 - xc))
    b0 = dhf - alpha * (1 - xc) ** 2
    b1 = -(dsf + R * np.log(xc))
    return f"""PHASE GAMMA % 1 1 !
CONSTITUENT GAMMA :A,B: !
PARAMETER G(GAMMA,A;0) 1 {linear(-dha + a0, params["dsA"] + a1)}; 10000 N !
PARAMETER G(GAMMA,B;0) 1 {linear(-dhb + b0, params["dsB"] + b1)}; 10000 N !
PARAMETER L(GAMMA,A,B;0) 1 {alpha!r}; 10000 N !
"""


def tdb(params):
    """The system as a TDB database, in J/mol."""
    dha = params["TmA"] * params["dsA"]
    dhb = params["TmB"] * params["dsB"]
    return f"""
ELEMENT /-   ELECTRON_GAS 0 0 0 !
ELEMENT VA   VACUUM 0 0 0 !
ELEMENT A    BLANK 0 0 0 !
ELEMENT B    BLANK 0 0 0 !
TYPE_DEFINITION % SEQ * !
PHASE LIQUID % 1 1 !
CONSTITUENT LIQUID :A,B: !
PHASE SOLID % 1 1 !
CONSTITUENT SOLID :A,B: !
PARAMETER G(LIQUID,A;0) 1 0; 10000 N !
PARAMETER G(LIQUID,B;0) 1 0; 10000 N !
PARAMETER G(SOLID,A;0) 1 {-dha!r}+{params["dsA"]!r}*T; 10000 N !
PARAMETER G(SOLID,B;0) 1 {-dhb!r}+{params["dsB"]!r}*T; 10000 N !
PARAMETER L(LIQUID,A,B;0) 1 {params["alphaL"] * 1000!r}; 10000 N !
PARAMETER L(SOLID,A,B;0) 1 {params["alphaS"] * 1000!r}; 10000 N !
""" + gamma(params)


def phase_sets(db, names, xs, T):
    """For each X at T: the stable phases as (short name, X_B) pairs, X increasing."""
    eq = equilibrium(db, COMPONENTS, names, {v.X("B"): xs, v.T: T, v.P: 101325, v.N: 1})
    names = eq.Phase.values.reshape(len(xs), -1)
    amounts = eq.NP.values.reshape(len(xs), -1)
    comps = eq.X.sel(component="B").values.reshape(len(xs), -1)
    out = []
    for row_names, row_np, row_x in zip(names, amounts, comps):
        found = []
        for name, amount, x in zip(row_names, row_np, row_x):
            if not name or not amount > MIN_NP:
                continue
            short = SHORT[str(name)]
            if any(p == short and abs(px - x) < SAME_X for p, px in found):
                continue
            found.append((short, float(x)))
        out.append(sorted(found, key=lambda p: p[1]))
    return out


def check(system):
    db = Database(tdb(system["params"]))
    names = phases(system["params"])
    failures = []
    notes = []
    events_ok = 0
    for e in system["eventChecks"]:
        for side in ("below", "above"):

            def agrees(point):
                [got] = phase_sets(db, names, [e["X"]], point["T"])
                return sorted(p for p, _ in got) == sorted(point["phases"]), got

            ok, got = agrees(e[side])
            if ok:
                events_ok += 1
                continue
            label = f"{e['kind']} {e['T']:.3f} K, {side} at X = {e['X']:.4g}"
            wide_ok, _ = agrees(e["wider"][side])
            if wide_ok:
                events_ok += 1
                notes.append(
                    f"{label}: agrees at {abs(e['wider'][side]['T'] - e['T']):g} K, "
                    f"not at {abs(e[side]['T'] - e['T']):g} K (pycalphad gave {got or 'no result'})"
                )
            else:
                want = "+".join(sorted(e[side]["phases"]))
                failures.append(f"{label}: app {want}, pycalphad {got or 'no result'}")
    worst = 0.0
    ties = 0
    for row in system["tieChecks"]:
        if not row["ties"]:
            continue
        mids = [0.5 * (t[0]["X"] + t[1]["X"]) for t in row["ties"]]
        for tie, got in zip(row["ties"], phase_sets(db, names, mids, row["T"])):
            want = [(e["phase"], e["X"]) for e in tie]
            ties += 1
            if [p for p, _ in got] != [p for p, _ in want]:
                failures.append(
                    f"tie line at {row['T']:.1f} K: app {want}, pycalphad {got}"
                )
                continue
            diff = max(abs(g[1] - w[1]) for g, w in zip(got, want))
            worst = max(worst, diff)
            if diff > X_TOL:
                failures.append(f"tie line at {row['T']:.1f} K differs by {diff:.2e} in X")
    return events_ok, 2 * len(system["eventChecks"]), ties, worst, failures, notes


def main():
    exported = subprocess.run(
        ["node", str(HERE / "exportSystems.mjs")],
        check=True,
        capture_output=True,
        text=True,
        cwd=HERE.parent,
    ).stdout
    systems = json.loads(exported)
    print(f"pycalphad {pycalphad.__version__}, {datetime.date.today().isoformat()}")
    print(f"{'system':<8}{'events':>10}{'tie lines':>11}{'max |dX|':>11}")
    failed = False
    for system in systems:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            ok, total, ties, worst, failures, notes = check(system)
        print(f"{system['id']:<8}{f'{ok}/{total}':>10}{ties:>11}{worst:>11.1e}")
        for n in notes:
            print(f"    note {n}")
        for f in failures:
            print(f"    FAIL {f}")
        failed = failed or bool(failures)
    print("all checks pass" if not failed else "some checks FAILED")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    np.seterr(all="ignore")
    main()
