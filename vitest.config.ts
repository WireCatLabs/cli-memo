import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    globals: false,
    setupFiles: ["test/sandbox.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/bin/**"],
      reporter: ["text-summary", "json-summary", "html"],
    },
  },
})
