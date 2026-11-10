import type { Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import { LOCAL_READ } from "@wirecat/cli-core/cli"
import type { PersonDoubt } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, listAnswer, withStore } from "../answer.js"
import { positive } from "../options.js"
import { groupOf, keepInGroup } from "../store/group.js"

const textOf = (doubt: PersonDoubt): string =>
  [
    `${doubt.person}${doubt.name ? ` ${doubt.name}` : ""}${doubt.owner ? " (you)" : ""} · ${doubt.reason}`,
    `  ${doubt.why}`,
    ...doubt.identities.map(
      ({ identity, name, method, by, at }) =>
        `  ${identity}${name ? `  ${name}` : ""}  (${method} by ${by}, ${at.slice(0, 10)})`,
    ),
    ...doubt.fix.map((command) => `  fix: memo ${command}`),
  ].join("\n")

/** People that may be wrong across the whole store, so the owner or an agent can set them right. */
export const doubtsCommand = (people: Command, program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const links =
    people.commands.find((command) => command.name() === "links") ??
    people.command("links").description("who is who: the links that make identities one person")
  annotate(links.command("check"), { effects: LOCAL_READ })
    .summary("people that may be wrong, with why and the command that fixes each")
    .description(
      "people that may be wrong, you first: your person holding an identity under another name, test data, an " +
        "identity joined by an address a person of another name has, one person with different names and nothing " +
        "in common. Each says why and gives the unlink or unmerge that fixes it; an agent adds --reason and it waits " +
        "for you in people review. What you linked by hand, or kept together by turning a split down, is left out",
    )
    .option("--limit <n>", "most people on a page, up to 200", positive, 20)
    .option("--page <n>", "which page, from 1", positive, 1)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (options: { limit: number; page: number; json?: boolean }) => {
      const limit = Math.min(options.limit, 200)
      const counted = groupOf(env) === undefined
      const found = await withStore(env, async (store) => {
        const page = await store.people.doubts({ limit, offset: (options.page - 1) * limit })
        // In a group the total covers people outside it (WC-ACCT-13), so the answer claims none.
        return { ...page, items: await keepInGroup(store, env, page.items, ({ person }) => person) }
      })
      print(
        options.json,
        listAnswer("people links check", {
          items: found.items,
          limit,
          page: options.page,
          has_more: found.hasMore,
          ...(counted ? { total: { value: found.total, relation: "eq" as const } } : {}),
        }),
        [
          found.items.map(textOf).join("\n\n") || (found.hasMore ? "none on this page" : "no person looks wrong"),
          ...(found.hasMore ? [`more: --page ${options.page + 1}`] : []),
        ].join("\n\n"),
      )
    })
}
