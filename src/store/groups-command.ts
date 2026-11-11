import type { Streams } from "@wirecat/cli-base"
import { CliError } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { commandWords, grantsAuthority, LOCAL_READ, LOCAL_WRITE, queryTerms, withQuery } from "@wirecat/cli-core/cli"
import {
  addGroupMember,
  deleteAccountGroup,
  type GroupMembership,
  listAccountGroups,
  moveGroupMember,
  removeGroupMember,
  renameAccountGroup,
  setAccountScope,
  setChatScope,
} from "@wirecat/cli-core/services"
import type { MessageStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer, listAnswer, withStore } from "../answer.js"
import { APP } from "../app.js"
import { MEMO_ACCOUNT } from "./group.js"

type Scope = "personal" | "work"

/** With --chat, `account` takes the chat's own scope off, so it follows its account again. */
const scopeOption = (scope: string, chat: string | undefined): Scope | null => {
  if (scope === "personal" || scope === "work") return scope
  if (scope === "account" && chat !== undefined) return null
  throw new CliError(
    "validation_error",
    chat === undefined
      ? `--scope ${scope}: personal or work`
      : `--scope ${scope}: personal, work, or account to let the chat follow its account`,
    { reason: "input.invalid", param: "scope" },
  )
}

const MEMBER_HELP = "one account, as --source names it: telegram:102, tg:work, email:me@work.example, bitrix24:<portal>"

/** memo's own entity: one group and its accounts. */
const GROUPS_QUERY = { entity: "account_group", backend: "native", fields: [] } as const satisfies QueryRegistry

const at = (store: MessageStore, env: NodeJS.ProcessEnv) => ({ store, account: MEMO_ACCOUNT, app: APP, env })

export const membershipText = ({ groups, duplicates, suggested, unresolved }: GroupMembership): string =>
  [
    ...Object.entries(groups).flatMap(([name, members]) => [
      `${name}${members.length ? "" : "  (empty)"}`,
      ...members.map((member) =>
        [
          `  ${member.provider}:${member.account}`,
          member.profiles.length ? member.profiles.join(", ") : "",
          member.reason === "setting" ? "" : member.reason,
          member.also_in.length ? `also in ${member.also_in.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("  "),
      ),
    ]),
    ...duplicates.map(({ member, groups: names }) => `duplicate: ${member} is in ${names.join(", ")}`),
    ...suggested.map(({ group, member, because }) => `suggested: ${member} for ${group} — ${because}`),
    ...unresolved.map((entry) => `unresolved: ${entry} names no account`),
  ].join("\n")

/**
 * `memo groups …`: which accounts each group holds (WC-ACCT-13), and the owner's edits of that. cli-core computes the
 * membership and makes each change in one write; memo names its own command words as words no group may take.
 */
export const groupsCommand = (program: Command, streams: Streams, env: NodeJS.ProcessEnv): void => {
  const { print } = answers(program, streams, env)
  const groups = program.command("groups").description("account groups: memo <group> … reads only the group's accounts")
  /** Every answer, a read's or an edit's, is the groups as `groups list` gives them: one row per group. */
  const show = async (
    command: string,
    json: boolean | undefined,
    work: (store: MessageStore) => Promise<GroupMembership>,
  ) => {
    const membership = await withStore(env, work)
    const { groups: named, duplicates, suggested, unresolved } = membership
    const items = Object.entries(named).map(([group, members]) => ({
      group,
      members,
      duplicates: duplicates.filter(({ groups: names }) => names.includes(group)),
      suggested: suggested.filter((one) => one.group === group),
    }))
    print(
      json,
      listAnswer(command, {
        items,
        limit: Math.max(1, items.length),
        has_more: false,
        missing: unresolved.map((entry) => ({
          field: entry,
          why: "a saved group entry that names no account",
        })),
      }),
      membershipText(membership),
    )
  }
  const reserved = () => commandWords(program)

  withQuery(
    annotate(groups.command("list"), { effects: LOCAL_READ, output: { entity: "account_group" } }),
    GROUPS_QUERY,
  )
    .description(
      "every saved group, then all, with its accounts, each with its profiles in every app and the other groups that " +
        "hold it too; duplicates and profile-name suggestions last",
    )
    .summary("the saved groups, then all, with accounts, profiles and duplicates")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (words: string[], options: { json?: boolean }) => {
      queryTerms(words, GROUPS_QUERY, "groups list")
      await show("groups list", options.json, (store) => listAccountGroups(at(store, env)))
    })

  grantsAuthority(annotate(groups.command("add"), { effects: LOCAL_WRITE, output: { entity: "account_group" } }))
    .description("put an account in a group, which is made when it does not exist; it may stay in others too")
    .summary("put an account in a group")
    .argument("<group>", "the group: letters, digits, - and _, not a memo command word")
    .argument("<source>", MEMBER_HELP)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((group: string, member: string, options: { json?: boolean }) =>
      show("groups add", options.json, (store) =>
        addGroupMember(at(store, env), { group, member, reserved: reserved() }),
      ),
    )

  grantsAuthority(annotate(groups.command("remove"), { effects: LOCAL_WRITE, output: { entity: "account_group" } }))
    .description("take an account out of a group; the account and its data stay, and `all` still reads it")
    .summary("take an account out of a group")
    .argument("<group>", "the group")
    .argument("<source>", MEMBER_HELP)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((group: string, member: string, options: { json?: boolean }) =>
      show("groups remove", options.json, (store) => removeGroupMember(at(store, env), { group, member })),
    )

  // The words, not --from/--to: the shared vocabulary gives --to to a message's recipient.
  grantsAuthority(annotate(groups.command("move"), { effects: LOCAL_WRITE, output: { entity: "account_group" } }))
    .description("move an account from one group to another in one write; the other group is made when it is new")
    .summary("move an account between groups")
    .argument("<source>", MEMBER_HELP)
    .argument("<from>", "the group it leaves")
    .argument("<to>", "the group it joins")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((member: string, from: string, to: string, options: { json?: boolean }) =>
      show("groups move", options.json, (store) =>
        moveGroupMember(at(store, env), { member, from, to, reserved: reserved() }),
      ),
    )

  grantsAuthority(annotate(groups.command("rename"), { effects: LOCAL_WRITE, output: { entity: "account_group" } }))
    .description(
      "give a group another name, with its members; a run, lock or agent that still names the old one is refused " +
        "with the groups there are",
    )
    .summary("rename a group")
    .argument("<group>", "the group")
    .argument("<name>", "its new name: letters, digits, - and _, not a memo command word")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((from: string, to: string, options: { json?: boolean }) =>
      show("groups rename", options.json, (store) =>
        renameAccountGroup(at(store, env), { from, to, reserved: reserved() }),
      ),
    )

  grantsAuthority(annotate(groups.command("delete"), { effects: LOCAL_WRITE, output: { entity: "account_group" } }))
    .description(
      "delete a group and its memberships; its accounts and their data stay, in their other groups and in `all`",
    )
    .summary("delete a group")
    .argument("<group>", "the group")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((group: string, options: { json?: boolean }) =>
      show("groups delete", options.json, (store) => deleteAccountGroup(at(store, env), group)),
    )

  // Moving an account to work lets work views and agents of a work group read it: the owner's word, never an agent's.
  grantsAuthority(
    annotate(groups.command("update"), {
      effects: LOCAL_WRITE,
      mcp: false,
      output: { entity: "account_scope" },
    }),
  )
    .description(
      "set an account's scope, personal or work, which decides whether work views and meeting preparation read it; " +
        "with --chat, pin one chat of it to a scope, or let it follow its account again",
    )
    .summary("set an account's or one chat's scope, personal or work")
    .argument("<source>", MEMBER_HELP)
    .requiredOption("--scope <scope>", "personal or work; with --chat also account, which takes the chat's own off")
    .option("--chat <chat>", "one chat of the account, by its id there")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (member: string, options: { scope: string; chat?: string; json?: boolean }) => {
      const scope = scopeOption(options.scope, options.chat)
      if (options.chat === undefined) {
        const account = await withStore(env, (store) =>
          setAccountScope(at(store, env), { member, scope: scope as Scope }),
        )
        print(options.json, itemAnswer(account), `${account.provider}:${account.account} is ${account.scope}`)
        return
      }
      const chat = await withStore(env, (store) =>
        setChatScope(at(store, env), { member, chat: options.chat as string, scope }),
      )
      print(
        options.json,
        itemAnswer(chat),
        `chat ${chat.chat} of ${chat.provider}:${chat.account} is ${chat.scope}` +
          (chat.own === null ? ", as its account" : ", its own"),
      )
    })
}
