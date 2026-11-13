import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import config from "../vite.config";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("vite config", () => {
  it("builds with relative asset paths so the site works at any Pages subpath", () => {
    expect(config.base).toBe("./");
  });
});

describe("index.html", () => {
  it("applies the stored theme under this app's own key", () => {
    const html = read("index.html");
    expect(html).toContain('localStorage.getItem("thermobridge-theme")');
    expect(html).not.toContain("pterrain");
  });
});

describe("license", () => {
  it("is MIT, in LICENSE and in package.json", () => {
    expect(read("LICENSE").startsWith("MIT License\n")).toBe(true);
    expect(read("LICENSE")).toContain("Copyright (c) 2026 Peter Schindler");
    expect(JSON.parse(read("package.json")).license).toBe("MIT");
  });
});

describe("logo", () => {
  it("is one SVG of outlines in currentColor, with no text left to need a font", () => {
    const svg = read("src/assets/logo.svg");
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('fill="currentColor"');
    expect(svg).not.toMatch(/<text|font-family/);
  });

  it("has a light and a dark copy for the README with the same outlines", () => {
    const paths = (svg: string) => [...svg.matchAll(/ d="([^"]*)"/g)].map(([, d]) => d);
    const inline = paths(read("src/assets/logo.svg"));
    for (const file of ["assets/logo-light.svg", "assets/logo-dark.svg"]) {
      const svg = read(file);
      expect(paths(svg), file).toEqual(inline);
      expect(svg, file).toContain('aria-label="ThermoBRIDGE"');
      expect(svg, file).not.toContain("currentColor");
    }
  });

  it("has a ΔG^M mark for narrow headers, inline and for the README, cut from the same outlines", () => {
    const paths = (svg: string) => [...svg.matchAll(/ d="([^"]*)"/g)].map(([, d]) => d);
    const mark = paths(read("src/assets/logo-narrow.svg"));
    // Δ, G and M, and none of BRI, "Thermo" or E.
    expect(mark).toHaveLength(3);
    const full = paths(read("src/assets/logo.svg"));
    for (const d of mark) expect(full).toContain(d);
    for (const file of ["assets/logo-narrow-light.svg", "assets/logo-narrow-dark.svg"]) {
      const svg = read(file);
      expect(paths(svg), file).toEqual(mark);
      expect(svg, file).toContain('aria-label="ThermoBRIDGE"');
      expect(svg, file).not.toContain("currentColor");
    }
  });
});

describe("CI", () => {
  const workflow = read(".github/workflows/thermobridge.yml");

  it("runs in the Playwright image of the locked @playwright/test, without installing a browser", () => {
    const lock = JSON.parse(read("package-lock.json")) as {
      packages: Record<string, { version: string }>;
    };
    const version = lock.packages["node_modules/@playwright/test"]!.version;
    expect(workflow).toContain(`image: mcr.microsoft.com/playwright:v${version}-noble`);
    expect(workflow).not.toContain("playwright install");
  });

  it("deploys dist/ to GitHub Pages only from pushes to main, after the checks pass", () => {
    const onMain = "if: github.event_name != 'pull_request' && github.ref == 'refs/heads/main'";
    expect(workflow).toMatch(/upload-pages-artifact@v\d+\n\s+if: .*\n\s+with:\n\s+path: dist\//);
    expect(workflow).toMatch(/deploy:\n\s+needs: check\n/);
    expect(workflow.split(onMain)).toHaveLength(3);
    expect(workflow).toContain("uses: actions/deploy-pages@");
  });

  it("runs the e2e tests fully parallel", () => {
    expect(read("playwright.config.ts")).toMatch(/^\s*fullyParallel: true,$/m);
  });
});
