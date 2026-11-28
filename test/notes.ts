import { contextEvidenceFingerprint } from "@wirecat/cli-core/services"
import { openStore } from "@wirecat/cli-core/store"
import type { Note } from "@wirecat/cli-core/store/areas"
import { subjectOf } from "../src/people/subject.js"

/**
 * Notes are the files CLI's to write now; a test puts one in the store as `files notes add` does, so wcat's reads
 * have something to find.
 */
export const addNote = async (
  env: NodeJS.ProcessEnv,
  text: string,
  { subject = [], title }: { subject?: string[]; title?: string } = {},
): Promise<Note> => {
  const store = await openStore({ env })
  try {
    const about = await Promise.all(subject.map(async (one) => (await subjectOf(store, one)).ref))
    return await store.notes.addNote({ text, about, ...(title === undefined ? {} : { title }) })
  } finally {
    await store.close()
  }
}

type FileNote = string | { text: string; links?: string[] }

/**
 * A notes folder with these files, as `files sync` stores them: the folder's id and each file's note. A file's links
 * name a record (`person:…`) or another file of the folder by its path, as an imported `[[link]]` ends up.
 */
export const addFolderNotes = async (
  env: NodeJS.ProcessEnv,
  files: Record<string, FileNote>,
  { name = "vault" }: { name?: string } = {},
): Promise<{ folder: string; notes: Note[] }> => {
  const store = await openStore({ env })
  try {
    const folder = await store.notes.addFolder({ name })
    const notes: Note[] = []
    for (const [path, file] of Object.entries(files)) {
      const text = typeof file === "string" ? file : file.text
      const title =
        path
          .replace(/\.[^.]+$/, "")
          .split("/")
          .at(-1) ?? path
      notes.push((await store.notes.saveFileNote({ folderId: folder.id, path, text, title })).note)
    }
    for (const [at, file] of Object.values(files).entries()) {
      if (typeof file === "string" || !file.links) continue
      const refOf = (target: string) => notes[Object.keys(files).indexOf(target)]?.ref ?? target
      await store.notes.replaceFileLinks(
        (notes[at] as Note).id,
        file.links.map((target) => ({ to: refOf(target), kind: "links-to" as const })),
      )
    }
    return { folder: folder.id, notes }
  } finally {
    await store.close()
  }
}

/** The fingerprint a finding cites a note by, as `files notes show` gives it. */
export const fingerprintOf = async (env: NodeJS.ProcessEnv, ref: string): Promise<string | null> => {
  const store = await openStore({ env })
  try {
    const record = await store.contextRecords?.read(ref)
    return record ? contextEvidenceFingerprint(record) : null
  } finally {
    await store.close()
  }
}
