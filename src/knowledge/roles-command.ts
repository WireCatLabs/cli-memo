import { CliError } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { LOCAL_READ, LOCAL_WRITE, queryTerms, termField, withQuery } from "@wirecat/cli-core/cli"
import type { Command } from "commander"
import { type answers, listAnswer, withStore } from "../answer.js"
import { byOption, whoRuns } from "../author.js"
import { oneOf } from "../options.js"

const LISTS = ["organization", "project", "deal"] as const
type RoleList = (typeof LISTS)[number]

/** memo's own entity: one role of one list. */
const ROLES_QUERY = {
  entity: "relationship_role",
  backend: "native",
  fields: [termField("list", "enum", "list:organization", { values: LISTS })],
} as const satisfies QueryRegistry

const LIST_HELP = "organization (roles in an organization), project or deal (a deal's or a lead's)"

/** Role lists are the owner's settings, as the permissions are: an agent reads them and changes none. */
const ownerOnly = async (command: Command, env: NodeJS.ProcessEnv, asOwner: boolean | undefined, question: string) => {
  if ((await whoRuns(command, env, { asOwner, question })) !== "owner")
    throw new CliError("permission_error", "only the owner changes the role lists; an agent uses the roles they hold", {
      reason: "roles.owner-only",
    })
}

/**
 * `memo relationships roles …`: which roles a relationship may take, built in and the owner's own (NEED-2405).
 * cli-core keeps the lists and refuses a built-in's removal and an owner role still in use.
 */
export const relationshipRolesCommand = (
  relations: Command,
  { print }: Pick<ReturnType<typeof answers>, "print">,
  env: NodeJS.ProcessEnv,
): void => {
  const roles = relations.command("roles").description("the roles a relationship may take: built in and your own")
  const rows = async (lists: readonly RoleList[]) =>
    withStore(env, async (store) =>
      (
        await Promise.all(
          lists.map(async (list) => (await store.knowledge.roles(list)).map((one) => ({ list, ...one }))),
        )
      ).flat(),
    )
  const show = async (json: boolean | undefined, command: string, lists: readonly RoleList[]) => {
    const items = await rows(lists)
    print(
      json,
      listAnswer(command, { items, limit: Math.max(1, items.length), has_more: false }),
      items
        .map(
          ({ list, id, label, builtIn }) => `${list}  ${id}${label ? `  ${label}` : ""}${builtIn ? "" : "  (yours)"}`,
        )
        .join("\n"),
    )
  }

  withQuery(
    annotate(roles.command("list"), { effects: LOCAL_READ, output: { entity: "relationship_role" } }),
    ROLES_QUERY,
  )
    .description(
      "the roles of every list, or of one with list:organization, list:project or list:deal; each built in or yours",
    )
    .summary("the roles a relationship may take")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((words: string[], options: { json?: boolean }) => {
      const list = queryTerms(words, ROLES_QUERY, "relationships roles list").get("list") as RoleList | undefined
      return show(options.json, "relationships roles list", list === undefined ? LISTS : [list])
    })

  byOption(
    annotate(roles.command("add"), { effects: LOCAL_WRITE, output: { entity: "relationship_role" } })
      .description("add a role of your own to a list; relationships may then take it. Only you change the lists")
      .summary("add a role of your own")
      .argument("<list>", LIST_HELP, oneOf(LISTS))
      .argument("<role>", "the role's id: lowercase letters, digits and -, such as board-member")
      .option("--label <label>", "how it reads, such as 'Board member'")
      .option("--json", "print JSON; --json=id,title keeps only those fields"),
  ).action(
    async (
      list: RoleList,
      role: string,
      options: { label?: string; asOwner?: boolean; json?: boolean },
      command: Command,
    ) => {
      await ownerOnly(command, env, options.asOwner, `add the ${list} role ${role} as you?`)
      await withStore(env, (store) => store.knowledge.addRole(list, role, options.label))
      await show(options.json, "relationships roles add", [list])
    },
  )

  byOption(
    annotate(roles.command("remove"), { effects: LOCAL_WRITE, output: { entity: "relationship_role" } })
      .description("remove a role of your own; a built-in one stays, and one a relationship still holds is refused")
      .summary("remove a role of your own")
      .argument("<list>", LIST_HELP, oneOf(LISTS))
      .argument("<role>", "the role's id")
      .option("--json", "print JSON; --json=id,title keeps only those fields"),
  ).action(async (list: RoleList, role: string, options: { asOwner?: boolean; json?: boolean }, command: Command) => {
    await ownerOnly(command, env, options.asOwner, `remove the ${list} role ${role} as you?`)
    await withStore(env, (store) => store.knowledge.removeRole(list, role))
    await show(options.json, "relationships roles remove", [list])
  })
}
