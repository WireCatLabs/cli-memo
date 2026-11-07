import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import {
  itemOf,
  LOCAL_READ,
  LOCAL_WRITE,
  recoveryNotes,
  snakeKeys,
  storeInfo,
  storeRecoveryCheck,
  storeRecoveryRun,
} from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { answers } from "../answer.js"
import { VERSION } from "../version.js"

export const storeCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const store = annotate(program.command("store"), { effects: LOCAL_READ }).description(
    "the shared local store every WireCat tool reads",
  )
  annotate(store.command("info"), { effects: LOCAL_READ, output: { entity: "store_info" } })
    .summary("the shared store's format and size, and whether memo can read it")
    .description(
      "the store file: where it is, its size, its schema against the one memo speaks, which tools used it and how many rows it holds; changes nothing",
    )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (options: { json?: boolean }) => print(options.json, itemOf(await storeInfo(env))))

  const recover = annotate(store.command("recover"), { effects: LOCAL_READ })
    .summary("what is damaged in the store and how to recover it")
    .description(
      "check every page and search index of the store, say what is damaged, what it means and the commands that recover it; changes nothing",
    )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (options: { json?: boolean }) => {
      const answer = await storeRecoveryCheck(env, "memo")
      print(options.json, itemOf(snakeKeys(answer)), recoveryNotes(answer).join("\n"))
    })
  annotate(recover.command("run"), { effects: LOCAL_WRITE })
    .summary("rebuild a damaged store from every row it can read")
    .description(
      "copy every readable row into a new file with the sqlite3 program, rebuild the search indexes, mentions and vector index, " +
        "check it, and put it in place of the store; the damaged file is kept beside it. Refuses while a WireCat timer or process has the store",
    )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (options: { json?: boolean }) => {
      const answer = await storeRecoveryRun(env, {
        command: "memo",
        version: VERSION,
        note: (text) => streams.diagnostic(text),
      })
      print(options.json, itemOf(snakeKeys(answer)), recoveryNotes(answer).join("\n"))
    })
}
