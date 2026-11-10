import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier";
import importX, { createNodeResolver } from "eslint-plugin-import-x";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["dist/", "node_modules/", "test-results/", "playwright-report/", "coverage/"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.browser } } },
  {
    files: ["*.config.{js,ts}", "scripts/**"],
    languageOptions: { globals: { ...globals.node } },
  },
  // Type-aware rules on the TypeScript sources and tests: a promise that is neither awaited nor
  // handled (a Playwright call without `await` passes silently) or that is passed where a
  // function's result is ignored, such as an async event listener.
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
  // No import cycles among the sources, type-only imports included (plan §12.2 CR3).
  {
    files: ["src/**/*.ts"],
    plugins: { "import-x": importX },
    settings: {
      "import-x/extensions": [".ts"],
      "import-x/parsers": { "@typescript-eslint/parser": [".ts"] },
      "import-x/resolver-next": [createNodeResolver({ extensions: [".ts", ".js"] })],
    },
    rules: { "import-x/no-cycle": "error" },
  },
  prettier,
);
