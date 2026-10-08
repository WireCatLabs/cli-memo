import { describe, expect, it } from "vitest"
import { dialectOf, type NoteForExport } from "./index.js"

const obsidian = dialectOf("obsidian")
const markdown = dialectOf("markdown")

describe("obsidian", () => {
  it("reads wiki links with anchors and labels, aliases and both kinds of tags", () => {
    const note = obsidian.parse(
      [
        "---",
        "aliases: [Budget Plan]",
        "tags: [project, '#finance']",
        "---",
        "# Plan",
        "",
        "With [[People/Rin Example|Rin]] about [[Budget#Q4]] and [[Ledger#^row-3]]. #follow-up #area/ops",
        "",
        "```",
        "[[Not A Link]] #not-a-tag",
        "```",
      ].join("\n"),
      "Plans/Plan.md",
    )
    expect(note.title).toBe("Plan")
    expect(note.aliases).toEqual(["Budget Plan"])
    expect(note.tags).toEqual(["project", "finance", "follow-up", "area/ops"])
    expect(note.links).toEqual([
      { target: "People/Rin Example", anchor: null, label: "Rin" },
      { target: "Budget", anchor: "#Q4", label: null },
      { target: "Ledger", anchor: "#^row-3", label: null },
    ])
  })

  it("does not take a heading, a link's anchor or a web address for a tag", () => {
    const note = obsidian.parse("## Section\n[[Note#Heading]] [site](https://example.test/#top) #real", "a.md")
    expect(note.tags).toEqual(["real"])
  })

  it("falls back to the file name for the title", () => {
    expect(obsidian.parse("no heading", "Folder/Daily 2026.md").title).toBe("Daily 2026")
  })
})

describe("markdown", () => {
  it("reads relative links, leaves web links out and ignores inline #words", () => {
    const note = markdown.parse(
      "# Plan\n\n[Rin](<People/Rin Example.md>) [Q4](Budget.md#Q4) [web](https://example.test) #not-a-tag",
      "Plan.md",
    )
    expect(note.links).toEqual([
      { target: "People/Rin Example", anchor: null, label: "Rin" },
      { target: "Budget", anchor: "#Q4", label: "Q4" },
    ])
    expect(note.tags).toEqual([])
  })

  it("decodes percent-encoded paths", () => {
    expect(markdown.parse("[Rin](People/Rin%20Example.md)", "a.md").links[0]?.target).toBe("People/Rin Example")
  })
})

describe("both dialects", () => {
  it("recognise typed references, linked or bare", () => {
    const text = "Asked [Rin](person:01JABC) in msg:telegram/1/2/3, see note:01JNOTE."
    for (const dialect of [obsidian, markdown])
      expect(dialect.parse(text, "a.md").links).toEqual([
        { target: "person:01JABC", anchor: null, label: "Rin" },
        { target: "msg:telegram/1/2/3", anchor: null, label: null },
        { target: "note:01JNOTE", anchor: null, label: null },
      ])
  })

  it("parse the same note written in each dialect to the same data", () => {
    const front = "---\ntags: [project]\naliases: [The Plan]\n---\n# Plan\n\n"
    const inObsidian = obsidian.parse(`${front}See [[People/Rin|Rin]] and [[Budget#Q4|Q4]].`, "Plan.md")
    const inMarkdown = markdown.parse(`${front}See [Rin](People/Rin.md) and [Q4](Budget.md#Q4).`, "Plan.md")
    expect(inMarkdown).toEqual(inObsidian)
  })

  it("render what they parse back to the same data", () => {
    const note: NoteForExport = {
      title: "Call with Rin",
      text: "Agreed on the budget.",
      aliases: ["Rin call"],
      tags: ["follow-up"],
      links: [
        { target: "People/Rin Example", anchor: "#Contacts", label: "Rin" },
        { target: "msg:telegram/1/2/3", anchor: null, label: "the message" },
      ],
      frontMatter: { "memo-id": "note-1" },
    }
    for (const dialect of [obsidian, markdown]) {
      const parsed = dialect.parse(dialect.render(note), "Call with Rin.md")
      expect(parsed).toMatchObject({ title: note.title, aliases: note.aliases, tags: note.tags, links: note.links })
      expect(parsed.frontMatter["memo-id"]).toBe("note-1")
    }
  })
})
