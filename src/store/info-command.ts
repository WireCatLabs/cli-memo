import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { itemOf, LOCAL_READ, storeInfo } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { answers } from "../answer.js"

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
}
