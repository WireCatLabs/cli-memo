import { CliError } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { type NextStep, type StepDefinition, stepOf } from "@wirecat/cli-base/standards"
import { type Body, LOCAL_WRITE, projectWindowOf } from "@wirecat/cli-core/cli"
import { type LinkScanResult, scanProjectLinks } from "@wirecat/cli-core/services"
import type { MessageStore, Project } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { itemAnswer, withStore } from "../answer.js"
import { positive } from "../options.js"
import { labelsFor } from "../review/review.js"
import { ACCOUNTS_HELP, accountName, namedAccounts, type SourceOptions } from "../store/source-list.js"
import { projectOf } from "./key-documents.js"

interface Options extends SourceOptions {
  yes?: boolean
  sinceTime: string
  limit: number
  json?: boolean
}

const DAY = 86_400_000

const SCAN_STEP: StepDefinition = {
  id: "relationships.scan",
  kind: "command",
  command: "relationships scan",
  args: [
    { name: "project", required: true },
    { name: "source", required: true },
  ],
  why: "{count} confirmed chats: a scan lists the chats and people that look like the project's; --yes proposes them",
}

const confirmedChats = async (store: MessageStore, ref: string) =>
  (await store.knowledge.relations(null, ref)).filter(
    (one) => one.confirmed && one.kind === "member-of" && one.to === ref && one.from.startsWith("chat:"),
  ).length

/** Offered while a project has fewer than two confirmed chats: below that its evidence reads mostly by name. */
export const scanStep = async (store: MessageStore, project: Project, source: string): Promise<NextStep[]> => {
  const count = await confirmedChats(store, project.ref)
  return count >= 2 ? [] : [stepOf(SCAN_STEP, { args: { project: project.key, source }, values: { count } })]
}

const projectsOf = async (store: MessageStore, reference: string | undefined): Promise<(string | null)[]> => {
  if (reference === undefined) return [null]
  if (reference === "all") return (await store.knowledge.projects()).map((one) => one.ref)
  return [(await projectOf(store, reference)).ref]
}

const scanned = async (store: MessageStore, scans: LinkScanResult[], written: boolean) => {
  const label = await labelsFor(
    store,
    scans.flatMap((scan) => [scan.project, ...scan.proposals.flatMap((one) => [one.from, one.to])]),
  )
  return {
    written,
    scans: scans.map((scan) => ({
      project: scan.project,
      title: label(scan.project),
      proposals: scan.proposals.map((one) => ({
        id: one.id,
        state: one.state,
        from: one.from,
        to: one.to,
        kind: one.kind,
        title: `${label(one.from) ?? one.from} → ${label(one.to) ?? one.to}`,
        score: one.score,
        ...(one.purpose ? { purpose: one.purpose } : {}),
        signals: one.signals,
        evidence: one.evidence,
      })),
      skipped: scan.skipped,
    })),
  }
}

const scanText = ({ written, scans }: Awaited<ReturnType<typeof scanned>>) =>
  [
    written ? "Proposed for your review (memo review):" : "Nothing written; --yes proposes these for your review:",
    ...scans.flatMap(({ project, title, proposals, skipped }) => [
      `${title ?? project ?? "people by shared mail domain"}: ${proposals.length} to propose; skipped ` +
        `${skipped.confirmed} linked, ${skipped.rejected} rejected, ${skipped.belowThreshold} weak, ` +
        `${skipped.overLimit} over the limit`,
      ...proposals.map(
        (one) => `  ${one.score.toFixed(2)}  ${one.title}${one.id === null ? "" : `  ${one.id}`} ${one.state}`,
      ),
    ]),
  ].join("\n")

export const relationshipsScanCommand = (
  relations: Command,
  print: (json: boolean | undefined, body: Body, text?: string) => void,
  env: NodeJS.ProcessEnv,
  warn: (text: string) => void,
) =>
  annotate(relations.command("scan"), { effects: LOCAL_WRITE })
    .description(
      "chats, mail threads and people that look like a project's, scored from the store: its name and aliases in " +
        "titles and messages, its confirmed members' chats and threads. With no project, people who share a company " +
        "mail domain. Lists them and writes nothing; --yes writes them as proposals by memo-scan for you to decide in " +
        "memo review. Never confirms, and never proposes again what you rejected",
    )
    .summary("propose chats and people for a project; nothing is written without --yes")
    .argument("[project]", "a project's id, key, exact name or alias, or all; left out, people by mail domain")
    .option("--source <accounts>", `where to look, or all: ${ACCOUNTS_HELP}`)
    .option("--since-time <time>", "how far back messages count: days (90d, at most 730d) or a date", "90d")
    .option("--limit <n>", "new proposals per project at most, up to 50", positive, 20)
    .option("--yes", "write the proposals; without it nothing is written")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (project: string | undefined, options: Options) => {
      if (options.limit > 50) throw new CliError("validation_error", "--limit is at most 50", { param: "limit" })
      const window = projectWindowOf(options.sinceTime)
      const since = new Date("days" in window ? Date.now() - window.days * DAY : window.after).toISOString()
      const written = options.yes === true
      const { body, text } = await withStore(env, async (store) => {
        const sources = await namedAccounts(store, env, options, warn)
        const scans: LinkScanResult[] = []
        for (const one of await projectsOf(store, project))
          scans.push(
            await scanProjectLinks(store, { project: one, sources, since, write: written, limit: options.limit }),
          )
        const answer = await scanned(store, scans, written)
        return { body: itemAnswer(answer, { meta: { accounts: sources.map(accountName) } }), text: scanText(answer) }
      })
      print(options.json, body, text)
    })
