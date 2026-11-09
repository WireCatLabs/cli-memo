import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CliError } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import {
  type Body,
  grantsAuthority,
  isCalendar,
  LOCAL_READ,
  LOCAL_WRITE,
  readSchedule,
  slotsOf,
} from "@wirecat/cli-core/cli"
import { type MessageStore, storePath, type TemplateAddress } from "@wirecat/cli-core/store"
import { Command, Option } from "commander"
import { itemAnswer, withStore } from "../answer.js"
import { authorOf } from "../author.js"
import {
  agendaFlags,
  briefAddress,
  digestScheduleFile,
  isDigest,
  MORNING_DIGEST,
  readDefinition,
  runningDigest,
  windowStart,
} from "./digests.js"

/** A digest's brief address; the brief is kept in the templates table, beside the templates, with history and undo. */
const addressOf = (env: NodeJS.ProcessEnv, name: string | undefined): TemplateAddress => {
  const digest = name ?? MORNING_DIGEST
  if (digest !== MORNING_DIGEST && !isDigest(env, digest))
    throw new CliError("not_found", `no digest ${digest} — \`memo digest list\` names them`, {
      reason: "digest.not-found",
    })
  return briefAddress(digest)
}

/** The brief goes into every scheduled run's prompt, so its size is its cost. */
export const BRIEF_LIMIT = 4000

type Print = (json: boolean | undefined, body: Body, text?: string) => void

/** A digest's brief, or undefined; a machine with no store yet has none, and reading it creates no store. */
export const readBrief = async (env: NodeJS.ProcessEnv, name = MORNING_DIGEST): Promise<string | undefined> => {
  if (!existsSync(storePath(env))) return undefined
  return withStore(env, async (store) => store.templates.get(briefAddress(name))?.body)
}

/** Checks a brief the owner gives and saves it; the body it replaces stays in the history. */
export const checkedBrief = (given: string, kept = ""): string => {
  const body = given.trim()
  if (!body)
    throw new CliError("validation_error", `the brief is empty; memo digest brief reset removes it${kept}`, {
      reason: "brief.empty",
    })
  if (body.length > BRIEF_LIMIT)
    throw new CliError(
      "validation_error",
      `the brief is ${body.length} characters; the limit is ${BRIEF_LIMIT}, because every run reads ` +
        `it and pays for it. Nothing was saved${kept}`,
      { reason: "brief.too-long", chars: body.length, limit: BRIEF_LIMIT },
    )
  return body
}

/** The morning-digest skill with the owner's brief after it, as the last word (NEED-2457). */
export const withBrief = (skill: string, brief: string | undefined, digest?: string): string => {
  const shown = digest === undefined ? skill : `${skill}\n\n${digest}`
  return brief === undefined
    ? shown
    : `${shown}\n\n## The owner's brief\n\n` +
        "The owner wrote this himself: it adds to everything above, and where it contradicts a rule of this skill, " +
        `the brief wins.\n\n${brief.trim()}`
}

/**
 * What `skill show morning-digest` adds for the digest a scheduled run belongs to (`MEMO_SCHEDULED`): its window and
 * sources when it is a named digest, and its brief. The morning digest made before names existed gets its brief alone.
 */
export const digestAddendum = async (
  env: NodeJS.ProcessEnv,
  now = Date.now(),
): Promise<{ brief: string | undefined; digest: string | undefined }> => {
  const name = runningDigest(env)
  const brief = await readBrief(env, name)
  const definition = readDefinition(env, name)
  const file = digestScheduleFile(env, name)
  if (!existsSync(file)) return { brief, digest: undefined }
  const { when } = readSchedule(file)
  const slots = isCalendar(when) ? slotsOf(when) : []
  // The skill's own `--since-time 1d` is already right for a morning digest that runs once a day.
  if (!definition && !(slots.length > 1 || slots.some((slot) => slot.on))) return { brief, digest: undefined }
  const sources = definition?.sources ?? []
  const flags = agendaFlags(windowStart(when, now), sources)
  return {
    brief,
    digest:
      `## This digest: ${definition?.title ?? "Morning digest"}\n\n` +
      "Unless your input has a `backfill:` line, the agenda call is " +
      `\`memo review agenda --compact ${flags}\`: this digest reads from its previous time` +
      (sources.length ? `, and only ${sources.join(", ")}; leave everything else out of the report too.` : ".") +
      " Where this skill says `--since-time 1d`, give that call the same `--since-time` instead. " +
      `Keep \`"kind": "morning-digest"\` in the report: it names the report's shape, not the digest.`,
  }
}

const systemEditor = (path: string, env: NodeJS.ProcessEnv): void => {
  const editor = env.VISUAL?.trim() || env.EDITOR?.trim()
  if (!editor)
    throw new CliError("validation_error", "set VISUAL or EDITOR, or pass the brief with --file", {
      reason: "brief.no-editor",
    })
  const [program = editor, ...args] = editor.split(/\s+/)
  const ran = spawnSync(program, [...args, path], { stdio: "inherit", env })
  if (ran.status !== 0)
    throw new CliError("validation_error", `the editor exited with ${ran.status ?? ran.signal}; nothing was saved`)
}

export const refuseAgent = (env: NodeJS.ProcessEnv): void => {
  // The brief may override the digest skill's rules, so an agent writing it could steer every later run.
  if (authorOf(env) !== "owner")
    throw new CliError("permission_error", "only the owner changes the digest brief, not an agent", {
      reason: "brief.owner-only",
    })
}

const historyOf = (store: MessageStore, address: TemplateAddress) =>
  store.templates.history(address).map((entry) => ({
    saved_at: new Date(entry.savedAt).toISOString(),
    saved_by: entry.savedBy,
    replaced_at: new Date(entry.replacedAt).toISOString(),
    chars: entry.body.length,
  }))

interface EditOptions {
  file?: string
  undo?: boolean
  json?: boolean
}

/** `digest brief`: the owner's own words on what the morning digest collects, added to its skill. */
export const briefCommand = (digest: Command, print: Print, env: NodeJS.ProcessEnv, editor = systemEditor): void => {
  const brief = annotate(new Command("brief"), { effects: LOCAL_READ })
    .summary("your own instructions on what the morning digest collects")
    .description(
      "your own instructions on what the morning digest collects: projects, people, topics, what to skip, how many " +
        "items. The morning-digest skill ends with them, and where they contradict its rules they win; the run " +
        `stays read only, with memo as its only tool and the schedule's cost cap. At most ${BRIEF_LIMIT} characters`,
    )
  digest.addCommand(brief)

  annotate(brief.command("show"), { effects: LOCAL_READ })
    .summary("the brief a digest follows, and the bodies your changes replaced")
    .argument("[digest]", `the digest's name, as \`memo digest list\` shows it; ${MORNING_DIGEST} when left out`)
    .option("--json", "print JSON")
    .action(async (name: string | undefined, given: { json?: boolean }) => {
      const address = addressOf(env, name)
      const item = existsSync(storePath(env))
        ? await withStore(env, async (store) => {
            const row = store.templates.get(address)
            return {
              body: row?.body ?? null,
              chars: row?.body.length ?? 0,
              limit: BRIEF_LIMIT,
              updated_at: row ? new Date(row.updatedAt).toISOString() : null,
              updated_by: row?.updatedBy ?? null,
              history: historyOf(store, address),
            }
          })
        : { body: null, chars: 0, limit: BRIEF_LIMIT, updated_at: null, updated_by: null, history: [] }
      print(
        given.json,
        itemAnswer(item),
        item.body ?? "No brief: the digest follows its skill alone. `memo digest brief edit` writes one.",
      )
    })

  grantsAuthority(annotate(brief.command("edit"), { effects: LOCAL_WRITE }))
    .summary("write the brief in $EDITOR or from --file; only you, never an agent")
    .description(
      `write the brief in $EDITOR, or from --file; at most ${BRIEF_LIMIT} characters. The body it replaces is kept, ` +
        "and --undo puts it back. Only you change it, never an agent or a read-only run",
    )
    .argument("[digest]", `the digest's name, as \`memo digest list\` shows it; ${MORNING_DIGEST} when left out`)
    .option("--file <file>", "take the brief from this file instead of opening an editor; - reads stdin")
    .addOption(new Option("--undo", "put back the body your last change replaced").conflicts("file"))
    .option("--json", "print JSON")
    .action(async (name: string | undefined, given: EditOptions) => {
      refuseAgent(env)
      const address = addressOf(env, name)
      const { current, previous } = await withStore(env, async (store) => ({
        current: store.templates.get(address)?.body,
        previous: store.templates.history(address, 1)[0]?.body,
      }))
      let draft: string | undefined
      let body: string
      if (given.undo) {
        if (previous === undefined)
          throw new CliError("validation_error", "the brief has no earlier body to put back", {
            reason: "brief.no-history",
          })
        body = previous
      } else if (given.file !== undefined) {
        body = readFileSync(given.file === "-" ? 0 : given.file, "utf8")
      } else {
        draft = join(mkdtempSync(join(tmpdir(), "memo-brief-")), "brief.md")
        writeFileSync(draft, current ?? "", { mode: 0o600 })
        editor(draft, env)
        body = readFileSync(draft, "utf8")
      }
      const kept = draft ? `. Your text is in ${draft}; fix it and run again with --file ${draft}` : ""
      body = checkedBrief(body, kept)
      if (draft) rmSync(join(draft, ".."), { recursive: true, force: true })
      if (body === current) {
        print(given.json, itemAnswer({ changed: false, chars: body.length }), "The brief is unchanged; nothing saved.")
        return
      }
      const saved = await withStore(env, async (store) => store.templates.save(address, body, "memo"))
      print(
        given.json,
        itemAnswer({
          changed: true,
          chars: body.length,
          limit: BRIEF_LIMIT,
          updated_at: new Date(saved.updatedAt).toISOString(),
        }),
        `Saved the brief (${body.length} of ${BRIEF_LIMIT} characters); the digest's next run follows it.`,
      )
    })

  grantsAuthority(annotate(brief.command("reset"), { effects: LOCAL_WRITE }))
    .summary("remove the brief; edit --undo brings it back")
    .description("remove the brief, so the digest follows its skill alone; edit --undo brings it back")
    .argument("[digest]", `the digest's name, as \`memo digest list\` shows it; ${MORNING_DIGEST} when left out`)
    .option("--json", "print JSON")
    .action(async (name: string | undefined, given: { json?: boolean }) => {
      refuseAgent(env)
      const address = addressOf(env, name)
      const changed = await withStore(env, async (store) => store.templates.reset(address))
      print(
        given.json,
        itemAnswer({ changed }),
        changed ? "Removed the brief; memo digest brief edit --undo brings it back." : "There was no brief.",
      )
    })
}
