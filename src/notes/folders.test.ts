import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { captureStreams } from "@leemour/cli-core"
import { beforeEach, describe, expect, it } from "vitest"
import { configPath, loadConfig } from "../config.js"
import { createProgram } from "../program.js"
import { addFolder, attachFolder, folderPaths, noteFolders } from "./folders.js"

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
  env = { ...process.env, MEMO_CONFIG_DIR: join(root, "config") }
})

describe("folder config", () => {
  it("reads the bare paths written before folder ids", () => {
    writeConfig({ notes: { folders: [join(root, "vault")] } })
    expect(noteFolders(loadConfig(env).notes)).toEqual([{ id: null, path: join(root, "vault"), format: "obsidian" }])
    expect(folderPaths(loadConfig(env).notes)).toEqual([join(root, "vault")])
  })

  it("gives a bare path an id in place and keeps it on the next add", () => {
    const vault = join(root, "vault")
    const first = addFolder({ notes: { folders: [vault] } }, vault)
    expect(first.created).toBe(true)
    expect(first.config.notes?.folders).toEqual([{ id: first.folder.id, path: vault }])
    const again = addFolder(first.config, `${vault}/`)
    expect(again).toMatchObject({ created: false, folder: { id: first.folder.id } })
  })

  it("moves an attached id to its new path and refuses a path that has another id", () => {
    const { config } = addFolder({}, join(root, "vault"))
    const id = noteFolders(config.notes)[0]?.id as string
    const moved = attachFolder(config, id, join(root, "moved"), "markdown")
    expect(noteFolders(moved.config.notes)).toEqual([{ id, path: join(root, "moved"), format: "markdown" }])
    expect(() => attachFolder(moved.config, "fld_other", join(root, "moved"))).toThrow(/already folder/)
  })
})

describe("memo folders", () => {
  it("adds, attaches and lists folders in the config", async () => {
    const id = await run("folders", "add", join(root, "vault"))
    expect(id).toMatch(/^fld_[0-9a-f]{32}$/)
    await run("folders", "attach", "fld_fromlaptop", join(root, "plain"), "--format", "markdown")
    const listed = JSON.parse(await run("folders", "list", "--json"))
    expect(listed.items).toEqual([
      { id, path: join(root, "vault"), format: "obsidian" },
      { id: "fld_fromlaptop", path: join(root, "plain"), format: "markdown" },
    ])
    expect(JSON.parse(readFileSync(configPath(env), "utf8")).notes.folders[1]).toEqual({
      id: "fld_fromlaptop",
      path: join(root, "plain"),
      format: "markdown",
    })
  })

  it("refuses a path that is not a folder", async () => {
    await expect(run("folders", "add", join(root, "missing"))).rejects.toThrow(/is not a folder/)
  })
})
