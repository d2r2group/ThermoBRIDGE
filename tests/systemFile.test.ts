import { describe, expect, it } from "vitest";
import { autoWindow } from "../src/physics/autoWindow";
import { preset, PRESETS, type PresetId } from "../src/physics/presets";
import { DEFAULT_COMPONENTS, Store } from "../src/ui/state";
import { cleanComponent } from "../src/ui/systemFields";
import {
  cleanName,
  fileName,
  parseLink,
  parseSystemFile,
  toLink,
  toSystemFile,
  type SystemSpec,
} from "../src/ui/systemFile";

// The system's name, the JSON file and the share link (plan §8 rows 17–19, §9 phase 9).

const ofPreset = (id: PresetId, extra: Partial<SystemSpec> = {}): SystemSpec => {
  const p = preset(id);
  return {
    name: p.label,
    components: DEFAULT_COMPONENTS,
    params: p.params,
    window: p.window,
    auto: false,
    ...extra,
  };
};

/** A custom system with a typed window, numbers that need all their digits, and odd names. */
const typed: SystemSpec = {
  name: "Ag–Cu, mine #2; café",
  components: { A: "Ag,1", B: "Cu;ñ" },
  params: { TmA: 1234.93, TmB: 1357.77, dsA: 9.15, dsB: 9.62, alphaL: -0.000123, alphaS: 33.5 },
  window: { Tmin: 450, Tmax: 1500 },
  auto: false,
};

/** A compound with numbers that need all their digits, of either width. */
const compoundOf = (width: "line" | "range") => ({
  Xc: 0.43,
  dhf: -12.5,
  dsf: 2.25,
  width,
  alphaG: width === "range" ? -80 : -150,
});

/** The file of the default eutectic as an object, to break it one key at a time. */
const fileObject = () => JSON.parse(toSystemFile(ofPreset("h")));
const problemOf = (text: string) => {
  const parsed = parseSystemFile(text);
  return parsed.ok ? null : parsed.problem;
};

describe("system name", () => {
  it("trims, cuts to 40 characters, and applies an empty name as Custom", () => {
    const h = ofPreset("h");
    expect(cleanName("  Water  ", h)).toBe("Water");
    expect(cleanName("   ", h)).toBe("Custom");
    expect(cleanName("x".repeat(50), h)).toBe("x".repeat(40));
  });

  it("cuts by code points, so an emoji at the limit stays whole and the link encodes", () => {
    const h = ofPreset("h");
    const name = cleanName("x".repeat(39) + "🧪🧪", h);
    expect(name).toBe("x".repeat(39) + "🧪");
    expect(() => toLink({ ...h, name })).not.toThrow();
    expect(cleanName("🧪".repeat(41), h)).toBe("🧪".repeat(40));
    const components = { A: cleanComponent("x".repeat(11) + "🧪🧪", "A"), B: "B" };
    expect(components.A).toBe("x".repeat(11) + "🧪");
    expect(() => toLink({ ...h, components })).not.toThrow();
  });

  it("keeps a preset's label, in any case, only on that preset, and marks it elsewhere", () => {
    expect(cleanName("Eutectic", ofPreset("h"))).toBe("Eutectic");
    expect(cleanName(" eUTECTIC ", ofPreset("h"))).toBe("Eutectic");
    expect(cleanName("Eutectic", ofPreset("c"))).toBe("Eutectic (custom)");
    expect(cleanName("eutectic", ofPreset("c"))).toBe("eutectic (custom)");
    const edited = { ...ofPreset("h"), params: { ...preset("h").params, alphaS: 16 } };
    expect(cleanName("Eutectic", edited)).toBe("Eutectic (custom)");
    const renamed = { ...ofPreset("h"), components: { A: "Ag", B: "Cu" } };
    expect(cleanName("Eutectic", renamed)).toBe("Eutectic (custom)");
    // A marked name is no preset's label, so it stays as it is, and the mark fits in 40.
    expect(cleanName("Eutectic (custom)", ofPreset("h"))).toBe("Eutectic (custom)");
    for (const p of PRESETS) {
      const marked = cleanName(p.label, edited);
      expect(marked.length, p.id).toBeLessThanOrEqual(40);
      if (p.id === "h") continue;
      // c7's label is too long to take the mark whole, so it is cut to make room.
      if (p.label.length + " (custom)".length <= 40) {
        expect(marked, p.id).toBe(`${p.label} (custom)`);
      } else {
        expect(marked, p.id).toBe(`${p.label.slice(0, 31).trim()} (custom)`);
      }
    }
    expect(cleanName("Congruent compound", ofPreset("c1"))).toBe("Congruent compound");
    expect(cleanName("Congruent compound", ofPreset("h"))).toBe("Congruent compound (custom)");
  });

  it("is the preset's label in the store after a preset, and Custom otherwise", () => {
    const store = new Store(preset("h"));
    expect(store.state.name).toBe("Eutectic");
    store.setSystem(typed, { name: "Mine" });
    expect(store.state.name).toBe("Mine");
    store.applyPreset("p1");
    expect(store.state.name).toBe("Peritectic");
    expect(new Store(typed).state.name).toBe("Custom");
  });
});

describe("system file", () => {
  it("round-trips the name, components, parameters, window and box", () => {
    const auto = { ...typed, auto: true, window: autoWindow(typed.params) };
    for (const s of [...PRESETS.map((p) => ofPreset(p.id)), typed, auto]) {
      expect(parseSystemFile(toSystemFile(s))).toEqual({ ok: true, value: s });
    }
  });

  it("is pretty-printed JSON in the model's units, with a units map", () => {
    const text = toSystemFile(ofPreset("h"));
    expect(text).toContain('\n  "format": "thermobridge-system",\n  "version": 1,');
    expect(JSON.parse(text)).toEqual({
      format: "thermobridge-system",
      version: 1,
      name: "Eutectic",
      components: { A: "A", B: "B" },
      params: { TmA: 800, TmB: 1200, dsA: 10, dsB: 10, alphaL: 0, alphaS: 15 },
      compound: null,
      window: { Tmin: 300, Tmax: 1500 },
      autoWindow: false,
      units: {
        TmA: "K",
        TmB: "K",
        dsA: "J/(mol·K)",
        dsB: "J/(mol·K)",
        alphaL: "kJ/mol",
        alphaS: "kJ/mol",
        Tmin: "K",
        Tmax: "K",
        Xc: "mole fraction of B",
        dhf: "kJ/mol",
        dsf: "J/(mol·K)",
        alphaG: "kJ/mol",
      },
    });
    // A compound as its five values.
    expect(JSON.parse(toSystemFile(ofPreset("c3"))).compound).toEqual({
      Xc: 0.5,
      dhf: -6,
      dsf: 0,
      width: "range",
      alphaG: -150,
    });
  });

  it("round-trips a compound of each width, and reads a file without one as none", () => {
    const line = { ...typed, params: { ...typed.params, compound: compoundOf("line") } };
    const range = { ...typed, params: { ...typed.params, compound: compoundOf("range") } };
    for (const s of [line, range]) {
      expect(parseSystemFile(toSystemFile(s))).toEqual({ ok: true, value: s });
    }
    // An older file, written before the compound, has no `compound` key.
    const file = fileObject();
    delete file.compound;
    expect(parseSystemFile(JSON.stringify(file))).toEqual({ ok: true, value: ofPreset("h") });
    // A line may leave α_γ out, which it ignores.
    const c1 = JSON.parse(toSystemFile(ofPreset("c1")));
    delete c1.compound.alphaG;
    const parsed = parseSystemFile(JSON.stringify(c1));
    expect(parsed.ok && parsed.value.name).toBe("Congruent compound");
  });

  it("ignores unknown keys and does not read units", () => {
    const file = fileObject();
    file.comment = "made by hand";
    file.params.extra = "x";
    file.units = { alphaL: "J/mol" };
    expect(parseSystemFile(JSON.stringify(file))).toEqual({ ok: true, value: ofPreset("h") });
  });

  it("cleans the names as Apply does", () => {
    const file = fileObject();
    file.name = "  Water  ";
    file.components = { A: "  Ag  ", B: "" };
    expect(parseSystemFile(JSON.stringify(file))).toMatchObject({
      value: { name: "Water", components: { A: "Ag", B: "B" } },
    });
    // With other components the eutectic's label is no longer the preset's.
    file.name = "Eutectic";
    expect(parseSystemFile(JSON.stringify(file))).toMatchObject({
      value: { name: "Eutectic (custom)" },
    });
  });

  it("names the first problem of a malformed file", () => {
    expect(problemOf("{ not json")).toBe("it is not JSON");
    expect(problemOf("[1, 2]")).toBe("it is not a JSON object");
    const cases: [(file: ReturnType<typeof fileObject>) => void, string][] = [
      [(f) => (f.format = "pterrain-substance"), 'its format is not "thermobridge-system"'],
      [(f) => (f.version = 2), "version 2 is not supported"],
      [(f) => delete f.version, "version undefined is not supported"],
      [(f) => (f.name = 3), "its name is not a string"],
      [(f) => delete f.components, "components is missing"],
      [(f) => (f.components.A = null), "components.A is not a string"],
      [(f) => delete f.components.B, "components.B is not a string"],
      [(f) => delete f.params, "params is missing"],
      [(f) => delete f.params.dsB, "params.dsB is missing or not a finite number"],
      [(f) => (f.params.alphaL = "0"), "params.alphaL is missing or not a finite number"],
      [(f) => (f.window = [300, 1500]), "window is missing"],
      [(f) => delete f.window.Tmax, "window.Tmax is missing or not a finite number"],
      [(f) => (f.autoWindow = "yes"), "autoWindow is not true or false"],
      [(f) => (f.compound = 3), "compound is not an object or null"],
      [
        (f) => (f.compound = { Xc: 0.5, dhf: -6, dsf: 0 }),
        'compound.width is not "line" or "range"',
      ],
      [
        (f) => (f.compound = { Xc: 0.5, dhf: -6, dsf: 0, width: "lens" }),
        'compound.width is not "line" or "range"',
      ],
      [
        (f) => (f.compound = { Xc: 0.5, dhf: -6, dsf: 0, width: "range" }),
        "compound.alphaG is missing or not a finite number",
      ],
      [
        (f) => (f.compound = { Xc: "0.5", dhf: -6, dsf: 0, width: "line" }),
        "compound.Xc is missing or not a finite number",
      ],
    ];
    for (const [breakIt, problem] of cases) {
      const file = fileObject();
      breakIt(file);
      expect(problemOf(JSON.stringify(file))).toBe(problem);
    }
    // JSON has no Infinity, but a number too large for a double parses as one.
    const huge = toSystemFile(ofPreset("h")).replace('"TmB": 1200', '"TmB": 1e999');
    expect(problemOf(huge)).toBe("params.TmB is missing or not a finite number");
  });

  it("names the download after the system", () => {
    expect(fileName("Peritectic, broad L + β")).toBe("Peritectic_broad_L__β.json");
    expect(fileName("Peritectic and monotectic")).toBe("Peritectic_and_monotectic.json");
    expect(fileName("Ag–Cu (café), α₁!")).toBe("AgCu_cafe_α1.json");
    expect(fileName("my-system_2")).toBe("my-system_2.json");
    expect(fileName("")).toBe("system.json");
    expect(fileName("?!")).toBe("system.json");
  });
});

describe("share link", () => {
  it("round-trips with and without a window and a view", () => {
    const views = [undefined, { cut: 700 }, { cut: 912.5, X0: 0.3 }, { cut: 300, X0: 0 }];
    const systems = [
      typed,
      { ...typed, auto: true, window: autoWindow(typed.params) },
      { ...ofPreset("h"), name: "Custom" },
      { ...ofPreset("k"), name: "Syntectic, mine" },
      ofPreset("m1", { components: { A: "Au", B: "Ni" }, name: "Au–Ni" }),
    ];
    for (const s of systems) {
      for (const view of views) {
        const link = toLink(s, view);
        expect(link).toMatch(/^#[^#;]*(;T,[^#;,]+(;X,[^#;,]+)?)?$/);
        expect(parseLink(link)).toEqual({ ok: true, value: { system: s, view } });
      }
    }
  });

  it("carries a compound of either width after the system, before the view", () => {
    const line = { ...typed, params: { ...typed.params, compound: compoundOf("line") } };
    const range = { ...typed, params: { ...typed.params, compound: compoundOf("range") } };
    expect(toLink(line, { cut: 700 })).toMatch(/,450,1500;C,\.43,-12\.5,2\.25,l;T,700$/);
    expect(toLink(range)).toMatch(/,450,1500;C,\.43,-12\.5,2\.25,-80$/);
    for (const s of [line, range, { ...range, auto: true, window: autoWindow(range.params) }]) {
      for (const view of [undefined, { cut: 700 }, { cut: 700, X0: 0.25 }]) {
        expect(parseLink(toLink(s, view))).toEqual({ ok: true, value: { system: s, view } });
      }
    }
    // A preset with a compound stays its id.
    expect(toLink(ofPreset("c1"), { cut: 700 })).toBe("#c1;T,700");
    expect(toLink(ofPreset("c1", { name: "Mine" }))).toBe(
      "#1,Mine,A,B,800,1200,10,10,0,15,300,1500;C,.5,-6,0,l",
    );
  });

  it("writes numbers in their shortest exact form, without the leading 0", () => {
    expect(toLink(typed)).toBe(
      "#1,Ag%E2%80%93Cu%2C%20mine%20%232%3B%20caf%C3%A9,Ag%2C1,Cu%3B%C3%B1," +
        "1234.93,1357.77,9.15,9.62,-.000123,33.5,450,1500",
    );
    // The view to 4 significant figures.
    expect(toLink(ofPreset("h"), { cut: 700.04, X0: 0.123456 })).toBe("#h;T,700;X,.1235");
  });

  it("gives a preset its id, which parses back to the preset", () => {
    for (const p of PRESETS) {
      expect(toLink(ofPreset(p.id))).toBe(`#${p.id}`);
      expect(parseLink(`#${p.id}`)).toEqual({ ok: true, value: { system: ofPreset(p.id) } });
    }
    expect(toLink(ofPreset("h"), { cut: 700, X0: 0.3 })).toBe("#h;T,700;X,.3");
    expect(parseLink("h;T,700;X,0.3")).toEqual({
      ok: true,
      value: { system: ofPreset("h"), view: { cut: 700, X0: 0.3 } },
    });
    // Another name, other components or an automatic window write the system out.
    expect(toLink(ofPreset("h", { name: "Mine" }))).toBe(
      "#1,Mine,A,B,800,1200,10,10,0,15,300,1500",
    );
    expect(toLink(ofPreset("h", { components: { A: "Ag", B: "B" } }))).toMatch(/^#1,/);
    // The preset's own window counts as the preset, whatever the box says.
    expect(toLink(ofPreset("h", { auto: true }))).toBe("#h");
    const fitted = { auto: true, window: autoWindow(preset("h").params) };
    expect(toLink(ofPreset("h", fitted))).toBe("#1,Eutectic,A,B,800,1200,10,10,0,15");
  });

  it("is short", () => {
    expect(toLink(ofPreset("h"), { cut: 700, X0: 0.3 })).toHaveLength(13);
    const custom = ofPreset("h", { name: "Mine" });
    expect(toLink(custom)).toHaveLength(40);
    expect(toLink({ ...custom, auto: true }, { cut: 700 })).toHaveLength(31 + 6);
  });

  it("names the first problem of a malformed fragment", () => {
    const nums = "800,1200,10,10,0,15";
    const cases: [string, string][] = [
      ["", "it is empty"],
      ["#", "it is empty"],
      ["#2,x,A,B," + nums, "version 2 is not supported"],
      ["#z", 'unknown system "z"'],
      ["#toString", 'unknown system "toString"'],
      ["#i", 'unknown system "i"'],
      ["#h,1", "the preset id h takes no numbers"],
      ["#1,x,A", "it lacks the name and the component names"],
      ["#1,x,A,B,1,2,3", "it has 3 numbers, not 6 or 8"],
      ["#1,x,A,B," + nums + ",1", "it has 7 numbers, not 6 or 8"],
      ["#1,x,A,B," + nums + ",1,2,3", "it has 9 numbers, not 6 or 8"],
      ["#1,x,A,B," + nums.replace("1200", "Infinity"), "TmB is not a finite number"],
      ["#1,x,A,B," + nums.replace("1200", "1e999"), "TmB is not a finite number"],
      ["#1,x,A,B," + nums.replace("1200", ""), "TmB is not a finite number"],
      ["#1,x,A,B," + nums.replace("1200", "0x10"), "TmB is not a finite number"],
      ["#1,x,A,B,800,1200,10,10,0,15,300,abc", "Tmax is not a finite number"],
      ["#1,%E2%82,A,B," + nums, "a name is not encoded right"],
      ["#1,x,%E2,B," + nums, "a name is not encoded right"],
      ["#h;p,700", "its view is not T,<T*>"],
      ["#h;T", "its view is not T,<T*>"],
      ["#h;X,.3", "its view is not T,<T*>"],
      ["#h;T,abc", "the cut is not a finite number"],
      ["#h;T,700;Y,.3", "its lever rule is not X,<X₀>"],
      ["#h;T,700;X", "its lever rule is not X,<X₀>"],
      ["#h;T,700;X,a", "X₀ is not a finite number"],
      ["#h;T,700;X,1.5", "X₀ is not between 0 and 1"],
      ["#h;T,700;X,-.1", "X₀ is not between 0 and 1"],
      ["#h;T,700;X,.3;T,800", "it has more than two ;"],
      ["#1,x,A,B," + nums + ";C,.5,-6,0,l;T,700;X,.3;T,800", "it has more than three ;"],
      ["#1,x,A,B," + nums + ";C,.5,-6,0", "its compound has 3 values, not 4"],
      ["#1,x,A,B," + nums + ";C,.5,-6,0,l,1", "its compound has 5 values, not 4"],
      ["#1,x,A,B," + nums + ";C,.5,-6,0,r", "its compound's width is not l or a number"],
      ["#1,x,A,B," + nums + ";C,.5,abc,0,l", "dhf is not a finite number"],
      ["#c1;C,.5,-6,0,l", "the preset id c1 takes no compound"],
      ["#h;C,.5,-6,0,l;T,700;X,a", "X₀ is not a finite number"],
    ];
    for (const [fragment, problem] of cases) {
      expect(parseLink(fragment), fragment).toEqual({ ok: false, problem });
    }
  });
});
