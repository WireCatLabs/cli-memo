import { CliError, type KeyringStore, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { readSecret } from "@wirecat/cli-core"
import { environmentOf, grantsAuthority, LOCAL_WRITE, modelCatalogueCommand } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { answers, itemAnswer } from "../answer.js"
import { APP } from "../app.js"
import { whoRuns } from "../author.js"
import { KEY_PROVIDERS, type KeyProvider, providerKeys } from "../sources/readers/keys.js"

const providerOf = (given: string): KeyProvider => {
  if ((KEY_PROVIDERS as readonly string[]).includes(given)) return given as KeyProvider
  throw new CliError("validation_error", `memo keeps keys for ${KEY_PROVIDERS.join(" and ")}, not ${given}`, {
    reason: "input.invalid",
    param: "provider",
  })
}

const keysCommand = (models: Command, streams: Streams, env: NodeJS.ProcessEnv, keyring?: KeyringStore) => {
  const { print } = answers(models, streams, env)
  const keys = models.command("keys").description("API keys for the readers that propose facts from a source")
  const owner = async (command: Command) => {
    if ((await whoRuns(command, env, { question: "change this key?" })) !== "owner")
      throw new CliError("permission_error", "only the owner keeps or forgets an API key")
  }

  grantsAuthority(
    annotate(keys.command("set"), { effects: LOCAL_WRITE, output: { entity: "model_key", view: "stored" } }),
  )
    .argument("<provider>", KEY_PROVIDERS.join(" or "))
    .summary("keep a provider's API key in the system keyring")
    .description("keep a key in the system keyring, typed at a hidden prompt or piped on stdin, never as an argument")
    .option("--from-app", "you did this in WireCat Desktop: record it as yours, with no terminal question")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (given: string, options: { json?: boolean }, command: Command) => {
      const provider = providerOf(given)
      await owner(command)
      const stdin = environmentOf(command).stdin
      const key = (await readSecret(`API key for ${provider}: `, stdin ? { input: stdin } : {})).trim()
      if (!key)
        throw new CliError("validation_error", "no key was given; nothing was kept", { reason: "input.invalid" })
      const stored = providerKeys({ env, ...(keyring ? { keyring } : {}) }).write(provider, key)
      print(options.json, itemAnswer({ provider, stored }), `kept the ${provider} key in the ${stored}`)
    })

  grantsAuthority(
    annotate(keys.command("remove"), { effects: LOCAL_WRITE, output: { entity: "model_key", view: "removed" } }),
  )
    .argument("<provider>", KEY_PROVIDERS.join(" or "))
    .description("forget a kept key")
    .option("--from-app", "you did this in WireCat Desktop: record it as yours, with no terminal question")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (given: string, options: { json?: boolean }, command: Command) => {
      const provider = providerOf(given)
      await owner(command)
      const removed = providerKeys({ env, ...(keyring ? { keyring } : {}) }).remove(provider)
      print(options.json, itemAnswer({ provider, removed }), `forgot the ${provider} key`)
    })
}

export const modelsCommand = (
  program: Command,
  streams: Streams,
  env: NodeJS.ProcessEnv,
  keyring?: KeyringStore,
): void => {
  const { print } = answers(program, streams, env)
  const models = modelCatalogueCommand(APP, {
    kinds: ["text"],
    jsonOption: true,
    env: () => env,
    output: (body, command) => print(command.optsWithGlobals<{ json?: boolean }>().json, body),
    diagnostic: (line) => streams.diagnostic(line),
    offline: () => program.opts().offline === true,
  })
  keysCommand(models, streams, env, keyring)
  program.addCommand(models)
}
