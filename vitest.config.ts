import { defineConfig } from "vitest/config"

export default defineConfig({
  // Oxc does not resolve TypeScript package exports; tsc still checks the project configs.
  tsconfig: "./node_modules/@wirecat/cli-base/config/tsconfig.base.json",
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    globals: false,
    // Agents run suites side by side on 24 cores; one worker per core ran the machine out of memory (2026-10-11).
    maxWorkers: 4,
    globalSetup: ["test/argv-setup.ts"],
    setupFiles: ["@wirecat/cli-base/testing/setup", "test/sandbox.ts", "test/argv-trace.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/bin/**"],
      reporter: ["text-summary", "json-summary", "html"],
    },
  },
})
