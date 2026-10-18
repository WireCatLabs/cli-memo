// `cli-dev docs-check --rules` reads this. git lists the real documents, so nothing under node_modules or a
// sandbox placeholder is walked.
import { execFileSync } from "node:child_process"
import { join } from "node:path"
import { type DocsRules, JOURNAL_IDS } from "@wirecat/cli-base/release"

// Sections up to 0.65.2 were released with memo's own headings; a released section is never edited.
export const CHANGELOG = {
  headings: ["Added", "Changed — may break callers", "Fixed", "Security", "Removed"],
  unreleased: "Unreleased",
  ids: JOURNAL_IDS,
  legacyHeadingsThrough: "0.65.2",
}

export function docsRules(root: string): DocsRules {
  const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.md"], {
    cwd: root,
    encoding: "utf8",
  })
  return {
    files: listed
      .split("\n")
      .filter(Boolean)
      .map((file) => join(root, file)),
    ids: JOURNAL_IDS,
    userPage: (name) => name === "README.md",
  }
}
