import { type ConfigIssue, type ConfigIssueKind, knownPermissionKeys } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import * as v from "valibot"

// cli-core keeps its parser and schema walk private to its profile settings; memo's file has no profiles, so this
// is the same walk for a flat file, with the same issue shape `doctor --json` reports.

interface Located extends ConfigIssue {
  at: string[]
}

const SHELL_SAFE = /^[A-Za-z0-9_.:@-]*$/

const isNode = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const locate = (kind: ConfigIssueKind, at: readonly string[], file: string, what: (key: string) => string): Located => {
  const setting = at[0] === "permissions" ? at.slice(0, 2) : [...at]
  const key = setting.join(".")
  return {
    kind,
    file,
    key,
    what: what(key),
    // A fix runs exactly as written; a key a shell would split or expand gets none.
    ...(SHELL_SAFE.test(key) ? { fix: `memo config unset ${key}` } : {}),
    at: setting,
  }
}

/** Where parsing stops. V8 names no position for "Unexpected token" or "Unexpected end", and Bun for none. */
const failureOffset = (text: string): number => {
  let i = 0
  const fail = (): never => {
    throw i
  }
  const space = () => {
    while (/[ \t\n\r]/.test(text[i] ?? "")) i++
  }
  const expect = (char: string) => {
    space()
    if (text[i] !== char) fail()
    i++
  }
  const string = () => {
    expect('"')
    while (text[i] !== '"') {
      if (i >= text.length || text.charCodeAt(i) < 0x20) fail()
      i += text[i] === "\\" ? 2 : 1
    }
    i++
  }
  const items = (close: string, item: () => void) => {
    i++
    space()
    if (text[i] === close) {
      i++
      return
    }
    for (;;) {
      item()
      space()
      if (text[i] === close) break
      expect(",")
    }
    i++
  }
  const value = (): void => {
    space()
    const char = text[i] ?? ""
    if (char === "{")
      items("}", () => {
        string()
        expect(":")
        value()
      })
    else if (char === "[") items("]", value)
    else if (char === '"') string()
    else {
      const word = /^(true|false|null|-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?)/.exec(text.slice(i))
      if (!word) fail()
      i += word?.[0].length ?? 0
    }
  }
  try {
    value()
    space()
    return i
  } catch (at) {
    return typeof at === "number" ? at : i
  }
}

export const parseConfigText = (text: string, file: string): { raw: unknown } | { issue: ConfigIssue } => {
  try {
    return { raw: JSON.parse(text) }
  } catch {
    const before = text.slice(0, failureOffset(text)).split("\n")
    const line = before.length
    const column = (before.at(-1)?.length ?? 0) + 1
    return {
      issue: {
        kind: "invalid_json",
        file,
        line,
        column,
        what: `the file is not valid JSON at line ${line}, column ${column}`,
      },
    }
  }
}

/** The file without the settings the issues name: what still loads, and what `config unset` would leave. */
export const withoutPaths = (raw: unknown, paths: readonly (readonly string[])[]): unknown => {
  const drop = new Set(paths.map((at) => at.join("\u0000")))
  if (drop.has("")) return {}
  const prune = (node: unknown, at: string[]): unknown => {
    const kept = (key: string, item: unknown) => {
      const path = [...at, key]
      return drop.has(path.join("\u0000")) ? [] : [[key, prune(item, path)] as const]
    }
    if (Array.isArray(node)) return node.flatMap((item, index) => kept(String(index), item).map(([, one]) => one))
    if (isNode(node)) return Object.fromEntries(Object.entries(node).flatMap(([key, item]) => kept(key, item)))
    return node
  }
  return prune(raw, [])
}

/** What a value has to be, never what it was: valibot's own messages quote the value they got. */
const ruleOf = (issue: v.BaseIssue<unknown>): string => {
  if (issue.type === "picklist") return `has to be one of ${issue.expected}`
  if (issue.kind === "schema") return `has to be of type ${issue.expected}`
  return issue.expected === null ? "has a value it does not take" : `has to be ${issue.expected}`
}

const onePass = (raw: unknown, schema: v.GenericSchema, file: string): Located[] => {
  const result = v.safeParse(schema, raw)
  if (result.success) return []
  return result.issues.map((issue) => {
    const at = (issue.path ?? []).map((item) => String(item.key))
    const last = issue.path?.at(-1)
    if (issue.expected === "never")
      return locate("unknown_setting", at, file, (key) => `setting ${key} is not a setting of memo`)
    if (last && "origin" in last && last.origin === "key" && issue.input === undefined) {
      const { fix: _, ...missing } = locate("missing_setting", at, file, (key) => `setting ${key} is missing`)
      return missing
    }
    if (at.length === 0) return { kind: "invalid_value", file, what: "the file has to be an object, in braces", at }
    return locate("invalid_value", at, file, (key) => `setting ${key} ${ruleOf(issue)}`)
  })
}

/** Every problem the schema finds, never only the first: valibot names only the first unknown key of an object. */
const schemaIssues = (raw: unknown, schema: v.GenericSchema, file: string): Located[] => {
  const found = new Map<string, Located>()
  for (;;) {
    const fresh = onePass(
      withoutPaths(
        raw,
        [...found.values()].map(({ at }) => at),
      ),
      schema,
      file,
    ).filter((issue) => !found.has(issue.at.join("\u0000")))
    for (const issue of fresh) found.set(issue.at.join("\u0000"), issue)
    // A missing setting cannot be removed, so another pass would find it again.
    if (fresh.every((issue) => issue.kind === "missing_setting" || issue.at.length === 0)) return [...found.values()]
  }
}

const publicIssue = ({ at: _, ...issue }: Located): ConfigIssue => issue

/** Every problem in the file and what of it still loads; `program` adds the permission keys no command checks. */
export const checkConfig = <T extends v.GenericSchema>(
  text: string,
  file: string,
  schema: T,
  program?: Command,
): { issues: ConfigIssue[]; config: v.InferOutput<T> | undefined } => {
  const parsed = parseConfigText(text, file)
  if ("issue" in parsed) return { issues: [parsed.issue], config: undefined }
  const located = schemaIssues(parsed.raw, schema, file)
  const loaded = v.safeParse(
    schema,
    withoutPaths(
      parsed.raw,
      located.map(({ at }) => at),
    ),
  )
  const config = loaded.success ? loaded.output : undefined
  const permissions = isNode(parsed.raw) && isNode(parsed.raw.permissions) ? Object.keys(parsed.raw.permissions) : []
  return {
    issues: [...located.map(publicIssue), ...(program ? permissionIssues(program, file, permissions) : [])],
    config,
  }
}

const pathOf = (command: Command): string[] => {
  const words: string[] = []
  for (let at = command; at.parent; at = at.parent) words.unshift(at.name())
  return words
}

/** Memo's permission keys are command paths, plus the MCP server's own `mcp.authority`. */
export const permissionKeyOf = (command: Command) => pathOf(command).join(".") || null

export const memoPermissionKeys = (program: Command) => knownPermissionKeys(program, permissionKeyOf, ["mcp.authority"])

export const permissionIssues = (program: Command, file: string, keys: readonly string[]): ConfigIssue[] => {
  const known = memoPermissionKeys(program)
  return keys
    .filter((key) => !known.has(key))
    .map((key) =>
      publicIssue(locate("unknown_permission", ["permissions", key], file, (at) => `${at} names no command`)),
    )
}

/** One line for a command that refuses to run on the file: the first problem, how to fix it, and how many more. */
export const issueMessage = (issues: readonly ConfigIssue[]): string => {
  const [first] = issues
  if (!first) return ""
  const more = issues.length - 1
  return (
    `${first.file}: ${first.what}` +
    (first.fix ? ` — remove it with \`${first.fix}\`` : "") +
    (more === 0 ? "" : ` (and ${more} more problem${more === 1 ? "" : "s"} — \`memo doctor\` lists them all)`)
  )
}
