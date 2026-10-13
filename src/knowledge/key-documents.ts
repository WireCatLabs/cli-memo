import { CliError } from "@wirecat/cli-base"
import { parseLocator } from "@wirecat/cli-messaging"
import type { Author, Link, MessageStore, Project } from "@wirecat/cli-messaging/store"
import { heldMessage } from "../store/held.js"

export interface KeyDocument {
  ref: string
  title: string | null
  path: string | null
  reason: string | null
  /** False when the note, file or message is gone from the store; the mark stays until removed. */
  available: boolean
  confirmed: boolean
  origin: Link["origin"]
  provenance: string | null
  markedAt: string
}

const KEYABLE = /^(note|document|msg):/

/** A project by its id, `project:<id>` or key; one the store does not hold is an error, not an empty answer. */
export const projectOf = async (store: MessageStore, reference: string): Promise<Project> => {
  const wanted = reference.replace(/^project:/, "")
  const project = (await store.knowledge.projects()).find(
    (candidate) => candidate.id === wanted || candidate.key?.toLowerCase() === wanted.toLowerCase(),
  )
  if (!project) throw new CliError("not_found", `no project ${reference}; memo projects list shows them`)
  return project
}

/** A key mark is a `related-to` link from the source to the project, with the role `key` and the reason. */
const isKey = (link: Link) => link.kind === "related-to" && link.role === "key"

const firstLine = (text: string) =>
  text
    .trim()
    .split("\n")[0]
    ?.replace(/^#+\s*/, "")
    .slice(0, 120) || null

const sourceOf = async (store: MessageStore, ref: string) => {
  if (ref.startsWith("msg:")) {
    const { provider, account, chat, message } = parseLocator(ref)
    const held = await heldMessage(store, { provider, account }, message, chat)
    return held && { title: firstLine(held.text), path: null }
  }
  const note = await store.notes.note(ref).catch(() => undefined)
  return note && note.deletedAt === null ? { title: note.title ?? firstLine(note.text), path: note.path } : undefined
}

const describe = async (store: MessageStore, link: Link): Promise<KeyDocument> => {
  const source = await sourceOf(store, link.from)
  return {
    ref: link.from,
    title: source?.title ?? null,
    path: source?.path ?? null,
    reason: link.evidence,
    available: source !== undefined,
    confirmed: link.confirmed,
    origin: link.origin,
    provenance: link.provenance,
    markedAt: link.createdAt,
  }
}

const keyLinks = async (store: MessageStore, project: Project) =>
  (await store.notes.links({ to: project.ref })).filter(isKey)

export const keyDocuments = async (store: MessageStore, project: Project): Promise<KeyDocument[]> =>
  Promise.all((await keyLinks(store, project)).map((link) => describe(store, link)))

export const markKey = async (
  store: MessageStore,
  project: Project,
  ref: string,
  reason: string,
  author: Author,
): Promise<KeyDocument> => {
  if (!KEYABLE.test(ref))
    throw new CliError("validation_error", "a key document is a note:, document: or msg: reference")
  if ((await sourceOf(store, ref)) === undefined) throw new CliError("not_found", `the store holds no ${ref}`)
  const link = await store.notes.addLink({
    from: ref,
    to: project.ref,
    kind: "related-to",
    role: "key",
    evidence: reason,
    ...(author === "owner"
      ? { origin: "owner" as const }
      : { origin: "suggested" as const, confirmed: false, provenance: `agent:${author.bot}` }),
  })
  if (!isKey(link))
    throw new CliError(
      "validation_error",
      `${ref} already relates to ${project.ref} as something else; memo relationships remove ${link.id} first`,
    )
  return describe(store, link)
}

export const unmarkKey = async (store: MessageStore, project: Project, ref: string) => {
  const link = (await keyLinks(store, project)).find((one) => one.from === ref)
  if (!link) throw new CliError("not_found", `${ref} is not a key document of ${project.ref}`)
  await store.notes.removeLink(link.id)
  return { ref, project: project.ref, removed: true }
}

/** The project's key items first, labelled `key`, in their own order; nothing else is dropped. */
export const keyFirst = <T extends { ref: string }>(items: T[], keys: Set<string>): (T & { key?: true })[] => [
  ...items.filter((item) => keys.has(item.ref)).map((item) => ({ ...item, key: true as const })),
  ...items.filter((item) => !keys.has(item.ref)),
]
