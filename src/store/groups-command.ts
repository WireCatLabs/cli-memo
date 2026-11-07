import { CliError, type Streams } from "@wirecat/cli-base"
import { annotate } from "@wirecat/cli-base/commands"
import type { QueryRegistry } from "@wirecat/cli-base/query"
import { commandWords, grantsAuthority, LOCAL_READ, LOCAL_WRITE, queryTerms, withQuery } from "@wirecat/cli-core/cli"
import {
  addGroupMember,
  type GroupMembership,
  groupLockOf,
  listAccountGroups,
  moveGroupMember,
  removeGroupMember,
} from "@wirecat/cli-core/services"
import type { MessageStore } from "@wirecat/cli-core/store"
import type { Command } from "commander"
import { answers, itemAnswer, listAnswer, withStore } from "../answer.js"
import { APP } from "../app.js"
import { MEMO_ACCOUNT } from "./group.js"

const MEMBER_HELP = "one account, as --source names it: telegram:102, tg:work, email:me@work.example, bitrix24:<portal>"

/** memo's own entity: one group and its accounts. */
const GROUPS_QUERY = { entity: "account_group", backend: "native", fields: [] } as const satisfies QueryRegistry

const at = (store: MessageStore) => ({ store, account: MEMO_ACCOUNT, app: APP })

const isMemo = (key: { provider: string; account: string }) =>
  key.provider === MEMO_ACCOUNT.provider && key.account === MEMO_ACCOUNT.account

/** cli-core lists the account a run is as, and memo runs as none: its own notes are no stored account. */
const withoutMemo = (membership: GroupMembership): GroupMembership => ({
  ...membership,
  groups: Object.fromEntries(
    Object.entries(membership.groups).map(([name, members]) => [name, members.filter((one) => !isMemo(one))]),
  ),
})

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
  const show = async (json: boolean | undefined, work: (store: MessageStore) => Promise<GroupMembership>) => {
    const membership = withoutMemo(await withStore(env, work))
    print(json, itemAnswer(membership), membershipText(membership))
  }
  const reserved = () => commandWords(program)
  // A run locked to a group must not widen the group it is locked to, nor any other.
  const change = (json: boolean | undefined, work: (store: MessageStore) => Promise<GroupMembership>) => {
    const lock = groupLockOf(APP, env)
    if (lock !== undefined)
      throw new CliError(
        "permission_error",
        `this process is locked to group ${lock} (MEMO_GROUP_LOCK) — only the owner changes groups`,
      )
    return show(json, work)
  }

  withQuery(annotate(groups.command("list"), { effects: LOCAL_READ }), GROUPS_QUERY)
    .description(
      "every group with its accounts, each with its profiles in every app, why it is in, and the other groups that " +
        "hold it too; duplicates and profile-name suggestions last",
    )
    .summary("every group with its accounts, profiles, duplicates and suggestions")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action(async (words: string[], options: { json?: boolean }) => {
      queryTerms(words, GROUPS_QUERY, "groups list")
      const {
        groups: named,
        duplicates,
        suggested,
        unresolved,
      } = withoutMemo(await withStore(env, (store) => listAccountGroups(at(store))))
      const items = Object.entries(named).map(([group, members]) => ({
        group,
        members,
        duplicates: duplicates.filter(({ groups: names }) => names.includes(group)),
        suggested: suggested.filter((one) => one.group === group),
      }))
      print(
        options.json,
        listAnswer("groups list", {
          items,
          limit: Math.max(1, items.length),
          has_more: false,
          missing: unresolved.map((entry) => ({
            field: entry,
            why: "a saved group entry that names no account; personal may hold what it meant",
          })),
        }),
        membershipText({ groups: named, duplicates, suggested, unresolved }),
      )
    })

  grantsAuthority(annotate(groups.command("add"), { effects: LOCAL_WRITE }))
    .description("put an account in a group, which is made when it does not exist; it may stay in others too")
    .summary("put an account in a group")
    .argument("<group>", "the group: letters, digits, - and _, not a memo command word")
    .argument("<source>", MEMBER_HELP)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((group: string, member: string, options: { json?: boolean }) =>
      change(options.json, (store) => addGroupMember(at(store), { group, member, reserved: reserved() })),
    )

  grantsAuthority(annotate(groups.command("remove"), { effects: LOCAL_WRITE }))
    .description(
      "take an account out of a group; one in no group left is in personal again. The account and its data stay",
    )
    .summary("take an account out of a group")
    .argument("<group>", "the group")
    .argument("<source>", MEMBER_HELP)
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((group: string, member: string, options: { json?: boolean }) =>
      change(options.json, (store) => removeGroupMember(at(store), { group, member })),
    )

  // The words, not --from/--to: the shared vocabulary gives --to to a message's recipient.
  grantsAuthority(annotate(groups.command("move"), { effects: LOCAL_WRITE }))
    .description("move an account from one group to another in one write; the other group is made when it is new")
    .summary("move an account between groups")
    .argument("<source>", MEMBER_HELP)
    .argument("<from>", "the group it leaves")
    .argument("<to>", "the group it joins")
    .option("--json", "print JSON; --json=id,title keeps only those fields")
    .action((member: string, from: string, to: string, options: { json?: boolean }) =>
      change(options.json, (store) => moveGroupMember(at(store), { member, from, to, reserved: reserved() })),
    )
}
