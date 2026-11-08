import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { isAbsolute, join, relative, resolve, sep } from "node:path"
import { resolvePaths } from "@wirecat/cli-base"
import { APP } from "../app.js"

/** Where memo keeps the copies the owner asked for, each named by the hash of its bytes. */
export const copiesDir = (env: NodeJS.ProcessEnv) =>
  join(resolvePaths({ appName: APP.appName, prefix: APP.envPrefix, env }).state, "sources")

const copyPath = (env: NodeJS.ProcessEnv, hash: string) => join(copiesDir(env), hash)

/** Writes the copy unless it is there; answers whether this call wrote it, so a failed save can take it back. */
export const keepCopy = (env: NodeJS.ProcessEnv, hash: string, bytes: Uint8Array): { path: string; wrote: boolean } => {
  const path = copyPath(env, hash)
  if (existsSync(path)) return { path, wrote: false }
  mkdirSync(copiesDir(env), { recursive: true, mode: 0o700 })
  // A rename is whole or nothing: a run stopped half way leaves no copy that looks kept.
  const partial = `${path}.${randomUUID()}.part`
  writeFileSync(partial, bytes, { mode: 0o600 })
  renameSync(partial, path)
  return { path, wrote: true }
}

/**
 * Deletes a copy the store named, only inside memo's own folder: the path comes from the database, and a row
 * someone edited must not make memo delete any other file.
 */
export const dropCopy = (env: NodeJS.ProcessEnv, path: string): boolean => {
  const inside = relative(resolve(copiesDir(env)), resolve(path))
  if (!inside || isAbsolute(inside) || inside.startsWith("..") || inside.includes(sep) || !existsSync(path))
    return false
  rmSync(path)
  return true
}
