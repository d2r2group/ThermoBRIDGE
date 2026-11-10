import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative asset paths, so the same build works at any GitHub Pages subpath (plan §7).
  base: "./",
  test: {
    include: ["tests/**/*.test.ts"],
    // The physics tests scan whole windows: several take 1–3 s here and several times that on
    // a shared CI runner (or under coverage), past Vitest's 5 s default.
    testTimeout: 30_000,
    benchmark: { include: ["tests/**/*.bench.ts"] },
    // `npm run test:coverage`: which lines of src/ the unit tests reach. The UI modules that
    // only Playwright exercises show as uncovered here.
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text-summary", "html"],
    },
  },
});
