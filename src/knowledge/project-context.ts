import { paymentTitle } from "@wirecat/cli-core/meetings"
import { proposalRegistry } from "@wirecat/cli-core/services"
import type { MessageStore } from "@wirecat/cli-core/store"
import { itemAnswer, plainText } from "../answer.js"
import { factItem } from "../facts/fact.js"
import { notesAbout } from "../notes/about.js"
import { labelsFor, proposerName, reviewItem } from "../review/review.js"
import { waitingAbout } from "../review/status.js"
import { keyDocuments, projectOf } from "./key-documents.js"
import { projectFindings } from "./project-findings.js"

export const projectContext = async (store: MessageStore, env: NodeJS.ProcessEnv, reference: string) => {
  const project = await projectOf(store, reference)
  const relationships = (await store.notes.links({ to: project.ref }))
    .concat(await store.notes.links({ from: project.ref }))
    .filter((link) => link.kind !== "about" && link.kind !== "links-to" && link.role !== "key")
  const documents = await keyDocuments(store, project)
  const pending = (kind: string) =>
    proposalRegistry(store).list({ project: project.ref, kinds: [kind], status: "proposed", limit: 50, offset: 0 })
  const [facts, tasks, findings, keys, links, waiting] = await Promise.all([
    store.facts.list({ project: project.ref, status: "proposed", limit: 21 }),
    store.tasks.find({ project: project.ref, status: "open", limit: 21 }),
    projectFindings(store, project.ref, relationships),
    pending("key_document"),
    pending("relationship"),
    waitingAbout(store, env, [project.ref]),
  ])
  const label = await labelsFor(
    store,
    [...keys.items, ...links.items].flatMap((row) => [row.subject, row.object]),
  )
  return {
    keyDocuments: documents,
    project,
    relationships,
    notes: await notesAbout(store, { ref: project.ref }),
    tags: await store.knowledge.tags(null, { type: "project", id: project.id }),
    review: {
      waiting: { ...waiting, next: { command: "review list", args: { query: `project:${project.ref}` } } },
      keyDocuments: keys.items.map((row) => ({
        id: row.id,
        ref: row.subject,
        title: label(row.subject),
        reason: row.reason,
        confirmed: false,
        proposer: proposerName(row.proposedBy),
      })),
      relationships: links.items.map((row) => ({
        id: row.id,
        from: row.subject,
        to: row.object,
        title: reviewItem(row, label).title,
        role: row.summary,
        reason: row.reason,
        confirmed: false,
        proposer: proposerName(row.proposedBy),
      })),
      facts: {
        items: facts.slice(0, 20).map(factItem),
        hasMore: facts.length > 20,
        next:
          facts.length > 20
            ? { command: "facts list", args: { query: `project:"${project.ref}" status:proposed`, limit: 100 } }
            : null,
      },
      meetingActions: findings,
    },
    openTasks: {
      items: tasks.slice(0, 20),
      hasMore: tasks.length > 20,
      next:
        tasks.length > 20 ? { command: "tasks list", args: { query: `project:"${project.ref}"`, limit: 100 } } : null,
    },
  }
}

export const projectContextText = (context: Awaited<ReturnType<typeof projectContext>>): string => {
  const line = (text: string) => text.replace(/\s+/g, " ").slice(0, 240)
  const { review } = context
  return [
    plainText(itemAnswer(context)),
    `Pending review: ${review.waiting.count}${review.waiting.complete ? "" : "+"} proposal${
      review.waiting.count === 1 ? "" : "s"
    } waiting — memo review project:${context.project.key ?? context.project.ref} (nothing confirmed):`,
    ...review.keyDocuments.map((document) => `  key document ${document.ref}: ${line(document.reason ?? "")}`),
    ...review.relationships.map((link) => `  relationship ${link.id}: ${link.title}`),
    ...review.facts.items.map((fact) => `  ${fact.ref} [${fact.kind}]: ${line(fact.text)}`),
    ...review.meetingActions.items.flatMap((batch) =>
      batch.findings.map(
        (finding) =>
          `  batch ${batch.id}/${finding.id} [${finding.kind}]: ${line(
            finding.kind === "task"
              ? finding.title
              : finding.kind === "payment"
                ? (finding.statement ?? paymentTitle(finding))
                : finding.statement,
          )}`,
      ),
    ),
    "Open numbered tasks:",
    ...context.openTasks.items.map((task) => `  open task ${task.key}: ${line(task.title)}`),
    ...(review.facts.hasMore ||
    context.openTasks.hasMore ||
    review.meetingActions.coverage.accounts.some((account) => account.has_more) ||
    review.meetingActions.coverage.omitted_accounts.length ||
    review.meetingActions.coverage.missing_account_ids.length
      ? ["More or missing records: --json shows coverage and continuation commands."]
      : []),
    "Meeting proposals cover linked meeting accounts only; read a full batch before owner review.",
  ].join("\n")
}
