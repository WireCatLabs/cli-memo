import { posix } from "node:path"
import { parse } from "yaml"

export interface LinkedDocument {
  path: string
  text: string
}

export interface ResolvedLink {
  target: string
  anchor: string | null
  status: "resolved" | "ambiguous" | "unresolved"
  paths: string[]
}

const fold = (value: string) => value.normalize("NFC").toLocaleLowerCase("en")
const stem = (path: string) => path.replace(/\.(md|markdown|txt|csv|tsv|pdf|docx|xlsx)$/i, "")

export const documentAliases = (text: string): string[] => {
  const body = text.split("\n").slice(2).join("\n")
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(body)
  if (!match) return []
  try {
    const data = parse(match[1] ?? "") as { aliases?: unknown; alias?: unknown } | null
    const aliases = data?.aliases ?? data?.alias
    return typeof aliases === "string"
      ? [aliases]
      : Array.isArray(aliases)
        ? aliases.filter((alias): alias is string => typeof alias === "string")
        : []
  } catch {
    return []
  }
}

export const resolveWikiLinks = (source: LinkedDocument, documents: LinkedDocument[]): ResolvedLink[] => {
  const links = [...source.text.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].slice(0, 200)
  const indexed = documents.map((doc) => ({
    ...doc,
    folded: fold(stem(doc.path)),
    names: [stem(posix.basename(doc.path)), ...documentAliases(doc.text)].map(fold),
  }))
  return links.map((match) => {
    const raw = (match[1] ?? "").trim()
    const split = raw.search(/[#^]/)
    const target = split < 0 ? raw : raw.slice(0, split)
    const anchor = split < 0 ? null : raw.slice(split)
    const normalized = stem(posix.normalize(target.replace(/\\/g, "/").replace(/^\//, "")))
    const relative = stem(posix.normalize(posix.join(posix.dirname(source.path), normalized)))
    const explicit =
      target.startsWith("./") || target.startsWith("../") || target.startsWith("/") || normalized.includes("/")
    const preferred = target.startsWith("./") || target.startsWith("../") ? relative : normalized
    const exact =
      target === ""
        ? indexed.filter((doc) => doc.path === source.path)
        : explicit
          ? indexed.filter((doc) => doc.folded === fold(preferred))
          : []
    const fallback = explicit ? [] : indexed.filter((doc) => doc.names.includes(fold(stem(target))))
    const paths = [...new Set((exact.length ? exact : fallback).map((doc) => doc.path))].sort()
    return {
      target,
      anchor,
      status: paths.length === 1 ? "resolved" : paths.length ? "ambiguous" : "unresolved",
      paths,
    }
  })
}
