import { configDefaults, defineConfig } from "vitest/config"

const MEANING = "src/search/search-meaning.test.ts"

export default defineConfig({
  // Oxc does not resolve TypeScript package exports; tsc still checks the project configs.
  tsconfig: "./node_modules/@wirecat/cli-base/config/tsconfig.base.json",
  test: {
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
    projects: [
      {
        extends: true,
        test: {
          name: "memo",
          include: ["src/**/*.test.ts", "test/**/*.test.ts"],
          exclude: [...configDefaults.exclude, MEANING],
        },
      },
      // Its vi.mock swaps cli-core's model table for the tiny fixture, which reaches cli-core only when it is inlined;
      // inlined, cli-core is transformed on first import, which takes seconds on a busy machine.
      {
        extends: true,
        test: {
          name: "meaning",
          include: [MEANING],
          testTimeout: 60_000,
          server: { deps: { inline: ["@wirecat/cli-core"] } },
        },
      },
    ],
  },
})
