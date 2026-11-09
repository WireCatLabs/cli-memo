import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { CliError } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { type Body, grantsAuthority, LOCAL_READ, LOCAL_WRITE } from "@wirecat/cli-core/cli"
import { type MessageStore, storePath, type TemplateAddress } from "@wirecat/cli-core/store"
import { Command, Option } from "commander"
import { itemAnswer, withStore } from "../answer.js"
import { authorOf } from "../author.js"

/** Kept in the templates table so the brief lives beside the digest's templates, with their history and undo. */
const BRIEF: TemplateAddress = { key: "digest/brief", channel: "text", language: "any" }

/** The brief goes into every scheduled run's prompt, so its size is its cost. */
export const BRIEF_LIMIT = 4000

type Print = (json: boolean | undefined, body: Body, text?: string) => void

/** The owner's brief, or undefined; a machine with no store yet has none, and reading it creates no store. */
export const readBrief = async (env: NodeJS.ProcessEnv): Promise<string | undefined> => {
  if (!existsSync(storePath(env))) return undefined
  return withStore(env, async (store) => store.templates.get(BRIEF)?.body)
}

/** The morning-digest skill with the owner's brief after it, as the last word (NEED-2457). */
export const withBrief = (skill: string, brief: string | undefined): string =>
  brief === undefined
    ? skill
    : `${skill}\n\n## The owner's brief\n\n` +
      "The owner wrote this himself: it adds to everything above, and where it contradicts a rule of this skill, " +
      `the brief wins.\n\n${brief.trim()}`

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

const refuseAgent = (env: NodeJS.ProcessEnv): void => {
  // The brief may override the digest skill's rules, so an agent writing it could steer every later run.
  if (authorOf(env) !== "owner")
    throw new CliError("permission_error", "only the owner changes the digest brief, not an agent", {
      reason: "brief.owner-only",
    })
}

const historyOf = (store: MessageStore) =>
  store.templates.history(BRIEF).map((entry) => ({
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
    .summary("the brief the morning digest follows, and the bodies your changes replaced")
    .option("--json", "print JSON")
    .action(async (given: { json?: boolean }) => {
      const item = existsSync(storePath(env))
        ? await withStore(env, async (store) => {
            const row = store.templates.get(BRIEF)
            return {
              body: row?.body ?? null,
              chars: row?.body.length ?? 0,
              limit: BRIEF_LIMIT,
              updated_at: row ? new Date(row.updatedAt).toISOString() : null,
              updated_by: row?.updatedBy ?? null,
              history: historyOf(store),
            }
          })
        : { body: null, chars: 0, limit: BRIEF_LIMIT, updated_at: null, updated_by: null, history: [] }
      print(
        given.json,
        itemAnswer(item),
        item.body ?? "No brief: the morning digest follows its skill alone. `memo digest brief edit` writes one.",
      )
    })

  grantsAuthority(annotate(brief.command("edit"), { effects: LOCAL_WRITE }))
    .summary("write the brief in $EDITOR or from --file; only you, never an agent")
    .description(
      `write the brief in $EDITOR, or from --file; at most ${BRIEF_LIMIT} characters. The body it replaces is kept, ` +
        "and --undo puts it back. Only you change it, never an agent or a read-only run",
    )
    .option("--file <file>", "take the brief from this file instead of opening an editor; - reads stdin")
    .addOption(new Option("--undo", "put back the body your last change replaced").conflicts("file"))
    .option("--json", "print JSON")
    .action(async (given: EditOptions) => {
      refuseAgent(env)
      const { current, previous } = await withStore(env, async (store) => ({
        current: store.templates.get(BRIEF)?.body,
        previous: store.templates.history(BRIEF, 1)[0]?.body,
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
      body = body.trim()
      if (!body)
        throw new CliError("validation_error", `the brief is empty; memo digest brief reset removes it${kept}`, {
          reason: "brief.empty",
        })
      if (body.length > BRIEF_LIMIT)
        throw new CliError(
          "validation_error",
          `the brief is ${body.length} characters; the limit is ${BRIEF_LIMIT}, because every morning run reads ` +
            `it and pays for it. Nothing was saved${kept}`,
          { reason: "brief.too-long", chars: body.length, limit: BRIEF_LIMIT },
        )
      if (draft) rmSync(join(draft, ".."), { recursive: true, force: true })
      if (body === current) {
        print(given.json, itemAnswer({ changed: false, chars: body.length }), "The brief is unchanged; nothing saved.")
        return
      }
      const saved = await withStore(env, async (store) => store.templates.save(BRIEF, body, "memo"))
      print(
        given.json,
        itemAnswer({
          changed: true,
          chars: body.length,
          limit: BRIEF_LIMIT,
          updated_at: new Date(saved.updatedAt).toISOString(),
        }),
        `Saved the brief (${body.length} of ${BRIEF_LIMIT} characters); the next morning digest follows it.`,
      )
    })

  grantsAuthority(annotate(brief.command("reset"), { effects: LOCAL_WRITE }))
    .summary("remove the brief; edit --undo brings it back")
    .description("remove the brief, so the morning digest follows its skill alone; edit --undo brings it back")
    .option("--json", "print JSON")
    .action(async (given: { json?: boolean }) => {
      refuseAgent(env)
      const changed = await withStore(env, async (store) => store.templates.reset(BRIEF))
      print(
        given.json,
        itemAnswer({ changed }),
        changed ? "Removed the brief; memo digest brief edit --undo brings it back." : "There was no brief.",
      )
    })
}
