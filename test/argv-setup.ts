import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

export default function setup(): void {
  const path = process.env.MEMO_TEST_ARGV_LOG ?? join(process.cwd(), "coverage", "argv.jsonl")
  mkdirSync(dirname(path), { recursive: true })
  if (existsSync(path)) copyFileSync(path, join(dirname(path), "argv.previous.jsonl"))
  writeFileSync(path, "")
  process.env.MEMO_TEST_ARGV_LOG = path
}
