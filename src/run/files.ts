import { execFile } from "node:child_process"
import type { ErrorCode } from "@wirecat/cli-base"
import { findOnPath } from "@wirecat/cli-base/wcat"
import type { EnrichmentReport, NoteChunksEmbedded } from "../search/embed.js"

/** One notes folder as `wcat-files sync --json` reports it. */
export interface NotesImport {
  folder: string
  folderId: string
  notes: number
  changed: number
  renamed: number
  deleted: number
  deletionsSkipped?: string
  notRead?: { path: string; status: string; engine?: string }[]
  truncated?: string[]
}

type Failed = { source: string; code: ErrorCode | "internal_error"; reasonId: string; reason: string }

export type FilesSync =
  | { ran: false }
  | {
      ran: true
      notes: NotesImport[]
      notesEmbedded?: Omit<NoteChunksEmbedded, "enrichment">
      enrichment?: EnrichmentReport
      failed: Failed[]
    }

export const FILES_PROGRAM = "wcat-files"

interface Answer {
  item?: {
    notes?: NotesImport[]
    notesEmbedded?: Omit<NoteChunksEmbedded, "enrichment">
    enrichment?: EnrichmentReport
    failed?: Failed[]
  }
  error?: { code?: string; reason?: string; message?: string }
}

const failure = (reasonId: string, reason: string, code: Failed["code"] = "internal_error"): FilesSync => ({
  ran: true,
  notes: [],
  failed: [{ source: "notes", code, reasonId, reason }],
})

/**
 * Notes belong to the files CLI now, so `wcat sync` runs `wcat-files sync --json` when it is on PATH and reports its
 * folders as its own. Its stderr goes to ours, so its progress lines still show.
 */
export const filesSync = (
  env: NodeJS.ProcessEnv,
  { embed, signal, platform = process.platform }: { embed: boolean; signal?: AbortSignal; platform?: NodeJS.Platform },
): Promise<FilesSync> => {
  const [program] = findOnPath(FILES_PROGRAM, { env, platform })
  if (program === undefined) return Promise.resolve({ ran: false })
  const args = ["sync", "--json", ...(embed ? [] : ["--no-embed"])]
  return new Promise((done) => {
    const child = execFile(
      program,
      args,
      {
        env,
        maxBuffer: 64 * 1024 * 1024,
        // A .cmd needs a shell on Windows; every argument here is a fixed word.
        shell: platform === "win32" && /\.(cmd|bat)$/i.test(program),
        ...(signal ? { signal } : {}),
      },
      (error, stdout) => {
        let answer: Answer
        try {
          answer = JSON.parse(stdout) as Answer
        } catch {
          done(failure("files.sync-failed", `files sync failed: ${error?.message.split("\n")[0] ?? "no answer"}`))
          return
        }
        if (answer.item === undefined) {
          const reason = answer.error?.message ?? "files sync answered no item"
          done(
            failure(
              answer.error?.reason ?? "files.sync-failed",
              reason,
              (answer.error?.code as Failed["code"]) ?? "internal_error",
            ),
          )
          return
        }
        const { notes = [], notesEmbedded, enrichment, failed = [] } = answer.item
        done({
          ran: true,
          notes,
          ...(notesEmbedded ? { notesEmbedded } : {}),
          ...(enrichment ? { enrichment } : {}),
          failed,
        })
      },
    )
    child.stderr?.pipe(process.stderr)
  })
}
