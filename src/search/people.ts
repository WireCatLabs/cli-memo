import { CliError } from "@wirecat/cli-base"
import { formatReference } from "@wirecat/cli-core"
import type { AccountKey, MessageStore, PersonRecord } from "@wirecat/cli-core/store"
import { listAnswer } from "../answer.js"
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
}

export interface PeopleFound {
  items: PersonHit[]
  hasMore: boolean
  accounts: AccountKey[]
}

/** Notes folders hold no people. */
const NO_PEOPLE = new Set(["folder", "notes"])

/** Case, accents, ё and emoji variation marks fold away; SQLite's lower() folds ASCII only, so this runs here. */
export const fold = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()

const scopeOf = async (store: MessageStore, env: NodeJS.ProcessEnv, source: string | undefined) => {
  const keys = source === undefined ? await store.accounts.accounts() : await accountsOf(store, env, source)
  const held = keys.filter((key) => !NO_PEOPLE.has(key.provider))
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
      const hit = hits.get(ref) ?? { ref, name: person?.name ?? contact.name, identities: [], aliases: [] }
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
  const first = wanted.join(" ")
  const rank = (hit: PersonHit) => (fold(hit.name ?? "").startsWith(first) ? 0 : 1)
  const sorted = [...hits.values()].sort(
    (a, b) => rank(a) - rank(b) || (a.name ?? "").localeCompare(b.name ?? "") || a.ref.localeCompare(b.ref),
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
        `${hit.ref}  ${hit.name ?? "(no name)"}${hit.aliases.length ? `  alias ${hit.aliases.join(", ")}` : ""}`,
        ...hit.identities.map(
          (one) =>
            `  ${one.provider}:${one.account}  ${one.id}  ${one.name ?? ""}${one.username ? `  @${one.username}` : ""}`,
        ),
      ].join("\n"),
    )
    .join("\n") || "nobody found"
