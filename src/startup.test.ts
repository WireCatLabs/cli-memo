import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"

const IMPORT = /^(?:import|export)(?!\s+type\b)[^;]*?\sfrom\s+"([^"]+)"/gm
const DYNAMIC_IMPORT = /(?<!typeof )\bimport\("([^"]+)"\)/g

/** What loading `file` loads: its static imports, transitively, never `import type`. */
const loadedBy = (file: string, seen = new Set<string>(), packages = new Set<string>()) => {
  if (seen.has(file)) return packages
  seen.add(file)
  for (const [, from] of readFileSync(file, "utf8").matchAll(IMPORT)) {
    if (!from) continue
    if (from.startsWith(".")) loadedBy(join(dirname(file), from.replace(/\.js$/, ".ts")), seen, packages)
    else packages.add(from)
  }
  return packages
}

/** What the bin loads before `startCli` gets to answer a bare `--version`: everything above the call. */
const loadedAtStart = (bin: string) => {
  // The move from memo loads cli-core once, on the first start only; mayMigrate reads a marker file and nothing more.
  const head = (readFileSync(bin, "utf8").split("await startCli(")[0] ?? "").replace(
    / {2}if \(mayMigrate\([\s\S]*?\n {2}\}\n/,
    "",
  )
  const packages = new Set<string>()
  const specifiers = [...head.matchAll(IMPORT), ...head.matchAll(DYNAMIC_IMPORT)].map(([, from]) => from ?? "")
  for (const from of specifiers) {
    if (from.startsWith(".")) loadedBy(join(dirname(bin), from.replace(/\.js$/, ".ts")), new Set(), packages)
    else packages.add(from)
  }
  return packages
}

describe("starting wcat", () => {
  it("**answers a bare --version without cli-core's command tree**: it was 1,000 of 1,050 files", () => {
    const packages = loadedAtStart(join(import.meta.dirname, "bin", "wcat-wirecat.ts"))
    expect(packages).not.toContain("@wirecat/cli-core/cli")
    expect(packages).toContain("@wirecat/cli-core/cli/start")
  })
})
