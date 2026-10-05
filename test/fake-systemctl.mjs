#!/usr/bin/env node
// Stands in for systemctl in tests: appends its arguments to MEMO_SYSTEMCTL_LOG and answers `show` and `list-timers`.
import { appendFileSync } from "node:fs"

const args = process.argv.slice(2)
if (process.env.MEMO_SYSTEMCTL_LOG) appendFileSync(process.env.MEMO_SYSTEMCTL_LOG, `${args.join(" ")}\n`)
if (args.includes("show")) process.stdout.write("ActiveState=active\nResult=success\n")
if (args.includes("list-timers")) process.stdout.write(JSON.stringify([{ next: 1791240613053414, last: 0 }]))
