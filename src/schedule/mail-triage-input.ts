import type { AgentInput } from "@wirecat/cli-core/cli"

const SKILL = "mail-triage"

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
].join(",")

interface Step {
  step?: string
  args?: Record<string, string>
}

interface Review {
  items?: unknown[]
  missing?: { why?: string }[]
  meta?: { complete?: boolean }
  next?: Step[]
}

const stepArg = (review: Review, step: string, arg: string) =>
  review.next?.find((one) => one.step === step)?.args?.[arg]

/** One mailbox, compactly: the key and cursor the skill's steps 1 and 6 name, then one JSON line per email. */
export const mailboxBlock = (source: string, review: Review): string => {
  const items = review.items ?? []
  const key = stepArg(review, "mail-findings.add", "key")
  const cursor = stepArg(review, "mail-messages.acknowledge", "cursor")
  const left = (review.missing ?? []).map((one) => one.why).filter(Boolean)
  return [
    `## ${source}`,
    ...(key ? [`key: ${key}`] : []),
    `cursor: ${cursor ?? "none"}`,
    `more mail waits past the cursor: ${review.meta?.complete === false}`,
    ...(left.length ? [`left out: ${left.join("; ")}`] : []),
    items.length ? "emails, one JSON per line:" : "no emails; acknowledge the cursor.",
    ...items.map((item) => JSON.stringify(item)),
  ].join("\n")
}

const PREAMBLE =
  "Your first reads are below, already done: the mail-triage skill and each mailbox's review. Do not run " +
  "`memo skill show` or `memo mail review`. Start at step 2 of the skill. Stage each mailbox's findings in ONE " +
  "`memo mail findings add` call, all mailboxes in the same turn, without `--dry-run`. Then acknowledge each " +
  "mailbox's cursor (also a mailbox with nothing to stage), then write the report."

/**
 * What the scheduled mail-triage agent gets on its stdin: the skill and each mailbox's review, so it starts at the
 * triage and spends no turns reading them.
 */
export const mailTriageInput =
  (mailboxes: () => Promise<string[]>): AgentInput =>
  async (schedule, run) => {
    const holder = schedule.onNewMail
    if (!holder) return undefined
    const skill = await run(["skill", "show", SKILL])
    const blocks = []
    for (const address of await mailboxes()) {
      const source = `email:${address}`
      const review = JSON.parse(
        await run(["mail", "review", "--holder", holder, "--source", source, `--json=${FIELDS}`]),
      ) as Review
      blocks.push(mailboxBlock(source, review))
    }
    return [PREAMBLE, "# The skill", skill.trim(), "# The review", ...blocks, ""].join("\n\n")
  }
