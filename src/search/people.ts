import { CliError } from "@wirecat/cli-base"
import { formatReference, isFolderProvider } from "@wirecat/cli-core"
import type { AccountKey, MessageStore, PersonRecord } from "@wirecat/cli-core/store"
import { listAnswer } from "../answer.js"
import { scopedAccounts } from "../store/group.js"
import { accountsOf } from "../store/source-list.js"

export interface PersonIdentity {
  provider: string
  account: string
  id: string
  name: string | null
  username: string | null
  alias: string | null
}

export interface PersonHit {
  ref: string
  name: string | null
  identities: PersonIdentity[]
  aliases: string[]
  /** Why `people list` shows them; empty for someone with no tie to the owner, who is listed after the rest. */
  ties: string[]
}

export interface PeopleFound {
  items: PersonHit[]
  hasMore: boolean
  accounts: AccountKey[]
}

/** Notes folders hold no people; Drive's account does, its files' owners and editors. */
const holdsNoPeople = (provider: string) => provider === "notes" || isFolderProvider(provider)

/** Case, accents, ё and emoji variation marks fold away; SQLite's lower() folds ASCII only, so this runs here. */
export const fold = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()

const scopeOf = async (store: MessageStore, env: NodeJS.ProcessEnv, source: string | undefined) => {
  const keys = source === undefined ? await scopedAccounts(store, env) : await accountsOf(store, env, source)
  const held = keys.filter((key) => !holdsNoPeople(key.provider))
  if (source !== undefined && held.length === 0)
    throw new CliError("validation_error", `${source} names no messenger, mail or meeting account that holds people`, {
      param: "source",
    })
  return held
}

export const searchPeople = async (
  store: MessageStore,
  env: NodeJS.ProcessEnv,
  words: string[],
  { limit, source }: { limit: number; source?: string },
): Promise<PeopleFound> => {
  const wanted = words.flatMap((word) => fold(word).split(/\s+/)).filter(Boolean)
  if (wanted.length === 0) throw new CliError("validation_error", "give a part of the name to find")
  const accounts = await scopeOf(store, env, source)
  const hits = new Map<string, PersonHit>()
  const record = new Map<string, PersonRecord | undefined>()
  for (const key of accounts) {
    for (const contact of (await store.people.people(key.provider, { account: key.account })).all()) {
      const alias = contact.alias ?? null
      const text = fold([contact.name, contact.username, alias].filter(Boolean).join(" "))
      if (!wanted.every((word) => text.includes(word))) continue
      const identityKey = `${key.provider}\u0000${contact.id}`
      if (!record.has(identityKey))
        record.set(identityKey, await store.people.personOf({ provider: key.provider, id: contact.id }))
      const person = record.get(identityKey)
      const ref = person
        ? `person:${person.uid}`
        : formatReference({ type: "contact", provider: key.provider, id: contact.id })
      const hit = hits.get(ref) ?? { ref, name: person?.name ?? contact.name, identities: [], aliases: [], ties: [] }
      hit.identities.push({
        provider: key.provider,
        account: key.account,
        id: contact.id,
        name: contact.name,
        username: contact.username,
        alias,
      })
      if (alias !== null && !hit.aliases.includes(alias)) hit.aliases.push(alias)
      hits.set(ref, hit)
    }
  }
  // A person added by name alone has no identity in any account, so no account above lists them; they are the owner's.
  // `--source` names accounts, which such a person is in none of.
  for (const { person, name } of source === undefined ? await store.tasks.taskPeople({ limit: 5000 }) : []) {
    if (hits.has(person) || name === null || !wanted.every((word) => fold(name).includes(word))) continue
    const known = await store.people.personByUid(person.slice("person:".length))
    if (known && known.identities.length === 0)
      hits.set(person, { ref: person, name, identities: [], aliases: [], ties: [] })
  }
  const people = [...hits.keys()].filter((ref) => ref.startsWith("person:"))
  const ties = people.length === 0 ? {} : await store.people.ties(people)
  for (const hit of hits.values()) hit.ties = ties[hit.ref] ?? []
  const first = wanted.join(" ")
  const rank = (hit: PersonHit) => (fold(hit.name ?? "").startsWith(first) ? 0 : 1)
  const sorted = [...hits.values()].sort(
    (a, b) =>
      Number(b.ties.length > 0) - Number(a.ties.length > 0) ||
      rank(a) - rank(b) ||
      (a.name ?? "").localeCompare(b.name ?? "") ||
      a.ref.localeCompare(b.ref),
  )
  return { items: sorted.slice(0, limit), hasMore: sorted.length > limit, accounts }
}

export const peopleAnswer = (found: PeopleFound, limit: number) =>
  listAnswer("search people", {
    items: found.items,
    limit,
    has_more: found.hasMore,
    meta: { accounts: found.accounts.map(({ provider, account }) => `${provider}:${account}`) },
  })

export const peopleText = (found: PeopleFound) =>
  found.items
    .map((hit) =>
      [
        `${hit.ref}  ${hit.name ?? "(no name)"}${hit.aliases.length ? `  alias ${hit.aliases.join(", ")}` : ""}${hit.ties.length ? "" : "  no tie"}`,
        ...hit.identities.map(
          (one) =>
            `  ${one.provider}:${one.account}  ${one.id}  ${one.name ?? ""}${one.username ? `  @${one.username}` : ""}`,
        ),
      ].join("\n"),
    )
    .join("\n") || "nobody found"
