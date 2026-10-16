import { describe, expect, it } from "vitest"
import { ATTACHMENT_CHARS, withAttachmentText } from "./messages-command.js"

const hit = (names: string[]) =>
  ({
    id: "m1",
    locator: "msg:email/alice@example.com/t1/m1",
    attachments: names.map((name) => ({ kind: "file", name })),
  }) as unknown as Parameters<typeof withAttachmentText>[0]

const file = (text: string | null, extractionError: string | null = null) => ({
  text,
  extraction: text ? "text" : "failed",
  extractionError,
})

describe("messages show attachment text", () => {
  it("puts each attachment's extracted text next to its name", () => {
    const shown = withAttachmentText(hit(["bill.pdf"]), [file("Total 85,93 €\nPay by 5 Oct")], false)
    expect(shown.attachments).toEqual([
      { kind: "file", name: "bill.pdf", text: "Total 85,93 €\nPay by 5 Oct", text_chars: 26 },
    ])
  })

  it("cuts long text unless the whole of it is asked for", () => {
    const long = "x".repeat(ATTACHMENT_CHARS + 10)
    const [cut] = withAttachmentText(hit(["scan.pdf"]), [file(long)], false).attachments ?? []
    expect(cut).toMatchObject({ text_chars: ATTACHMENT_CHARS + 10, text_cut: true })
    expect((cut as unknown as { text: string }).text).toHaveLength(ATTACHMENT_CHARS)
    const [whole] = withAttachmentText(hit(["scan.pdf"]), [file(long)], true).attachments ?? []
    expect((whole as unknown as { text: string }).text).toHaveLength(ATTACHMENT_CHARS + 10)
  })

  it("says why a file has no text", () => {
    const [scan] = withAttachmentText(hit(["photo.pdf"]), [file(null, "needs-agent")], false).attachments ?? []
    expect(scan).toEqual({ kind: "file", name: "photo.pdf", extraction: "needs-agent" })
  })
})
