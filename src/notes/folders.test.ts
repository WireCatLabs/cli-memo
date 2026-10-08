import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@leemour/cli-core"
import { beforeEach, describe, expect, it } from "vitest"
import { configPath, loadConfig } from "../config.js"
import { createProgram } from "../program.js"
import { attachFolder, bindFolder, folderPaths, noteFolders } from "./folders.js"

let root: string
let env: NodeJS.ProcessEnv

const run = async (...args: string[]) => {
  const streams = captureStreams()
  await createProgram({ streams, env }).exitOverride().parseAsync(args, { from: "user" })
  return streams.stdout.join("").trim()
}

const writeConfig = (value: unknown) => {
  mkdirSync(join(root, "config"), { recursive: true })
  writeFileSync(configPath(env), JSON.stringify(value))
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "folders-"))
  for (const name of ["vault", "plain", "moved"]) mkdirSync(join(root, name))
  env = { ...process.env, MEMO_CONFIG_DIR: join(root, "config"), MESSAGING_STORE: join(root, "messages.db") }
})

describe("folder config", () => {
  it("reads the bare paths written before folder ids", () => {
    writeConfig({ notes: { folders: [join(root, "vault")] } })
    expect(noteFolders(loadConfig(env).notes)).toEqual([{ id: null, path: join(root, "vault"), format: "obsidian" }])
    expect(folderPaths(loadConfig(env).notes)).toEqual([join(root, "vault")])
  })

  it("binds an id to a bare path in place", () => {
    const vault = join(root, "vault")
    const bound = bindFolder({ notes: { folders: [vault] } }, { id: "fld_one", path: `${vault}/`, format: "obsidian" })
    expect(bound.notes?.folders).toEqual([{ id: "fld_one", path: vault }])
  })

  it("moves an attached id to its new path and refuses a path that has another id", () => {
    const config = bindFolder({}, { id: "fld_one", path: join(root, "vault"), format: "obsidian" })
    const moved = attachFolder(config, "fld_one", join(root, "moved"), "markdown")
    expect(noteFolders(moved.config.notes)).toEqual([{ id: "fld_one", path: join(root, "moved"), format: "markdown" }])
    expect(() => attachFolder(moved.config, "fld_other", join(root, "moved"))).toThrow(/already folder/)
  })
})

describe("memo folders", () => {
  it("adds a folder to the store and the config, and attaches it on another computer", async () => {
    const id = await run("folders", "add", join(root, "vault"))
    expect(id).toMatch(/^fld_[0-9A-Z]{26}$/)
    expect(await run("folders", "add", join(root, "vault"))).toBe(id)

    env = { ...env, MEMO_CONFIG_DIR: join(root, "laptop") }
    expect(JSON.parse(await run("folders", "list", "--json")).elsewhere).toEqual([
      { id, name: "vault", format: "obsidian" },
    ])
    await run("folders", "attach", id, join(root, "plain"), "--format", "markdown")
    expect(JSON.parse(await run("folders", "list", "--json")).items).toEqual([
      { id, path: join(root, "plain"), format: "markdown" },
    ])
    expect(JSON.parse(readFileSync(configPath(env), "utf8")).notes.folders[0]).toEqual({
      id,
      path: join(root, "plain"),
      format: "markdown",
    })
  })

  it("refuses to attach an id the store does not have", async () => {
    await expect(run("folders", "attach", "fld_unknown", join(root, "plain"))).rejects.toThrow(/has no folder/)
  })

  it("refuses a path that is not a folder", async () => {
    await expect(run("folders", "add", join(root, "missing"))).rejects.toThrow(/is not a folder/)
  })
})
