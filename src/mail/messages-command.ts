import { CliError, type Streams } from "@wirecat/cli-base"
import { parseLocator } from "@wirecat/cli-core"
import { readMail } from "@wirecat/cli-core/services"
import type { Command } from "commander"
import { answers, itemAnswer, wholeList, withStore } from "../answer.js"
import { whole } from "../options.js"
import { atDetail } from "../output.js"
import { found } from "../search/command.js"

/** Enough for a bill's amounts and dates; `--full` gives the rest. */
export const ATTACHMENT_CHARS = 4000

type Shown = Awaited<ReturnType<typeof readMail>>[number]

interface StoredFile {
  text: string | null
  extraction: string | null
  extractionError: string | null
}

/** The extracted text of each attachment, next to the name the email lists; a file without text says why. */
export const withAttachmentText = (hit: Shown, files: readonly StoredFile[], full: boolean): Shown => ({
  ...hit,
  attachments: (hit.attachments ?? []).map((attachment, at) => {
    const file = files[at]
    const text = file?.text ?? ""
    if (!text) return { ...attachment, extraction: file?.extractionError ?? file?.extraction ?? "none" }
    const cut = !full && text.length > ATTACHMENT_CHARS
    return {
      ...attachment,
      text: cut ? text.slice(0, ATTACHMENT_CHARS) : text,
      text_chars: text.length,
      ...(cut ? { text_cut: true } : {}),
    }
  }),
})

const attachmentText = (hit: Shown): string =>
  (hit.attachments ?? [])
    .map((attachment) => {
      const file = attachment as typeof attachment & { text?: string; text_chars?: number; extraction?: string }
      const name = file.name ?? file.kind
      if (file.text === undefined) return `  ── attachment ${name}: no text (${file.extraction}) ──`
      const cut = file.text.length < (file.text_chars ?? 0) ? `, first ${file.text.length} of ${file.text_chars}` : ""
      return `  ── attachment ${name} (${file.text_chars} characters${cut}) ──\n  ${file.text.replace(/\n/g, "\n  ")}`
    })
    .join("\n")

export const messagesCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const messages = program.command("messages").description("stored emails; tg and max read messenger messages")
  messages
    .command("show")
    .description("one stored email whole, with its attachments' text and nearby thread emails")
    .argument("<message>", "the email's msg:email/… reference, as search answers give it")
    .option("--before-n <n>", "also this many earlier emails of its thread", whole, 0)
    .option("--after-n <n>", "also this many later emails of its thread", whole, 0)
    .option("--full", `whole attachment text, not the first ${ATTACHMENT_CHARS} characters of each`)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (reference: string, options: { json?: boolean; beforeN: number; afterN: number; full?: boolean }) => {
      const locator = parseLocator(reference)
      if (locator.provider !== "email")
        throw new CliError("validation_error", `${reference} is not an email; tg and max show messenger messages`)
      const emails = await withStore(env, async (store) => {
        const shown = await readMail(store, reference, { before: options.beforeN, after: options.afterN })
        const account = await store.storedAccount({ provider: "email", account: locator.account })
        if (!account) return shown
        return Promise.all(
          shown.map(async (hit) => {
            if (!hit.attachments?.length) return hit
            const email = await store.mail.email(account.id, hit.id)
            return withAttachmentText(hit, email?.attachments ?? [], options.full === true)
          }),
        )
      })
      print(
        options.json,
        options.beforeN || options.afterN
          ? wholeList("messages show", atDetail(emails))
          : itemAnswer(atDetail(emails[0])),
        emails.map((email) => [found(email, "full"), attachmentText(email)].filter(Boolean).join("\n")).join("\n\n"),
      )
    })
}
