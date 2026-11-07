import { AGENT_INPUT_MAX_CHARS, type AgentInput } from "@wirecat/cli-core/cli"

const SKILL = "mail-triage"

/** cli-core cuts past its cap mid-text; this input stays under it with room for the lines the cut itself adds. */
export const INPUT_BUDGET = AGENT_INPUT_MAX_CHARS - 1_000

const FIELDS = [
  "ref",
  "chat_id",
  "sender_is_me",
  "text",
  "email.subject",
  "email.from",
  "email.fingerprint",
  "email.new_sender",
  "email.sender_identities",
  "email.bulk",
  "email.excerpt_only",
  "email.cursor",
  "email.findings_key",
].join(",")

interface Step {
  step?: string
  args?: Record<string, string>
}

interface Item {
  text?: string
  email?: { cursor?: string; findings_key?: string; [field: string]: unknown }
  [field: string]: unknown
}

interface Review {
  items?: Item[]
  missing?: { why?: string }[]
  meta?: { complete?: boolean }
  next?: Step[]
}

const stepArg = (review: Review, step: string, arg: string) =>
  review.next?.find((one) => one.step === step)?.args?.[arg]

/** The email as the agent sees it: the per-email cursor and key are this file's, not the agent's. */
const shown = (item: Item): string => {
  if (!item.email) return JSON.stringify(item)
  const { cursor: _cursor, findings_key: _key, ...email } = item.email
  return JSON.stringify({ ...item, email })
}

/** The batch's end at each email, in store order: emails that share a cursor go in or stay out together. */
interface Cut {
  cursor: string
  key: string | undefined
  items: Item[]
}

const cutsOf = (items: Item[]): Cut[] | undefined => {
  const cuts = new Map<string, Cut>()
  for (const item of items) {
    const cursor = item.email?.cursor
    if (!cursor) return undefined
    const cut = cuts.get(cursor) ?? { cursor, key: item.email?.findings_key, items: [] }
    cut.items.push(item)
    cuts.set(cursor, cut)
  }
  // A cursor is `<store id>.<read time>`, and one read gives one read time: the id orders them.
  return [...cuts.values()].sort((a, b) => Number.parseInt(a.cursor, 10) - Number.parseInt(b.cursor, 10))
}

const lines = (
  source: string,
  review: Review,
  { key, cursor, items, waiting }: { key?: string; cursor?: string; items: Item[]; waiting: number },
) => {
  const left = (review.missing ?? []).map((one) => one.why).filter(Boolean)
  return [
    `## ${source}`,
    ...(key ? [`key: ${key}`] : []),
    `cursor: ${cursor ?? "none"}`,
    waiting > 0
      ? `more mail waits past the cursor: true — ${waiting} emails did not fit this input; the next run reads them, ` +
        "do not review this mailbox again now"
      : `more mail waits past the cursor: ${review.meta?.complete === false}`,
    ...(left.length ? [`left out: ${left.join("; ")}`] : []),
    ...(items.some((item) => item.text_cut)
      ? [
          "text_cut: only the start of that email's text fits here; read it whole with " +
            "`memo messages show '<ref>' --trimmed --json` before you stage a finding from it",
        ]
      : []),
    items.length ? "emails, one JSON per line:" : "no emails; acknowledge the cursor.",
    ...items.map(shown),
  ].join("\n")
}

/** Text shorter than this tells the agent too little to act on; past the first mailbox it waits for a run with room. */
const LEAST_TEXT = 300

const startOf = (text: string, length: number) => {
  const end = /[\uD800-\uDBFF]/.test(text.charAt(length - 1)) ? length - 1 : length
  return text.slice(0, Math.max(0, end))
}

/** The group with every text cut to one share of the room, or `undefined` when a share is under `least`. */
const shortened = (items: Item[], room: number, least: number, block: (items: Item[]) => string) => {
  const longest = items.reduce((most, item) => Math.max(most, item.text?.length ?? 0), 0)
  const cut = (share: number) =>
    items.map((item) =>
      (item.text?.length ?? 0) <= share ? item : { ...item, text: startOf(item.text ?? "", share), text_cut: true },
    )
  let share = longest
  for (let over = block(cut(share)).length - room; over > 0; over = block(cut(share)).length - room) {
    if (share === 0) return undefined
    share = Math.max(0, share - Math.ceil(over / items.length))
  }
  return share < Math.min(least, longest) ? undefined : cut(share)
}

/**
 * One mailbox, compactly: the key and cursor the skill's steps 1 and 6 name, then one JSON line per email. Past
 * `room` it keeps the emails up to a cut in store order and gives that cut's cursor and key, so acknowledging them
 * never moves the mark past an email left out. When even the first cut does not fit, its texts are shortened to fit;
 * `alone` (nothing else shown yet) lets them go below `LEAST_TEXT`, so some mailbox always moves on.
 */
export const mailboxBlock = (source: string, review: Review, room = Number.POSITIVE_INFINITY, alone = false) => {
  const items = review.items ?? []
  const key = stepArg(review, "mail-findings.add", "key")
  const cursor = stepArg(review, "mail-messages.acknowledge", "cursor")
  const whole = lines(source, review, { key, cursor, items, waiting: 0 })
  if (whole.length <= room) return whole
  const cuts = cutsOf(items) ?? []
  let fit: string | undefined
  for (let end = 1; end < cuts.length; end++) {
    const kept = new Set(cuts.slice(0, end).flatMap((cut) => cut.items))
    const at = cuts[end - 1]
    const block = lines(source, review, {
      key: at?.key,
      cursor: at?.cursor,
      items: items.filter((item) => kept.has(item)),
      waiting: items.length - kept.size,
    })
    if (block.length > room) break
    fit = block
  }
  if (fit) return fit
  const [first] = cuts
  if (first) {
    const block = (group: Item[]) =>
      lines(source, review, {
        key: first.key,
        cursor: first.cursor,
        items: group,
        waiting: items.length - group.length,
      })
    const group = shortened(first.items, room, alone ? 0 : LEAST_TEXT, block)
    if (group) return block(group)
  }
  return `## ${source}\nno room in this input: do not acknowledge this mailbox and do not review it now; the next run reads it.`
}

const PREAMBLE =
  "Your first reads are below, already done: the mail-triage skill and each mailbox's review. Do not run " +
  "`memo skill show` or `memo mail review`. Start at step 2 of the skill. Stage each mailbox's findings in ONE " +
  "`memo mail findings add` call, all mailboxes in the same turn, without `--dry-run`. Then acknowledge each " +
  'mailbox\'s cursor (also a mailbox with nothing to stage) except one marked "do not acknowledge", then write the report.'

/**
 * What the scheduled mail-triage agent gets on its stdin: the skill and each mailbox's review, so it starts at the
 * triage and spends no turns reading them. It stays under `INPUT_BUDGET` by leaving whole emails out.
 */
export const mailTriageInput =
  (mailboxes: () => Promise<string[]>): AgentInput =>
  async (schedule, run) => {
    const holder = schedule.onNewMail
    if (!holder) return undefined
    const skill = await run(["skill", "show", SKILL])
    const parts = [PREAMBLE, "# The skill", skill.trim(), "# The review"]
    const separator = "\n\n"
    let used = parts.join(separator).length + separator.length * 2
    let alone = true
    for (const address of await mailboxes()) {
      const source = `email:${address}`
      const review = JSON.parse(
        await run(["mail", "review", "--holder", holder, "--source", source, `--json=${FIELDS}`]),
      ) as Review
      const block = mailboxBlock(source, review, INPUT_BUDGET - used - separator.length, alone)
      parts.push(block)
      used += block.length + separator.length
      if (block.includes("\nemails, one JSON per line:")) alone = false
    }
    return [...parts, ""].join(separator)
  }
