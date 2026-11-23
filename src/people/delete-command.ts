import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_WRITE } from "@wirecat/cli-core/cli"
import type { PersonErasure } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer, withStore } from "../answer.js"
import { byOption } from "../author.js"
import { personOf } from "./identity.js"
import { asOwner } from "./proposal-rows.js"

const counts = (rows: Record<string, number>) =>
  Object.entries(rows)
    .map(([where, n]) => `${n} ${where}`)
    .join(", ")

const planText = (plan: PersonErasure) =>
  [
    `${plan.erased ? "deleted" : "this deletes"} ${plan.person}${plan.name ? ` (${plan.name})` : ""}`,
    `  identities: ${plan.identities.join(", ") || "none"}`,
    ...(Object.keys(plan.deleted).length ? [`  deleted with them: ${counts(plan.deleted)}`] : []),
    ...(Object.keys(plan.detached).length ? [`  stay, without the person: ${counts(plan.detached)}`] : []),
    ...(plan.kept.length
      ? [
          `  stay with no person, as messages, mail or meetings name them; the next sync or people scan makes a ` +
            `person again: ${plan.kept.map(({ identity, references }) => `${identity} (${references})`).join(", ")}`,
        ]
      : []),
  ].join("\n")

export const deleteCommand = (people: Command, program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  byOption(
    annotate(people.command("delete"), {
      effects: LOCAL_WRITE,
      output: { entity: "person_erasure" },
      examples: ["memo people delete person:17", "memo people delete person:17 --yes"],
    })
      .summary("delete a person and what memo knows of them alone; only you")
      .description(
        "delete a person, their identities, and the tags, links, aliases and mentions that name them. A fact, note, " +
          "task or imported entry that names them stays and loses the name. Messages, mail and meetings are their " +
          "source's: they stay, and the next sync makes their sender a person again. An invoice, order or " +
          "subscription that names the person must be changed first. Without --yes it shows what would go and " +
          "changes nothing",
      )
      .argument("<who>", "person:<uid> as people list prints it, or an identity of the person")
      .option("--yes", "delete; nothing of the person can be brought back"),
  )
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (who: string, options: { yes?: boolean; json?: boolean }, command: Command) => {
      const person = await withStore(env, async (store) => `person:${(await personOf(store, who)).uid}`)
      const by = await asOwner(command, env, `delete ${person}?`)
      const plan = await withStore(env, (store) => store.people.erase(person, by, { apply: options.yes === true }))
      if (!plan.erased)
        throw new CliError("confirmation_required", `${planText(plan)}\nnothing was changed — add --yes`, {
          reason: "person.delete-confirm",
          plan,
        })
      print(options.json, itemAnswer(plan), planText(plan))
    })
}
