import { CliError } from "@wirecat/cli-base"
import type { MessageStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { byOption } from "../author.js"
import { jsonOption } from "../options.js"
import { canonicalProject } from "../vocabulary/project.js"

export interface Written {
  kind?: string
  person?: string
  organization?: string
  title?: string
  occurredTime?: string
  project?: string
  reason?: string
  evidence?: string[]
  asOwner?: boolean
  json?: boolean
}

export const json = (command: Command) => jsonOption(command)

export const PROPOSES = "yours is confirmed at once; an agent's waits as proposed for you in memo review"

export const choice = <T extends string>(value: string | undefined, allowed: readonly T[], flag: string): T => {
  if (value === undefined || !(allowed as readonly string[]).includes(value))
    throw new CliError("validation_error", `${flag} is one of ${allowed.join(", ")}`, { param: flag })
  return value as T
}

export const needed = (value: string | undefined, flag: string, what: string): string => {
  if (value === undefined || value.trim() === "")
    throw new CliError("validation_error", `name ${what}: ${flag}`, { param: flag })
  return value
}

export const optionalChoice = <T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  flag: string,
): T | undefined => (value === undefined ? undefined : choice(value, allowed, flag))

/** `--auto-renew on`, `--archived off`: the vocabulary's on|off values. */
export const onOff = (value: string | undefined, flag: string): boolean | undefined =>
  value === undefined ? undefined : choice(value, ["on", "off"] as const, flag) === "on"

/** The parts every finance write shares: who writes it, its project, and an agent's reason. */
export const writtenBy = async (store: MessageStore, by: "owner" | { bot: string }, options: Written) => ({
  by,
  ...(options.project === undefined ? {} : { project: await canonicalProject(store, options.project) }),
  ...(by !== "owner" && options.reason !== undefined ? { reason: options.reason } : {}),
  ...(options.evidence === undefined ? {} : { evidence: options.evidence }),
})

export const party = (command: Command, what: string) =>
  command
    .option("--person <uid>", `the person ${what}: person:<id>`)
    .option("--organization <organization>", `the organization ${what}: organization:<id>`)

export const writeMeta = (command: Command) =>
  byOption(
    command
      .option("--project <project>", "the project it belongs to: its key or project:<id>")
      .option("--reason <text>", "why an agent proposes it, for the owner who decides")
      .option("--evidence <ref...>", "what shows it, up to 8: msg:, note:, document: or another reference"),
  )

/** Leaves out what the caller did not give, so an update changes only the named fields. */
export const given = <T extends Record<string, unknown>>(fields: T) =>
  Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>
  }
